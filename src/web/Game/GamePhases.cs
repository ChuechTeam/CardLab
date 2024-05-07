using System.Collections.Immutable;
using System.Runtime.InteropServices;
using CardLab.Game.AssetPacking;
using CardLab.Game.BasePacks;
using CardLab.Game.Communication;

namespace CardLab.Game;

public enum GamePhaseName
{
    WaitingForPlayers,
    Tutorial,
    CreatingCards,
    Preparation,
    Duels,
    Ended,
    Terminated
}

public abstract record GamePhase(GameSession Session, GamePhaseName Name)
{
    public virtual void OnStart()
    {
    }

    public virtual void PostStart()
    {
    }

    public virtual void OnEnd()
    {
    }

    public virtual PhaseStatePayload? GetStateForHost()
    {
        return null;
    }

    public virtual IEnumerable<PhaseStatePayload>? GetStateForPlayers(IEnumerable<Player> players)
    {
        return null;
    }

    public PhaseStatePayload? GetStateForUser(Player? player)
    {
        if (player == null)
        {
            return GetStateForHost();
        }
        else
        {
            return GetStateForPlayers(new[] { player })?.First();
        }
    }
}

public sealed record WaitingForPlayersPhase(GameSession Session) : GamePhase(Session, GamePhaseName.WaitingForPlayers)
{
    public override PhaseStatePayload GetStateForHost()
    {
        var payload = new WaitingForPlayersStatePayload(
            Session.Code,
            Session.Players.Values.Select(p => new PlayerPayload(p.Id, p.Name))
                .ToImmutableArray());

        return payload;
    }

    public override IEnumerable<PhaseStatePayload> GetStateForPlayers(IEnumerable<Player> players)
    {
        var state = GetStateForHost();

        foreach (var _ in players)
        {
            yield return state;
        }
    }
}

public sealed record TutorialPhase(GameSession Session) : GamePhase(Session, GamePhaseName.Tutorial)
{
    private bool _started = false;

    private static ImmutableArray<QualCardRef> MakeTutoDeck(GamePack pack, int n)
    {
        var builder = ImmutableArray.CreateBuilder<QualCardRef>();

        for (int i = 0; i < n; i++)
        {
            var card = pack.Cards[Random.Shared.Next(pack.Cards.Length)];

            builder.Add(new QualCardRef(pack.Id, card.Id));
        }
        
        builder.Add(new QualCardRef(pack.Id, MainPack.TutorialCard5Id));
        builder.Add(new QualCardRef(pack.Id, MainPack.TutorialCard4Id));
        builder.Add(new QualCardRef(pack.Id, MainPack.TutorialCard3Id));
        builder.Add(new QualCardRef(pack.Id, MainPack.TutorialCard2Id));
        builder.Add(new QualCardRef(pack.Id, MainPack.TutorialCard1Id));

        return builder.ToImmutable();
    }

    // Called by GameSession only!
    public void StartTutorial()
    {
        if (_started)
        {
            return;
        }

        var deck = MakeTutoDeck(Session.BasePack, 40);
        var decks = new[] { deck };

        Session.BroadcastMessage(new TutorialStartedMessage());

        Session.StartDuels(false,
            GameSessionRules.AssociatePlayersInAFairDuel(Session.Players, out _),
            decks,
            startCards: 2,
            coreHealth: 15);

        _started = true;
    }

    public override void OnEnd()
    {
        Session.StopDuels();
    }

    public override PhaseStatePayload? GetStateForHost()
    {
        return new TutorialStatePayload(_started);
    }

    public override IEnumerable<PhaseStatePayload>? GetStateForPlayers(IEnumerable<Player> players)
    {
        var msg = new TutorialStatePayload(_started);
        foreach (var _ in players)
        {
            yield return msg;
        }
    }
}

