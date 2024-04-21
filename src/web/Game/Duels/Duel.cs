using System.Collections.Immutable;
using System.Diagnostics;
using CardLab.Game.AssetPacking;
using CardLab.Game.Communication;
using CardLab.Game.Duels.Scripting;
using ILogger = Microsoft.Extensions.Logging.ILogger;

namespace CardLab.Game.Duels;

public sealed partial class Duel : IDisposable
{
    // Maximum amount of time that the client can request for extending the turn timer 
    public const int TimerPauseMaxMillis = 45 * 1000;

    // Some margin of error that allows the client to do stuff despite the timer being at 0 (client-side only!).
    public const int TimerClientMargin = 2300;

    // A small amount of time that delays the internal timer.
    public const int TimerServerMargin = 250;

    public DuelState State { get; private set; }

    // The number of mutations the state has gone through.
    public int StateIteration { get; private set; } = 0;

    public DuelSettings Settings { get; }
    public Dictionary<QualCardRef, CardDefinition> CardDatabase { get; } = new();

    public UserSocket P1Socket { get; }
    public string P1Name { get; }
    private readonly bool _myP1Socket;
    public UserSocket P2Socket { get; }
    public string P2Name { get; }
    private readonly bool _myP2Socket;

    private PlayerPair<bool> _ready = new(false);

    public Random Rand { get; } = new();

    public readonly object Lock = new();

    private int _unitIdSeq = 1;
    private int _cardIdSeq = 1;
    private int _modIdSeq = 1;

    public ILogger Logger { get; }

    public DuelMessageRouting Routing { get; }
    public (PlayerIndex, DuelRequestAckMessage)? AckPostMutation { get; set; } = null;

    private readonly Timer _turnTimer;
    private DateTime _turnTimerEnd = DateTime.MinValue;
    private TurnTimerState _turnTimerState = TurnTimerState.Off;
    private TimeSpan _turnTimerPausedRemaining = TimeSpan.Zero;
    private int _turnTimerPauseMinIteration = 0;

    private readonly Timer _pauseTimeoutTimer;

    public Duel(DuelSettings settings, ILoggerFactory loggerFac, string p1Name, string p2Name, UserSocket? p1Socket = null,
        UserSocket? p2Socket = null)
    {
        _turnTimer = new Timer(_ => OnTimerEnd());
        _pauseTimeoutTimer = new Timer(_ => UnpauseTurnTimer());

        Logger = loggerFac.CreateLogger(typeof(Duel));
        Settings = settings;
        PopulateCardDatabase();
        State = MakeStartState();

        Routing = new DuelMessageRouting(this);
        _myP1Socket = p1Socket is null;
        P1Socket = p1Socket ?? new UserSocket
        {
            ReceiveHandler = msg => Routing.ReceiveMessage(PlayerIndex.P1, msg),
            OnDisconnect = () => OnPlayerDisconnection(PlayerIndex.P1)
        };
        _myP2Socket = p2Socket is null;
        P1Name = p1Name;
        P2Socket = p2Socket ?? new UserSocket
        {
            ReceiveHandler = msg => Routing.ReceiveMessage(PlayerIndex.P2, msg),
            OnDisconnect = () => OnPlayerDisconnection(PlayerIndex.P2)
        };
        P2Name = p2Name;

        // todo: obvious validations (deck size, etc.)
    }

    public void ReportPlayerReady(PlayerIndex who)
    {
        CheckPlayer(who);

        lock (Lock)
        {
            if (State.Status != DuelStatus.AwaitingConnection)
            {
                return;
            }

            _ready[who] = true;

            if (_ready.P1 && _ready.P2)
            {
                SwitchToPlaying();
            }
        }
    }

    public void SwitchToPlaying()
    {
        lock (Lock)
        {
            if (State.Status != DuelStatus.AwaitingConnection)
            {
                throw new InvalidOperationException("Can't switch to playing from this status");
            }

            RunMutation(new ActGameStartRandom());
        }
    }

