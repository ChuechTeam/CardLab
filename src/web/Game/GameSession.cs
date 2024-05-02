using System.Collections.Immutable;
using System.Diagnostics;
using System.Runtime.CompilerServices;
using CardLab.Game.AssetPacking;
using CardLab.Game.Communication;
using CardLab.Game.Duels;

namespace CardLab.Game;

public sealed class GameSession
{
    // The id of the session. Only unique during the server's lifetime.
    public int Id { get; }

    // The invitation code. Should be unique per session.
    public string Code { get; }

    // A unique identifier used to refer to the session after it has ended, in databases or file systems.
    public Guid PermanentId { get; } = Guid.NewGuid();

    public UserToken HostToken { get; } = UserToken.Generate();
    public UserSocket HostSocket { get; } = new();

    // TODO: Make this mutable?
    public int CardsPerPlayer { get; } = 2;

    // Seconds before we disable new image uploads (but keep definition uploads on).
    public int StartUploadDeadline { get; } = 4;

    // Seconds before we entirely disable all uploads (definition & image) and cancel ongoing uploads.
    public int OngoingUploadDeadline { get; } = 7;

    public GamePhase Phase { get; private set; }
    public GamePhaseName PhaseName => Phase.Name;

    public SessionDuelState? DuelState { get; private set; } = null;
    public WebGamePacker.PublishedPack? Pack { get; private set; } = null;
    public GamePack BasePack { get; }


    // Kindly please don't mutate this outside of PreparationGamePhase :(
    public List<(CardDefinition def, SessionCardPackingInfo info)> FinalCards { get; set; } = new();

    // We use an immutable dictionaries here so we don't need to lock the session every time we want
    // to check if the player is authenticated.
    // Both properties can safely be read without locks, but may provide outdated data (by microseconds, lol)
    public ImmutableDictionary<int, Player> Players { get; private set; }
        = ImmutableDictionary<int, Player>.Empty;

    public ImmutableDictionary<UserToken, Player> PlayersByToken { get; private set; }
        = ImmutableDictionary<UserToken, Player>.Empty;

    public int OngoingCardUpdates { get; private set; } = 0;

    private (bool def, bool img) _allowedCardUpdates = (false, false);

    public (bool def, bool img) AllowedCardUpdates
    {
        get => _allowedCardUpdates;
        private set => _allowedCardUpdates = value;
    }

    public CancellationToken UploadsCancellationToken { get; private set; } = new();

    // Dependencies
    public WebGamePacker Packer { get; }
    public ILogger Logger { get; }

    private readonly ILoggerFactory _loggerFactory;
    private CancellationTokenSource _uploadCancelTokenSrc = new();
    private int _idCounter = 1;

    public GameSession(int id, string code, GamePack basePack, WebGamePacker packer, 
        ILoggerFactory loggerFac)
    {
        BasePack = basePack;
        Id = id;
        Code = code;
        Packer = packer;
        Logger = loggerFac.CreateLogger(typeof(GameSession));
        _ = Logger.BeginScope(new Dictionary<string, object> { ["Session"] = id });
        _loggerFactory = loggerFac;

        Phase = new WaitingForPlayersPhase(this);
    }

    // The lock is public as other components like Player and GamePhase can use it.
    // After profiling, locking turned out to be a satisfying solution as it didn't cause
    // any hanging issues even with 100 virtual players
    public object Lock { get; } = new();

    // Draft for the game request processing
    // Not yet used!
    public void ProcessRequest(GameRequest req)
    {
        switch (req.Type)
        {
            case StartGameRequest.TypeId:
                var sgr = Unsafe.As<StartGameRequest>(req);
                sgr.Response = StartGame();
                break;
            default:
                throw new InvalidOperationException($"Unknown request type: {req.Type} for {req}");
        }
    }