public sealed record CreatingCardsPhase(GameSession Session) : GamePhase(Session, GamePhaseName.CreatingCards)
{
    public override void OnStart()
    {
        Session.EnableCardUpdates();

        // Assign card costs to everyone.
        var cpp = Session.Settings.CardsPerPlayer;
        var settings = new GameSessionRules.CostSettings
        {
            LowWeights = [..Session.Settings.CostLowWeights],
            HighWeights = [..Session.Settings.CostHighWeights]
        };
        
        // The costs array is in the following format: [low, high, low, high, ...]
        // Since we usually have 2 cards per player, each player will have an equal amount of low/high cards.
        var costs = GameSessionRules.DistributeCardCosts(Session.Players.Count * cpp, in settings);

        int i = 0;
        foreach (var player in Session.Players.Values)
        {
            var cards = new CardDefinition[cpp];
            for (int j = 0; j < cpp; j++)
            {
                cards[j] = new CardDefinition
                {
                    Cost = costs[i],
                    Attack = costs[i],
                    Health = costs[i]
                };
                i++;
            }

            player.Cards = ImmutableCollectionsMarshal.AsImmutableArray(cards);
        }
    }

    public override PhaseStatePayload GetStateForHost()
    {
        return new CreatingCardsStatePayload(new CreatingCardsStatePayload.HostData());
    }

    public override IEnumerable<PhaseStatePayload> GetStateForPlayers(IEnumerable<Player> players)
    {
        foreach (var player in players)
        {
            yield return new CreatingCardsStatePayload(new CreatingCardsStatePayload.PlayerData(
                player.Cards
            ));
        }
    }
}

public sealed record PreparationPhase(GameSession Session) : GamePhase(Session, GamePhaseName.Preparation)
{
    public Status State => _status;
    private Status _status = Status.WaitingLastUploads;
    private Timer? _uploadBeginDeadlineTimer = null;
    private Timer? _finalDeadlineTimer = null;

    private readonly Dictionary<Player, Player> _opponentMap = new(); // Cache for state
    public (Player, Player)[] DuelPairs { get; private set; } = null!;
    public ImmutableArray<QualCardRef>[]? DuelDecks { get; private set; } = null;

    public bool OpponentsRevealed { get; private set; } = false;

    public override void OnStart()
    {
        // Already in a lock

        _uploadBeginDeadlineTimer = new Timer(s => ((GameSession)s!).DisableCardUpdates(false, true),
            Session, Session.StartUploadDeadline * 1000, 0);

        _finalDeadlineTimer = new Timer(p => ((PreparationPhase)p!).BeginCompilingGamePack(), this,
            Session.OngoingUploadDeadline * 1000, 0);

        DuelPairs = GameSessionRules.AssociatePlayersInAFairDuel(Session.Players, out _);
        foreach (var (p1, p2) in DuelPairs)
        {
            _opponentMap.Add(p1, p2);
            _opponentMap.Add(p2, p1);
        }
    }

    public void BeginCompilingGamePack()
    {
        lock (Session.Lock)
        {
            if (_status != Status.WaitingLastUploads)
            {
                return;
            }

            Session.Logger.LogInformation("Game now starting game pack compilation");

            _status = Status.CompilingGamePack;
            // Disable all card updates.
            Session.DisableCardUpdates(true, true);
            _uploadBeginDeadlineTimer?.Dispose();
            _uploadBeginDeadlineTimer = null;
            _finalDeadlineTimer?.Dispose();
            _finalDeadlineTimer = null;

            // Gather all cards that are "ready"
            Session.FinalCards = GameSessionRules.MakeFinalCardList(Session.Players.Values, Session.Settings.CardsPerPlayer);

            // Prepare the cards for game packing.
            var n = Session.FinalCards.Count;
            var packCards = ImmutableArray.CreateBuilder<GamePackCompileRequest.PackCard>(n);
            packCards.Count = n;
            for (var i = 0; i < Session.FinalCards.Count; i++)
            {
                var (def, (imgPath, assetId)) = Session.FinalCards[i];
                packCards[i] = new GamePackCompileRequest.PackCard(assetId, def, imgPath);
            }

            // todo: cancel on session termination
            Session.Packer.PackGame(
                Session.PermanentId,
                "GameSessionPack",
                1,
                packCards.MoveToImmutable()
            ).ContinueWith(PackTaskComplete, this);

            Session.SendPhaseUpdateMessages();
        }
    }