    public Result<Unit> PlayCard(PlayerIndex player, int cardId,
        ImmutableArray<DuelArenaPosition> slots,
        ImmutableArray<int> entities)
    {
        CheckPlayer(player);

        lock (Lock)
        {
            if (State.Status != DuelStatus.Playing)
            {
                return Result.Fail<Unit>("Pas encore en jeu.");
            }

            if (State.WhoseTurn != player)
            {
                return Result.Fail<Unit>("Ce n'est pas votre tour.");
            }

            var act = new ActPlayCard(player, cardId, slots, entities);
            if (!act.Verify(this))
            {
                return Result.Fail("Action impossible.");
            }

            RunMutation(act);

            return Result.Success();
        }
    }

    public Result<Unit> EndTurn(PlayerIndex? currentPlayer)
    {
        lock (Lock)
        {
            if (State.Status != DuelStatus.Playing)
            {
                return Result.Fail<Unit>("Pas encore en jeu.");
            }

            if (currentPlayer != null && currentPlayer != State.WhoseTurn)
            {
                return Result.Fail<Unit>("Ce n'est pas votre tour.");
            }

            RunMutation(new ActNextTurn());

            return Result.Success();
        }
    }

    public Result<Unit> UseUnitAttack(PlayerIndex player, int unitId, int targetId)
    {
        lock (Lock)
        {
            if (State.Status != DuelStatus.Playing)
            {
                return Result.Fail<Unit>("Pas encore en jeu.");
            }

            var act = new ActUseUnitAttack(player, unitId, targetId);
            if (!act.Verify(this))
            {
                return Result.Fail<Unit>("Action impossible.");
            }

            RunMutation(act);

            return Result.Success();
        }
    }

    public void Terminate()
    {
        lock (Lock)
        {
            if (State.Status == DuelStatus.Ended)
            {
                return;
            }

            RunMutation(new ActTerminateGame());
        }
    }

    private void PopulateCardDatabase()
    {
        foreach (var pack in Settings.Packs)
        {
            foreach (var cardAsset in pack.Cards)
            {
                CardDatabase.Add(new QualCardRef(pack.Id, cardAsset.Id), cardAsset.Definition);
            }
        }
    }

    private DuelState MakeStartState()
    {
        var cardDb = new Dictionary<int, DuelCard>();

        return new DuelState
        {
            Player1 = MakePlayerState(Settings.Player1Deck, PlayerIndex.P1),
            Player2 = MakePlayerState(Settings.Player2Deck, PlayerIndex.P2),
            Turn = 0,
            Cards = cardDb,
            WhoseTurn = PlayerIndex.P1 // this is completely bogus
        };

        DuelPlayerState MakePlayerState(ImmutableArray<QualCardRef> deck, PlayerIndex whoIdx)
        {
            var deckIds = new List<int>(deck.Length);
            foreach (var cardRef in deck)
            {
                // Register the card to the deck
                var card = MakeCard(cardRef);
                card.Location = whoIdx == PlayerIndex.P1 ? DuelCardLocation.DeckP1 : DuelCardLocation.DeckP2;
                cardDb.Add(card.Id, card);
                deckIds.Add(card.Id);
            }

            return new DuelPlayerState
            {
                Id = DuelIdentifiers.Create(DuelEntityType.Player, (int)whoIdx),
                Attribs = new DuelAttributeSetV2(DuelAttributesMeta.Base)
                {
                    [DuelBaseAttrs.CoreHealth] = Settings.MaxCoreHealth,
                    [DuelBaseAttrs.Energy] = 0,
                    [DuelBaseAttrs.MaxEnergy] = 0,
                    [DuelBaseAttrs.CardsPlayedThisTurn] = 0
                },
                Deck = deckIds,
                Units = new int?[Settings.UnitsX * Settings.UnitsY]
            };
        }
    }

    /**
     * Mutations
     */
    private void SubmitMutation(DuelMutation mut)
    {
        StateIteration++;

        if (mut.PendingTurnTimer is { } ptt)
        {
            StartTurnTimer(ptt);
        }
        else if (mut.PendingTurnTimerStop)
        {
            StopTurnTimer();
        }

        if (AckPostMutation is var (player, msg))
        {
            SendMessage(player, msg);
            AckPostMutation = null;
        }

        var deltas = mut.Deltas;
        // that isn't very accurate since we do proposition gen + json serialization after, but it's not a big deal
        var remainingTimerMillis = ClientRemainingTimerMillis;
        BroadcastMessage(p => new DuelMutatedMessage(
            PostProcessDeltas(deltas, p),
            State.WhoseTurn,
            GeneratePropositions(p),
            StateIteration,
            remainingTimerMillis
        ));
    }

