using System.Collections.Immutable;
using CardLab.Game.AssetPacking;
using CardLab.Game.Communication;
using Medallion.Collections;
using Microsoft.Build.Framework;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using ILogger = Microsoft.Extensions.Logging.ILogger;

namespace CardLab.Game.Duels;

public sealed partial class Duel
{
    public DuelState State { get; private set; }

    // The number of mutations the state has gone through.
    public int StateIteration { get; private set; } = 0;

    // For now, we'll skip the "choosing cards" phase and instead directly pick some cards.
    public DuelStatus Status { get; private set; } = DuelStatus.AwaitingConnection;
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
            if (Status != DuelStatus.ChoosingCards && Status != DuelStatus.AwaitingConnection)
            {
                throw new InvalidOperationException("Can't switch to playing from this status");
            }

            // yeah... no need :)
            // if (!_ready.P1 || !_ready.P2)
            // {
            //     throw new InvalidOperationException("Both players must be ready");
            // }

            Status = DuelStatus.Playing;
            BroadcastMessage(new DuelStatusChangedMessage(DuelStatus.Playing));
            RunMutation(m => ApplyActOpt(m, ActGameStartRandom()));
        }
    }

    public Result<Unit> PlayUnitCard(PlayerIndex player, int cardId, int placementIdx)
    {
        CheckPlayer(player);

        lock (_lock)
        {
            if (Status != DuelStatus.Playing)
            {
                return Result.Fail<Unit>("Pas encore en jeu.");
            }

            var state = State;
            var playerState = state.GetPlayer(player);
            var card = playerState.Hand.FirstOrDefault(c => c.Id == cardId);
            if (card is not UnitDuelCard unitCard)
            {
                return Result.Fail<Unit>("Carte invalide.");
            }
            
            if (placementIdx < 0 || state.GetPlayer(player).Units.Length < placementIdx)
            {
                return Result.Fail<Unit>("Emplacement invalide");
            }
            
            var mut = new DuelMutation(State);
            var act = ActPlayUnitCard(player, unitCard, placementIdx);
            SubmitMutation(ApplyActOpt(mut, act));

            return Result.Success();
        }
    }

    public Result<Unit> EndTurn(PlayerIndex? currentPlayer)
    {
        lock (_lock)
        {
            if (Status != DuelStatus.Playing)
            {
                return Result.Fail<Unit>("Pas encore en jeu.");
            }

            if (currentPlayer != null && currentPlayer != State.WhoseTurn)
            {
                return Result.Fail<Unit>("Ce n'est pas votre tour.");
            }

            RunMutation(x => ApplyActOpt(x, ActNextTurn()));

            return Result.Success();
        }
    }

    private DuelState MakeStartState()
    {
        DuelPlayerState MakePlayerState(ImmutableArray<QualCardRef> deck)
        {
            return new DuelPlayerState
            {
                CoreHealth = Settings.MaxCoreHealth,
                Energy = 0,
                MaxEnergy = 0,
                Deck = ImmutableStack.Create(deck.Select(MakeCard).ToArray()),
                CardsInDeck = deck.Length,
                CardsInHand = 0,
                Hand = ImmutableArray<DuelCard>.Empty
            };
        }

        return new DuelState
        {
            Player1 = MakePlayerState(Settings.Player1Deck),
            Player2 = MakePlayerState(Settings.Player2Deck),
            Turn = 0,
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

        State = mut.State;
        StateIteration++;

        var deltas = mut.Deltas;
        BroadcastMessage(p => new DuelMutatedMessage(
            deltas.Select(d => Sanitize(d, p)).ToList(),
            Sanitize(State, p),
            StateIteration
        ));
    }

    private void RunMutation(Func<DuelMutation, DuelMutation> act)
    {
        SubmitMutation(act(new DuelMutation(State)));
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
                StateIteration,
                Status
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
                AppliedModifiers = ImmutableArray<(int id, UnitDuelCardModifier mod)>.Empty,
                BaseDefRef = c,
                Cost = def.Cost,
                Stats = new DuelCardStats
                {
                    Attack = def.Attack,
                    Health = def.Health
                },
                Traits = def.Traits
            };
        }
        else
        {
            throw new NotSupportedException("oh no");
        }
    }

    private DuelUnit MakeUnit(UnitDuelCard card)
    {
        // Once the unit is summonned, the modifiers are "solidifed" and part of the base definition
        // of the unit.
        return new DuelUnit
        {
            Id = _unitIdSeq++,
            OriginRef = card.BaseDefRef,
            OriginStats = card.Stats,
            OriginTraits = card.Traits,
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
                },
            AppliedModifiers = ImmutableArray<(int id, DuelUnitModifier mod)>.Empty
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

        return state with
        {
            Player1 = player == PlayerIndex.P2 ? ClearHand(state.Player1) : state.Player1,
            Player2 = player == PlayerIndex.P1 ? ClearHand(state.Player2) : state.Player2,
        };

        static DuelPlayerState ClearHand(DuelPlayerState p) => p with { Hand = ImmutableArray<DuelCard>.Empty };
    }

    private static T Sanitize<T>(T delta, PlayerIndex player) where T : DuelStateDelta
    {
        DuelStateDelta d2 = delta switch
        {
            DrawDeckCardsDelta d => d with
            {
                Cards = new PlayerPair<ImmutableArray<DuelCard>>
                {
                    P1 = player == PlayerIndex.P2 ? ImmutableArray<DuelCard>.Empty : d.Cards.P1,
                    P2 = player == PlayerIndex.P1 ? ImmutableArray<DuelCard>.Empty : d.Cards.P2
                }
            },
            _ => delta
        };

        return (T)d2;
    }

    private static void CheckPlayer(PlayerIndex player)
    {
        if (player != PlayerIndex.P1 && player != PlayerIndex.P2)
        {
            throw new ArgumentException($"Invalid player (player={player}).", nameof(player));
        }
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

public readonly record struct DuelMutation(DuelState State)
{
    public ImmutableLinkedList<DuelStateDelta> Deltas { get; init; } = [];

    public Result<DuelMutation> Apply(DuelStateDelta delta)
    {
        var res = delta.Apply(State);
        if (res.SucceededWith(out var newState))
        {
            return new DuelMutation
            {
                State = newState,
                Deltas = Deltas.Append(delta)
            };
        }

        return Result.Fail<DuelMutation>(res.Error!);
    }

    public T Map<T>(Func<DuelMutation, T> map)
    {
        return map(this);
    }
}