    private static void PackTaskComplete(Task<WebGamePacker.PublishedPack> packTask, object? itsAbsolutelyMe)
    {
        var me = (PreparationPhase)itsAbsolutelyMe!;
        var sess = me.Session;
        sess.Logger.LogInformation("Pack compilation task complete with status {Status}", packTask.Status);
        lock (sess.Lock)
        {
            if (sess.Phase != me)
            {
                return;
            }

            if (packTask.IsCompletedSuccessfully)
            {
                var pack = packTask.Result;
                sess.MakePackAvailable(pack);

                var settings = new GameSessionRules.DeckSettings
                {
                    SpellProportion = sess.Settings.DeckSpellProportion,
                    ArchetypeSequenceLength = (ushort)sess.Settings.DeckArchetypeSequenceLength,
                    UserCardCopies = sess.Settings.DeckUserCardCopies,
                    BiasMaxCost = 3,
                    BiasGuaranteed = 2,
                    BiasDeckTopSpan = 5
                };
                try
                {
                    me.DuelDecks = GameSessionRules.MakeNDecks(pack.Pack, sess.BasePack, sess.Players.Count,
                        in settings);
                }
                catch (Exception e)
                {
                    sess.Logger.LogError(e, "Error while making decks, using fallback");
                    var decks = new ImmutableArray<QualCardRef>[sess.Players.Count];
                    for (var index = 0; index < sess.Players.Count; index++)
                    {
                        decks[index] = (MakeFallbackDeck(pack.Pack, sess.BasePack, 40));
                    }

                    me.DuelDecks = decks;
                }

                me._status = Status.Ready;
                sess.SendPhaseUpdateMessages();
            }
            else if (!packTask.IsCanceled)
            {
                // uh oh
                // what a tragedy
                // obvious TODO: better catastrophic error handling
                sess.SwitchPhase(new TerminatedPhase(sess));
            }
        }
    }

    public void RevealOpponents()
    {
        if (OpponentsRevealed)
        {
            return;
        }

        OpponentsRevealed = true;
        Session.SendPhaseUpdateMessages();
    }

    public override PhaseStatePayload GetStateForHost()
    {
        return new PreparationStatePayload(State, null);
    }

    public override IEnumerable<PhaseStatePayload> GetStateForPlayers(IEnumerable<Player> players)
    {
        foreach (var player in players)
        {
            yield return new PreparationStatePayload(State,
                OpponentsRevealed ? _opponentMap.GetValueOrDefault(player)?.Name : null);
        }
    }

    private static ImmutableArray<QualCardRef> MakeFallbackDeck(GamePack pack1, GamePack pack2, int n)
    {
        var builder = ImmutableArray.CreateBuilder<QualCardRef>();

        var cards = new List<QualCardRef>();
        foreach (var (id, _, _) in pack1.Cards)
        {
            cards.Add(new QualCardRef(pack1.Id, id));
        }
        foreach (var (id, _, _) in pack2.Cards)
        {
            cards.Add(new QualCardRef(pack2.Id, id));
        }
        
        for (int i = 0; i < n; i++)
        {
            builder.Add(cards[Random.Shared.Next(cards.Count)]);
        }

        return builder.ToImmutable();
    }
    
    public enum Status
    {
        WaitingLastUploads,
        CompilingGamePack,
        Ready
    }
}

public sealed record DuelsPhase(
    GameSession Session,
    (Player, Player)[] Pairs,
    ImmutableArray<QualCardRef>[] Decks) : GamePhase(Session, GamePhaseName.Duels)
{
    public override void PostStart()
    {
        Session.StartDuels(true, Pairs, Decks);
    }

    public override void OnEnd()
    {
        Session.StopDuels();
    }
}

public sealed record EndedPhase(GameSession Session) : GamePhase(Session, GamePhaseName.Ended);

public sealed record TerminatedPhase(GameSession Session) : GamePhase(Session, GamePhaseName.Terminated);