    private void RunMutation(DuelAction act)
    {
        var sw = Stopwatch.StartNew();
        var mut = new DuelMutation(this, State, act);
        if (mut.Run())
        {
            SubmitMutation(mut);
        }

        sw.Stop();
        Logger.LogTrace("Mutation {Mutation} took {Elapsed}µs", act.GetType().Name,
            sw.ElapsedTicks / (Stopwatch.Frequency / 1_000_000));
    }
    /**
     * Timer stuff
     */
    private void OnTimerEnd()
    {
        lock (Lock)
        {
            StopTurnTimer();
            RunMutation(new ActNextTurn());
        }
    }

    private void StartTurnTimer(int secs)
    {
        var millis = secs * 1000 + TimerClientMargin + TimerServerMargin;

        _turnTimerEnd = DateTime.UtcNow.AddMilliseconds(millis);
        _turnTimer.Change(millis, Timeout.Infinite);
        _pauseTimeoutTimer.Change(Timeout.Infinite, Timeout.Infinite);
        _turnTimerPausedRemaining = TimeSpan.Zero;
        _turnTimerState = TurnTimerState.On;
        _turnTimerPauseMinIteration = 0;

        Logger.LogTrace("Started turn timer for player {Player} with {Seconds} seconds", State.WhoseTurn, secs);
    }

    private void PauseTurnTimer()
    {
        if (_turnTimerState == TurnTimerState.On && _turnTimerEnd < DateTime.UtcNow)
        {
            Logger.LogWarning("Turn timer didn't trigger during pause?? {End} < {Now}", _turnTimerEnd,
                DateTime.UtcNow);
            OnTimerEnd();
        }
        else if (_turnTimerState == TurnTimerState.On)
        {
            _turnTimer.Change(Timeout.Infinite, Timeout.Infinite);
            _turnTimerPausedRemaining = _turnTimerEnd - DateTime.UtcNow;
            _turnTimerState = TurnTimerState.Paused;

            _pauseTimeoutTimer.Change(TimerPauseMaxMillis, Timeout.Infinite);

            Logger.LogTrace("Paused turn timer for player {Player}", State.WhoseTurn);
        }
    }

    public void UserPauseTurnTimer(PlayerIndex player)
    {
        lock (Lock)
        {
            if (_turnTimerState == TurnTimerState.On
                && State.WhoseTurn == player
                && StateIteration >= _turnTimerPauseMinIteration)
            {
                PauseTurnTimer();
            }
            else
            {
                Logger.LogTrace(
                    "Pause request rejected for player {Player} (state={State}, iteration={Iteration}, minIteration={MinIt})",
                    player, _turnTimerState, StateIteration, _turnTimerPauseMinIteration);
            }
        }
    }

    private void UnpauseTurnTimer()
    {
        if (_turnTimerState == TurnTimerState.Paused)
        {
            var remain = _turnTimerPausedRemaining;

            _turnTimerEnd = DateTime.UtcNow.Add(remain);
            _turnTimer.Change(remain, Timeout.InfiniteTimeSpan);
            _turnTimerPausedRemaining = TimeSpan.Zero;
            _turnTimerState = TurnTimerState.On;
            _turnTimerPauseMinIteration = StateIteration + 1;

            _pauseTimeoutTimer.Change(Timeout.Infinite, Timeout.Infinite);

            BroadcastMessage(new DuelTimerUpdated(
                Math.Max(0, (int)remain.TotalMilliseconds - TimerClientMargin)));

            Logger.LogTrace("Turn timer resumed for player {Player}", State.WhoseTurn);
        }
    }

    public void UserUnpauseTurnTimer(PlayerIndex player)
    {
        lock (Lock)
        {
            if (_turnTimerState == TurnTimerState.Paused && State.WhoseTurn == player)
            {
                UnpauseTurnTimer();
            }
            else
            {
                Logger.LogTrace("Unpause request rejected for player {Player} (state={State})", player,
                    _turnTimerState);
            }
        }
    }

    private void StopTurnTimer()
    {
        _turnTimer.Change(Timeout.Infinite, Timeout.Infinite);
        _pauseTimeoutTimer.Change(Timeout.Infinite, Timeout.Infinite);
        _turnTimerState = TurnTimerState.Off;
    }