    public Result<Player> AddPlayer(string name)
    {
        var sanitizedName = name.Trim();
        if (sanitizedName.Length == 0)
        {
            return Result.Fail<Player>("Votre nom est invalide.");
        }

        if (sanitizedName.Length > 24)
        {
            return Result.Fail<Player>("Votre nom est trop long.");
        }
        
        lock (Lock)
        {
            if (Phase.Name != GamePhaseName.WaitingForPlayers)
            {
                return Result.Fail<Player>("La partie a déjà commencé");
            }

            int id = _idCounter;
            _idCounter++;

            var player = new Player(this, id, CardsPerPlayer)
            {
                Name = sanitizedName,
                LoginToken = UserToken.Generate()
            };
            Players = Players.Add(id, player);
            PlayersByToken = PlayersByToken.Add(player.LoginToken, player);

            BroadcastMessage(new LobbyPlayerUpdatedMessage(id, player.Name, LobbyPlayerUpdateKind.Join));

            return Result.Success(player);
        }
    }

    public Result<Unit> KickPlayer(int id)
    {
        lock (Lock)
        {
            if (PhaseName != GamePhaseName.WaitingForPlayers)
            {
                return Result.Fail("La partie a déjà commencé");
            }

            if (!Players.TryGetValue(id, out var player))
            {
                return Result.Fail("Joueur non trouvé");
            }

            player.Kicked = true;
            return PlayerQuit(id);
        }
    }

    public Result<Unit> PlayerQuit(int id)
    {
        lock (Lock)
        {
            if (Players.TryGetValue(id, out var player))
            {
                if (Phase.Name == GamePhaseName.WaitingForPlayers)
                {
                    // Remove the player
                    Players = Players.Remove(id);
                    PlayersByToken = PlayersByToken.Remove(player.LoginToken);
                    player.Socket.Close();
                }
                else
                {
                    // Mark them as left?
                }

                BroadcastMessage(new LobbyPlayerUpdatedMessage(id, player.Name, LobbyPlayerUpdateKind.Quit));
            }
            else
            {
                return Result.Fail("Joueur non trouvé");
            }

            return Result.Success();
        }
    }

    public void SwitchPhase(GamePhase newPhase)
    {
        lock (Lock)
        {
            if (Phase.Name == newPhase.Name)
            {
                throw new InvalidOperationException("Attempted to switch to the same phase.");
            }

            Phase.OnEnd();
            Phase = newPhase;
            Phase.OnStart();

            // Send message to host and players
            var hostState = Phase.GetStateForHost();
            HostSocket.SendMessage(new SwitchedPhaseMessage(newPhase.Name, hostState));

            foreach (var player in Players.Values)
            {
                var playerState = Phase.GetStateForUser(player);
                player.Socket.SendMessage(new SwitchedPhaseMessage(newPhase.Name, playerState));
            }

            Phase.PostStart();
        }
    }

    public Result<Unit> StartGame()
    {
        lock (Lock)
        {
            if (Phase.Name != GamePhaseName.WaitingForPlayers)
            {
                return Result.Fail("La partie a déjà commencé");
            }

            // Should later be 2
            if (Players.Count < 2)
            {
                return Result.Fail("Il n'y a pas assez de joueurs");
            }

            SwitchPhase(new TutorialPhase(this));

            return Result.Success();
        }
    }

    public Result<Unit> StartTutorialDuels()
    {
        lock (Lock)
        {
            if (Phase is not TutorialPhase p)
            {
                return Result.Fail("La partie n'est pas dans la bonne phase.");
            }

            p.StartTutorial();

            return Result.Success();
        }
    }

    public Result<Unit> SwitchToCardCreationPhase()
    {
        lock (Lock)
        {
            if (Phase.Name != GamePhaseName.Tutorial)
            {
                return Result.Fail("La partie n'est pas dans la bonne phase.");
            }

            SwitchPhase(new CreatingCardsPhase(this));

            return Result.Success();
        }
    }

