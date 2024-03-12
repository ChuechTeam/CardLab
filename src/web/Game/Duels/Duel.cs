using System.Collections.Immutable;
using CardLab.Game.AssetPacking;
using CardLab.Game.Communication;
using Medallion.Collections;
using Microsoft.Build.Framework;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using ILogger = Microsoft.Extensions.Logging.ILogger;

namespace CardLab.Game.Duels;

public sealed partial class Duel : IDisposable
{
    public DuelState State { get; private set; }

    // The number of mutations the state has gone through.
    public int StateIteration { get; private set; } = 0;

    // For now, we'll skip the "choosing cards" phase and instead directly pick some cards.
    //public DuelStatus Status { get; private set; } = DuelStatus.AwaitingConnection;
    public PlayerIndex? Winner { get; private set; } = null;
    public DuelSettings Settings { get; }

    public UserSocket P1Socket { get; }
    public UserSocket P2Socket { get; }

    private PlayerPair<bool> _ready = new(false);

    private readonly Random _rand = new();

    private readonly object _lock = new();

    private int _unitIdSeq = 1;
    private int _cardIdSeq = 1;
    private int _modIdSeq = 1;

    private readonly ILogger _logger;

    // TODO: Timer

    public Duel(DuelSettings settings, ILogger logger, UserSocket? p1Socket = null, UserSocket? p2Socket = null)
    {
        _logger = logger;
        Settings = settings;
        State = MakeStartState();

        P1Socket = p1Socket ?? new UserSocket();
        P2Socket = p2Socket ?? new UserSocket();

        _logger.LogTrace("Hello from duel!");

        // todo: obvious validations (deck size, etc.)
    }

    public void ReportPlayerReady(PlayerIndex who)
    {
        CheckPlayer(who);

        lock (_lock)
        {
            _ready[who] = true;

            if (_ready.P1 && _ready.P2)
            {
                SwitchToPlaying();
            }
        }
    }

    public void SwitchToPlaying()
    {
        lock (_lock)
        {
            if (State.Status != DuelStatus.ChoosingCards && State.Status != DuelStatus.AwaitingConnection)
            {
                throw new InvalidOperationException("Can't switch to playing from this status");
            }

            // yeah... no need :)
            // if (!_ready.P1 || !_ready.P2)
            // {
            //     throw new InvalidOperationException("Both players must be ready");
            // }
            
            RunMutation(m => m.ApplyAct(new ActGameStartRandom()));
        }
    }

    public Result<Unit> PlayUnitCard(PlayerIndex player, int cardId, DuelGridVec placement)
    {
        CheckPlayer(player);

        lock (_lock)
        {
            if (State.Status != DuelStatus.Playing)
            {
                return Result.Fail<Unit>("Pas encore en jeu.");
            }

            var state = State;
            var playerState = state.GetPlayer(player);
            var card = State.FindCard(playerState.Hand.FirstOrDefault(c => c == cardId));
            if (card is not UnitDuelCard unitCard)
            {
                return Result.Fail<Unit>("Carte invalide.");
            }
            
            var act = new ActPlayUnitCard(player, unitCard, placement);
            if (!act.CanDo(this))
            {
                return Result.Fail("Action impossible.");
            }

            RunMutation(m => m.ApplyAct(act));

            return Result.Success();
        }
    }

    public Result<Unit> EndTurn(PlayerIndex? currentPlayer)
    {
        lock (_lock)
        {
            if (State.Status != DuelStatus.Playing)
            {
                return Result.Fail<Unit>("Pas encore en jeu.");
            }

            if (currentPlayer != null && currentPlayer != State.WhoseTurn)
            {
                return Result.Fail<Unit>("Ce n'est pas votre tour.");
            }

            RunMutation(x => ApplyAct(x, new ActNextTurn()));

            return Result.Success();
        }
    }

    public Result<Unit> UseUnitAttack(PlayerIndex player, int unitId, DuelTarget target)
    {
        lock (_lock)
        {
            if (State.Status != DuelStatus.Playing)
            {
                return Result.Fail<Unit>("Pas encore en jeu.");
            }

            var unit = State.FindUnit(unitId);
            if (unit == null || unit.Owner != player)
            {
                return Result.Fail<Unit>("Unité invalide.");
            }

            var act = new ActUseUnitAttack(unit, target);
            if (!act.CanDo(this))
            {
                return Result.Fail<Unit>("Action impossible.");
            }

            RunMutation(x => ApplyAct(x, act));

            return Result.Success();
        }
    }
    
    private DuelState MakeStartState()
    {
        var cardDb = new Dictionary<int, DuelCard>();

        DuelPlayerState MakePlayerState(ImmutableArray<QualCardRef> deck, PlayerIndex whoIdx)
        {
            var cards = deck.Select(MakeCard).ToList();
            foreach (var card in cards)
            {
                // Register the card to the deck
                card.Location = whoIdx == PlayerIndex.P1 ? DuelCardLocation.DeckP1 : DuelCardLocation.DeckP2;
                cardDb.Add(card.Id, card);
            }

            return new DuelPlayerState
            {
                CoreHealth = Settings.MaxCoreHealth,
                Energy = 0,
                MaxEnergy = 0,
                Deck = cards.Select(x => x.Id).ToList(),
                Units = new int?[Settings.UnitsX * Settings.UnitsY]
            };
        }

        return new DuelState
        {
            Player1 = MakePlayerState(Settings.Player1Deck, PlayerIndex.P1),
            Player2 = MakePlayerState(Settings.Player2Deck, PlayerIndex.P2),
            Turn = 0,
            Cards = cardDb,
            WhoseTurn = PlayerIndex.P1 // this is completely bogus
        };
    }