    // Put some margin of error so the client doesn't get surprised when the timer runs out at
    // what it believed was 0:01.
    private int? ClientRemainingTimerMillis => _turnTimerState switch
    {
        TurnTimerState.On => Math.Max(0, (int)(_turnTimerEnd - DateTime.UtcNow).TotalMilliseconds - TimerClientMargin),
        TurnTimerState.Paused => Math.Max(0, (int)_turnTimerPausedRemaining.TotalMilliseconds - TimerClientMargin),
        _ => null
    };

    /**
     * Messaging
     */
    public void SendMessage(PlayerIndex player, DuelMessage message)
    {
        var socket = player == PlayerIndex.P1 ? P1Socket : P2Socket;
        socket.SendMessage(message);
    }

    private void BroadcastMessage(DuelMessage message)
    {
        P1Socket.SendMessage(message);
        P2Socket.SendMessage(message);
    }

    private void BroadcastMessage(Func<PlayerIndex, DuelMessage> message)
    {
        P1Socket.SendMessage(message(PlayerIndex.P1));
        P2Socket.SendMessage(message(PlayerIndex.P2));
    }

    public DuelWelcomeMessage MakeWelcomeMessage(PlayerIndex playerIndex)
    {
        lock (Lock)
        {
            return new DuelWelcomeMessage(
                Sanitize(State, playerIndex),
                GeneratePropositions(playerIndex),
                StateIteration,
                playerIndex,
                P1Name,
                P2Name,
                ClientRemainingTimerMillis
            );
        }
    }

    // to be called
    public void OnPlayerDisconnection(PlayerIndex player)
    {
        lock (Lock)
        {
            if (State.WhoseTurn == player && State.Status == DuelStatus.Playing)
            {
                UnpauseTurnTimer();
            }
        }
    }

    /**
     * Utilities
     */
    
    // The "virtual card" thing is a hack to create cards for DeployUnit filters.
    public DuelCard MakeCard(QualCardRef c, bool virtualCard = false)
    {
        var def = ResolveCardRef(c);

        DuelAttributeSetV2 attributes = new DuelAttributeSetV2(DuelAttributesMeta.Base)
        {
            [DuelBaseAttrs.Cost] = def.Cost
        };

        if (def.Type == CardType.Unit)
        {
            attributes[DuelBaseAttrs.Attack] = def.Attack;
            attributes[DuelBaseAttrs.Health] = def.Health;
        }

        var card = new DuelCard
        {
            Id = virtualCard ? -1 : DuelIdentifiers.Create(DuelEntityType.Card, _cardIdSeq++),
            BaseDefRef = c,
            Requirement = def.Requirement,
            Attribs = attributes,
            Type = def.Type,
            NormalizedArchetype = def.NormalizedArchetype
        };
        card.Script = CreateScript(card, card);
        return card;
    }

    private DuelUnit MakeUnit(DuelCard card, PlayerIndex owner)
    {
        // Once the unit is summonned, the modifiers are "solidifed" and part of the base definition
        // of the unit.
        var unit = new DuelUnit
        {
            Id = DuelIdentifiers.Create(DuelEntityType.Unit, _unitIdSeq++),
            OriginRef = card.BaseDefRef,
            OriginStats = card.Attribs.Snapshot(),
            Owner = owner,
            Position = new(PlayerIndex.P1, new DuelGridVec(0, 0)),
            Attribs = new DuelAttributeSetV2(DuelAttributesMeta.Base)
            {
                [DuelBaseAttrs.Attack] = card.Attribs[DuelBaseAttrs.Attack],
                [DuelBaseAttrs.Health] = card.Attribs[DuelBaseAttrs.Health],
                [DuelBaseAttrs.MaxHealth] = card.Attribs[DuelBaseAttrs.Health],
                [DuelBaseAttrs.ActionsLeft] = 0,
                [DuelBaseAttrs.InactionTurns] = 1,
                [DuelBaseAttrs.ActionsPerTurn] = 1
            },
            NormalizedArchetype = card.NormalizedArchetype
        };
        // Yes, the script is the same for the unit and the card.
        unit.Script = CreateScript(unit, card);
        return unit;
        // todo: apply traits that modify actionsleft/inactionturns
    }