    public Result<Unit> SwitchToPreparationPhase()
    {
        lock (Lock)
        {
            if (Phase.Name != GamePhaseName.CreatingCards)
            {
                return Result.Fail("La partie n'est pas dans la bonne phase.");
            }

            SwitchPhase(new PreparationPhase(this));

            return Result.Success();
        }
    }

    public Result<Unit> PreparationRevealOpponents()
    {
        lock (Lock)
        {
            if (Phase is not PreparationPhase p)
            {
                return Result.Fail("La partie n'est pas dans la bonne phase.");
            }

            p.RevealOpponents();
            
            return Result.Success();
        }
    }

    public Result<Unit> EndPreparation()
    {
        lock (Lock)
        {
            if (Phase is not PreparationPhase p)
            {
                return Result.Fail("La partie n'est pas dans la bonne phase.");
            }

            if (p.State != PreparationPhase.Status.Ready)
            {
                return Result.Fail("La phase de préparation n'est pas terminée.");
            }
            
            SwitchPhase(new DuelsPhase(this, p.DuelPairs, p.DuelDecks!));

            return Result.Success();
        }
    }

    public void TerminateGame()
    {
        lock (Lock)
        {
            SwitchPhase(new TerminatedPhase(this));
        }
    }

    public bool AddOngoingCardUpload()
    {
        lock (Lock)
        {
            if (!_allowedCardUpdates.img)
            {
                return false;
            }

            OngoingCardUpdates++;
            return true;
        }
    }

    public bool RemoveOngoingCardUpload()
    {
        lock (Lock)
        {
            if (!_allowedCardUpdates.img)
            {
                return false;
            }

            OngoingCardUpdates--;
            return true;
        }
    }

    public void EnableCardUpdates()
    {
        lock (Lock)
        {
            if (_allowedCardUpdates is { img: true, def: true })
            {
                return; // Uploads already enabled, don't do anything.
            }

            _allowedCardUpdates = (true, true);
            UploadsCancellationToken = _uploadCancelTokenSrc.Token;
        }
    }

    public void DisableCardUpdates(bool disableDef, bool disableImg)
    {
        lock (Lock)
        {
            // Directly disable definition updates
            if (disableDef)
            {
                _allowedCardUpdates.def = false;
            }

            if (disableImg && _allowedCardUpdates.img)
            {
                _allowedCardUpdates.img = false;
                _uploadCancelTokenSrc.Cancel();
                _uploadCancelTokenSrc = new CancellationTokenSource();
            }
        }
    }

    public void MakePackAvailable(WebGamePacker.PublishedPack pack)
    {
        lock (Lock)
        {
            if (this.Pack != null)
            {
                throw new InvalidOperationException("A pack already exists.");
            }

            this.Pack = pack;

            BroadcastMessage(new PackAvailableMessage(new(pack.DefUrlFilePath, pack.ResUrlFilePath)));
        }
    }