    /**
     * Mutations
     */
    private void SubmitMutation(DuelMutation mut)
    {
        if (mut.Deltas.Count == 0)
        {
            return;
        }

        StateIteration++;

        var deltas = mut.Deltas;
        BroadcastMessage(p => new DuelMutatedMessage(
            deltas.Select(d => Sanitize(d, p)).Where(DeltaRelevant).ToList(),
            GeneratePropositions(p),
            StateIteration
        ));
    }

    private void RunMutation(Action<DuelMutation> act)
    {
        var mut = new DuelMutation(this, State);
        act(mut);
        SubmitMutation(mut);
    }


    /**
     * Messaging
     */
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
        lock (_lock)
        {
            return new DuelWelcomeMessage(
                Sanitize(State, playerIndex),
                GeneratePropositions(playerIndex),
                StateIteration,
                playerIndex
            );
        }
    }

    /**
     * Utilities
     */
    private DuelCard MakeCard(QualCardRef c)
    {
        var def = ResolveCardRef(c);
        if (def.Type == CardType.Unit)
        {
            return new UnitDuelCard
            {
                Id = _cardIdSeq++,
                BaseDefRef = c,
                Cost = def.Cost,
                Stats = new DuelCardStats
                {
                    Attack = def.Attack,
                    Health = def.Health
                },
                Traits = def.Traits.ToList()
            };
        }
        else
        {
            throw new NotSupportedException("oh no");
        }
    }

    private DuelUnit MakeUnit(UnitDuelCard card, PlayerIndex owner)
    {
        // Once the unit is summonned, the modifiers are "solidifed" and part of the base definition
        // of the unit.
        return new DuelUnit
        {
            Id = _unitIdSeq++,
            OriginRef = card.BaseDefRef,
            OriginStats = card.Stats,
            OriginTraits = card.Traits.ToImmutableArray(),
            Owner = owner,
            Attribs =
                new DuelUnitAttribs
                {
                    Attack = card.Stats.Attack,
                    CurHealth = card.Stats.Health,
                    MaxHealth = card.Stats.Health,
                    Traits = card.Traits,
                    ActionsLeft = 0,
                    InactionTurns = 1,
                    ActionsPerTurn = 1 // soon: function of traits
                }
        };
        // todo: apply traits that modify actionsleft/inactionturns
    }

    private CardDefinition ResolveCardRef(QualCardRef c)
    {
        // Should obviously be optimized later on.
        return Settings.Packs.First(x => x.Id == c.PackId).CardMap[c.CardId].Definition;
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
            if (card.Revealed[player])
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

    private static T Sanitize<T>(T delta, PlayerIndex player) where T : DuelStateDelta
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

        return (T)d2;
    }

    private static bool DeltaRelevant(DuelStateDelta delta)
    {
        if (delta is RevealCardsDelta { HiddenCards: [], RevealedCards: [] })
        {
            return false;
        }

        return true;
    }

    private static void CheckPlayer(PlayerIndex player)
    {
        if (player != PlayerIndex.P1 && player != PlayerIndex.P2)
        {
            throw new ArgumentException($"Invalid player (player={player}).", nameof(player));
        }
    }

    
    // dirty, just for testing
    public void Dispose()
    {
        State.Status = DuelStatus.Ended;
        P1Socket.StopConnection(P1Socket.ConnectionId);
        P2Socket.StopConnection(P2Socket.ConnectionId);
    }
}

public sealed record DuelSettings
{
    public int MaxCoreHealth { get; init; } = 35;
    public int MaxEnergy { get; init; } = 999;
    public int SecondsPerTurn { get; init; } = 40;
    public int StartCards { get; init; } = 5;

    public int UnitsX { get; init; } = 4;
    public int UnitsY { get; init; } = 2;

    public required ImmutableArray<GamePack> Packs { get; init; }
    public required ImmutableArray<QualCardRef> Player1Deck { get; init; }
    public required ImmutableArray<QualCardRef> Player2Deck { get; init; }
}

public enum DuelStatus
{
    AwaitingConnection,
    ChoosingCards,
    Playing,
    Ended
}

public class DuelMutation(Duel duel, DuelState state)
{
    public List<DuelStateDelta> Deltas { get; init; } = [];

    public Result<Unit> Apply(DuelStateDelta delta)
    {
        var res = delta.Apply(duel, state);

        if (res.Succeeded)
        {
            Deltas.Add(delta);
        }

        return res;
    }

    public T ApplyFrag<T>(DuelFragment2<T> f)
    {
        return duel.ApplyFrag2(this, f);
    }

    public void ApplyAct(DuelAction act)
    {
        duel.ApplyAct(this, act);
    }
}