    private DuelScript? CreateScript(IEntity entity, DuelCard card)
    {
        var script = ResolveCardRef(card.BaseDefRef).Script;

        if (script is null)
        {
            return null;
        }

        if (script.SpecialId is { } spId)
        {
            return SpecialDuelScripts.Scripts.Count > spId ? SpecialDuelScripts.Scripts[spId](this, entity) : null;
        }
        else if (entity is DuelUnit u)
        {
            return new UserDuelScript(this, u, script);
        }
        else
        {
            return null;
        }
    }

    private CardDefinition ResolveCardRef(QualCardRef c)
    {
        // Should obviously be optimized later on.
        return CardDatabase[c];
    }

    private static DuelState Sanitize(DuelState state, PlayerIndex player)
    {
        CheckPlayer(player);
        // todo: very hacky... find some other way
        // first "clone" the state in a very vague way
        state = state with { };

        var hidden = ImmutableArray.CreateBuilder<int>();
        var shown = ImmutableDictionary.CreateBuilder<int, DuelCard>();

        foreach (var card in state.Cards.Values)
        {
            // after the mutation finishes, we don't really care about discarded cards,
            // they never come back from their grave, so, to save up bandwidth, let's not send them.
            if (card.Revealed[player] && card.Location != DuelCardLocation.Discarded)
            {
                shown.Add(card.Id, card);
            }
            else
            {
                hidden.Add(card.Id);
            }
        }

        state.HiddenCards = hidden.ToImmutable();
        state.KnownCards = shown.ToImmutable();

        return state;
    }

    private static DuelStateDelta Sanitize(DuelStateDelta delta, PlayerIndex player)
    {
        DuelStateDelta d2 = delta switch
        {
            RevealCardsDelta { CardSnapshots: var cards } => new RevealCardsDelta
            {
                HiddenCards = cards
                    .Where(x => !x.card.Revealed[player] && x.prevReveal[player])
                    .Select(x => x.card.Id).ToImmutableArray(),

                RevealedCards = cards
                    .Where(x => x.card.Revealed[player] && !x.prevReveal[player])
                    .Select(x => x.card)
                    .ToImmutableArray()
            },
            _ => delta
        };

        return d2;
    }

    private static bool DeltaRelevant(DuelStateDelta delta)
    {
        if (delta is RevealCardsDelta { HiddenCards: [], RevealedCards: [] })
        {
            return false;
        }

        return true;
    }

    private List<DuelStateDelta> PostProcessDeltas(List<DuelStateDelta> deltas, PlayerIndex player)
    {
        var processed = new List<DuelStateDelta>(deltas.Count);
        foreach (var delta in deltas)
        {
            var newDelta = Sanitize(delta, player);
            if (DeltaRelevant(newDelta))
            {
                processed.Add(newDelta);
            }
        }

        return processed;
    }

    private static void CheckPlayer(PlayerIndex player)
    {
        if (player != PlayerIndex.P1 && player != PlayerIndex.P2)
        {
            throw new ArgumentException($"Invalid player (player={player}).", nameof(player));
        }
    }


    public void Dispose()
    {
        lock (Lock)
        {
            State.Status = DuelStatus.Ended;
            if (_myP1Socket)
                P1Socket.StopConnection(P1Socket.ConnectionId);
            if (_myP2Socket)
                P2Socket.StopConnection(P2Socket.ConnectionId);
            _turnTimer.Dispose();
        }
    }
}

public sealed record DuelSettings
{
    public int MaxCoreHealth { get; init; } = 35;
    public int MaxEnergy { get; init; } = 999;
    public int SecondsPerTurn { get; init; } = 40;
    public int StartCards { get; init; } = 5;
    
    public int MaxCardsInHand { get; init; } = 9;

    public int UnitsX { get; init; } = 4;
    public int UnitsY { get; init; } = 2;

    public required ImmutableArray<GamePack> Packs { get; init; }
    public required ImmutableArray<QualCardRef> Player1Deck { get; init; }
    public required ImmutableArray<QualCardRef> Player2Deck { get; init; }
}

public enum DuelStatus : byte
{
    AwaitingConnection,
    Playing,
    Ended
}

public enum TurnTimerState : byte
{
    Off,
    Paused,
    On
}