    // If the decks span has not enough elements, the same deck is used for the last players.
    public void StartDuels(bool requireSessionPack,
        Span<(Player, Player)> pairs,
        Span<ImmutableArray<QualCardRef>> decks)
    {
        lock (Lock)
        {
            if (DuelState != null)
            {
                throw new InvalidOperationException("Duels already running.");
            }

            if (decks.Length == 0)
            {
                throw new ArgumentException("Decks must have at least one element.");
            }

            if (pairs.Length == 0)
            {
                throw new ArgumentException("Pairs must have at least one element.");
            }

            if (requireSessionPack && Pack is null)
            {
                throw new InvalidOperationException("No session pack available while requireSessionPack is true.");
            }

            Logger.LogInformation("Starting duels for {NumPlayers} players. Require session pack: {ReqPack}",
                pairs.Length, requireSessionPack);
            var stopwatch = Stopwatch.StartNew();

            var numDecks = decks.Length - 1;
            ImmutableArray<GamePack> packs = requireSessionPack ? [Pack!.Value.Pack, BasePack] : [BasePack];
            var duels = ImmutableArray.CreateBuilder<Duel>(pairs.Length);
            var duelPerPlayer = ImmutableDictionary<int, (Duel, PlayerIndex)>.Empty.ToBuilder();
            var messages = new (UserSocket, SessionDuelStartedMessage)[pairs.Length * 2];
            int i = 0;
            foreach (var (p1, p2) in pairs)
            {
                var p1Deck = decks[Math.Min(i, numDecks)];
                i++;

                var p2Deck = decks[Math.Min(i, numDecks)];
                i++;

                var settings = new DuelSettings
                {
                    Packs = packs,
                    Player1Deck = p1Deck,
                    Player2Deck = p2Deck,
                    MaxCoreHealth = 45,
                    MaxEnergy = 30,
                    SecondsPerTurn = 80,
                    StartCards = 5
                };

                var duel = new Duel(settings, _loggerFactory, p1.Name, p2.Name, p1.Socket, p2.Socket);
                duels.Add(duel);

                duelPerPlayer.Add(p1.Id, (duel, PlayerIndex.P1));
                duelPerPlayer.Add(p2.Id, (duel, PlayerIndex.P2));

                messages[i - 2] = (p1.Socket, new SessionDuelStartedMessage(
                    requireSessionPack, duel.MakeWelcomeMessage(PlayerIndex.P1)));

                messages[i - 1] = (p2.Socket, new SessionDuelStartedMessage(
                    requireSessionPack, duel.MakeWelcomeMessage(PlayerIndex.P2)));
            }

            DuelState = new SessionDuelState
            {
                RequiresSessionPack = requireSessionPack,
                Duels = duels.ToImmutable(),
                PlayerToDuel = duelPerPlayer.ToImmutable(),
            };

            foreach (var (soc, msg) in messages)
            {
                soc.SendMessage(msg);
            }

            stopwatch.Stop();
            Logger.LogInformation("Duels for {NumPlayers} started in {Elapsed}µs", pairs.Length * 2,
                stopwatch.ElapsedTicks / (Stopwatch.Frequency / 1_000_000));
        }
    }

    public void StopDuels()
    {
        lock (Lock)
        {
            if (DuelState is null)
            {
                return; // nothing to do
            }

            foreach (var duel in DuelState.Duels)
            {
                duel.Terminate();
                duel.Dispose();
            }

            DuelState = null;

            BroadcastMessage(new SessionDuelEndedMessage());
        }
    }

    // Only for use in phases!
    internal void SendPhaseUpdateMessages()
    {
        var hostState = Phase.GetStateForHost();
        HostSocket.SendMessage(new PhaseStateUpdatedMessage(hostState));

        foreach (var player in Players.Values)
        {
            var playerState = Phase.GetStateForUser(player);
            player.Socket.SendMessage(new PhaseStateUpdatedMessage(playerState));
        }
    }

    public void BroadcastMessage(LabMessage message)
    {
        lock (Lock)
        {
            HostSocket.SendMessage(message);
            foreach (var player in Players.Values)
            {
                player.Socket.SendMessage(message);
            }
        }
    }

    /*
     * Asset-related functions
     */

    public string CardImageAssetPath(int playerId, int cardIdx)
    {
        var rootDir = Path.Combine(Path.GetTempPath(), "CardLabAssets");
        var gameDir = Path.Combine(rootDir, PermanentId.ToString());
        var dir = Path.Combine(gameDir, "Cards");
        var imgFile = Path.Combine(dir, $"{playerId}_{cardIdx}.png");
        return imgFile;
    }

    public static uint PackCardId(int playerId, int cardIdx)
    {
        return (uint)playerId << 16 | (uint)cardIdx;
    }
}

public readonly record struct SessionCardPackingInfo(string ImgFilePath, uint AssetId);

public class SessionDuelState
{
    public required bool RequiresSessionPack { get; init; }
    public required ImmutableArray<Duel> Duels { get; init; }
    public required ImmutableDictionary<int, (Duel duel, PlayerIndex idx)> PlayerToDuel { get; init; }
}