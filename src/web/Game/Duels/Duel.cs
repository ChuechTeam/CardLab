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
    public DuelAttributes Attributes { get; }

    public UserSocket P1Socket { get; }
    public UserSocket P2Socket { get; }

    private PlayerPair<bool> _ready = new(false);

    private readonly Random _rand = new();

    public readonly object Lock = new();

    private int _unitIdSeq = 1;
    private int _cardIdSeq = 1;
    private int _modIdSeq = 1;

    private readonly ILogger _logger;

    public DuelMessageRouting Routing { get; }
    public (PlayerIndex, DuelRequestAckMessage)? AckPostMutation { get; set; } = null;

    // TODO: Timer

    public Duel(DuelSettings settings, ILogger logger, UserSocket? p1Socket = null, UserSocket? p2Socket = null)
    {
        _logger = logger;
        Settings = settings;
        Attributes = new DuelAttributes(settings);
        State = MakeStartState();

        Routing = new DuelMessageRouting(this);
        P1Socket = p1Socket ?? new UserSocket { ReceiveHandler = msg => Routing.ReceiveMessage(PlayerIndex.P1, msg) };
        P2Socket = p2Socket ?? new UserSocket { ReceiveHandler = msg => Routing.ReceiveMessage(PlayerIndex.P2, msg) };

        // todo: obvious validations (deck size, etc.)
    }

    public void ReportPlayerReady(PlayerIndex who)
    {
        CheckPlayer(who);

        lock (Lock)
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
        lock (Lock)
        {
            if (State.Status != DuelStatus.AwaitingConnection)
            {
                throw new InvalidOperationException("Can't switch to playing from this status");
            }

            // yeah... no need :)
            // if (!_ready.P1 || !_ready.P2)
            // {
            //     throw new InvalidOperationException("Both players must be ready");
            // }

            RunMutation(m => m.ApplyFrag(new ActGameStartRandom()));
        }
    }

    public Result<Unit> PlayUnitCard(PlayerIndex player, int cardId, DuelGridVec placement)
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

            var act = new ActPlayUnitCard(player, cardId, placement);
            if (!act.Verify(this))
            {
                return Result.Fail("Action impossible.");
            }

            RunMutation(m => m.ApplyFrag(act));

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

            RunMutation(x => x.ApplyFrag(new ActNextTurn()));

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

            RunMutation(x => x.ApplyFrag(act));

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
                Id = DuelIdentifiers.Create(DuelEntityType.Player, (int)whoIdx),
                Attribs = new DuelAttributeSet
                {
                    [Attributes.CoreHealth] = Settings.MaxCoreHealth,
                    [Attributes.Energy] = 0,
                    [Attributes.MaxEnergy] = 0
                },
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
        mut.FlushPendingAttrDeltas();
        
        if (mut.Deltas.Count == 0)
        {
            return;
        }

        StateIteration++;

        var deltas = mut.Deltas;
        if (AckPostMutation is var (player, msg))
        {
            SendMessage(player, msg);
            AckPostMutation = null;
        }
        
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
                Id = DuelIdentifiers.Create(DuelEntityType.Card, _cardIdSeq++),
                BaseDefRef = c,
                Attribs = new DuelAttributeSet
                {
                    [Attributes.Attack] = def.Attack,
                    [Attributes.Health] = def.Health,
                    [Attributes.Cost] = def.Cost
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
            Id = DuelIdentifiers.Create(DuelEntityType.Unit, _unitIdSeq++),
            OriginRef = card.BaseDefRef,
            OriginStats = card.Attribs, // todo: clone
            OriginTraits = [..card.Traits],
            Owner = owner,
            Position = new(PlayerIndex.P1, new DuelGridVec(0, 0)),
            Attribs = new DuelAttributeSet
            {
                [Attributes.Attack] = card.Attribs[Attributes.Attack],
                [Attributes.Health] = card.Attribs[Attributes.Health],
                [Attributes.MaxHealth] = card.Attribs[Attributes.Health],
                [Attributes.ActionsLeft] = 0,
                [Attributes.InactionTurns] = 1,
                [Attributes.ActionsPerTurn] = 1
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
    Playing,
    Ended
}

public class DuelMutation(Duel duel, DuelState state)
{
    public List<DuelStateDelta> Deltas { get; init; } = [];

    private readonly Dictionary<int, Dictionary<string, object>> _pendingAttrChanges = new();

    // We have to make an exception for attributes because else it's going to be a nightmare
    // Throws when the attribute isn't present.
    // Returns true when the attribute changed.
    public bool SetAttributeBaseValue(IEntity entity, DuelAttributeDefinition def, int value, out int newVal)
    {
        var attribs = entity.Attribs;
        var prev = attribs[def];
        attribs.SetBaseValue(def, value, out newVal);
        if (prev != newVal)
        {
            if (!_pendingAttrChanges.ContainsKey(entity.Id))
            {
                _pendingAttrChanges.Add(entity.Id, new Dictionary<string, object>());
            }

            if (!_pendingAttrChanges[entity.Id].TryAdd(def.Key, newVal))
            {
                _pendingAttrChanges[entity.Id][def.Key] = newVal;
            }

            return true;
        }
        else
        {
            return false;
        }
    }

    // todo: Modifier stuff

    public Result<Unit> Apply(DuelStateDelta delta)
    {
        FlushPendingAttrDeltas();
        
        var res = delta.Apply(duel, state);

        if (res.Succeeded)
        {
            Deltas.Add(delta);
        }

        return res;
    }

    public void FlushPendingAttrDeltas()
    {
        if (_pendingAttrChanges.Count != 0)
        {
            foreach (var (key, value) in _pendingAttrChanges)
            {
                Deltas.Add(new UpdateEntityAttribsDelta
                {
                    EntityId = key,
                    Attribs = value
                });
            }
        }
        _pendingAttrChanges.Clear();
    }

    public DuelFragmentResult ApplyFrag(DuelFragment f)
    {
        return duel.ApplyFrag2(this, f);
    }
}