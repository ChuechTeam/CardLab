using System.Collections.Immutable;
using System.Configuration;
using System.Diagnostics;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;
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

    public GameSessionSettings Settings { get; private set; }

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
    private int _playerIdCounter = 1;
    private int _duelIdCounter = 1;

    public GameSession(int id, string code, GameSessionSettings settings, GamePack basePack, WebGamePacker packer,
        ILoggerFactory loggerFac)
    {
        BasePack = basePack;
        Id = id;
        Code = code;
        Settings = settings;
        Packer = packer;
        Logger = loggerFac.CreateLogger(typeof(GameSession));
        _ = Logger.BeginScope(new Dictionary<string, object> { ["Session"] = id });
        _loggerFactory = loggerFac;

        Phase = new WaitingForPlayersPhase(this);

        Logger.LogInformation("Starting session {Id} (Perm: {PermId}) of code {Code} with settings {Settings}" +
                              " (LowW=[{LowW}], HighW=[{HighW}])",
            id, PermanentId, code, settings,
            string.Join(',', settings.CostLowWeights),
            string.Join(',', settings.CostHighWeights));
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
            if (Phase.Name is GamePhaseName.Ended 
                or GamePhaseName.Terminated 
                or GamePhaseName.Preparation
                or GamePhaseName.CreatingCards)
            {
                return Result.Fail<Player>("Impossible de rejoindre la partie actuellement. Essayez plus tard.");
            }

            if (Players.Count >= 100)
            {
                return Result.Fail<Player>("Nombre max de joueurs atteint.");
            }

            int id = _playerIdCounter;
            _playerIdCounter++;

            var player = new Player(this, id)
            {
                Name = sanitizedName,
                LoginToken = UserToken.Generate()
            };
            
            // Make sure the card arrays are initialized after the game has started.
            if (Phase.Name is not GamePhaseName.WaitingForPlayers)
            {
                player.PrepareCardArrays(Settings.CardsPerPlayer);
            }

            Players = Players.Add(id, player);
            PlayersByToken = PlayersByToken.Add(player.LoginToken, player);

            BroadcastMessage(new LobbyPlayerUpdatedMessage(id, player.Name, LobbyPlayerUpdateKind.Join));

            if (Phase.Name == GamePhaseName.Duels)
            {
                SendPhaseUpdateMessages();
            }

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
                    player.Gone = true;
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

    // Assumes that settings have been validated!
    public Result<Unit> UpdateSettings(UserGameSessionSettings userSettings)
    {
        lock (Lock)
        {
            if (PhaseName != GamePhaseName.WaitingForPlayers)
            {
                return Result.Fail("Impossible de changer les paramètres en cours de partie.");
            }
            
            Settings = userSettings.Apply(Settings);
            BroadcastMessage(new SettingsChangedMessage(userSettings));

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
            
            if (Players.Count < 2)
            {
                return Result.Fail("Il n'y a pas assez de joueurs");
            }
            
            foreach (var (_, player) in Players)
            {
                player.PrepareCardArrays(Settings.CardsPerPlayer);
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

            var phase = new DuelsPhase(this);
            SwitchPhase(phase);
            phase.StartRound(p.DuelPairs);

            return Result.Success();
        }
    }

    public Result<Unit> DuelsStartRound()
    {
        lock (Lock)
        {
            if (Phase is not DuelsPhase p)
            {
                return Result.Fail("La partie n'est pas dans la bonne phase.");
            }

            if (!p.StartRound())
            {
                return Result.Fail("La partie n'est pas prête pour commencer.");
            }

            return Result.Success();
        }
    }

    public Result<Unit> DuelsEndRound()
    {
        lock (Lock)
        {
            if (Phase is not DuelsPhase p)
            {
                return Result.Fail("La partie n'est pas dans la bonne phase.");
            }

            if (!p.EndRound())
            {
                return Result.Fail("La partie n'est pas prête pour terminer.");
            }

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

    // Returns all the players who are not considered "away": not disconnected for more than X seconds
    public Span<Player> GetPresentPlayers()
    {
        lock (Lock)
        {
            var players = new List<Player>(Players.Count);
            var now = DateTime.UtcNow;
            foreach (var p in Players.Values)
            {
                if (p.Gone) continue;

                // Accessing this property might not return the latest data, but that's a minor issue.
                var disconnect = p.Socket.LastDisconnect; // null if user connected
                if (disconnect is null || now.Subtract(disconnect.Value).TotalSeconds < Settings.DisconnectionTimeout)
                {
                    players.Add(p);
                }
            }

            return CollectionsMarshal.AsSpan(players);
        }
    }

    // If the decks span has not enough elements, the same deck is used for the last players.
    public void StartDuels(bool requireSessionPack,
        Span<(Player, Player)> pairs,
        Span<ImmutableArray<QualCardRef>> decks,
        Func<Duel, PlayerIndex, int>? scoring,
        int startCards = 5,
        int coreHealth = 40)
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
                pairs.Length * 2, requireSessionPack);
            var stopwatch = Stopwatch.StartNew();

            var numDecks = decks.Length - 1;
            ImmutableArray<GamePack> packs = requireSessionPack ? [Pack!.Value.Pack, BasePack] : [BasePack];
            var duels = new SessionDuel[pairs.Length];
            var duelPerPlayer = ImmutableDictionary<int, (Duel, PlayerIndex, int)>.Empty.ToBuilder();
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
                    MaxCoreHealth = coreHealth,
                    MaxEnergy = 30,
                    SecondsPerTurn = 80,
                    StartCards = startCards
                };

                var duel = new Duel(settings, _loggerFactory, p1.Name, p2.Name, p1.Socket, p2.Socket);
                duel.SetEventCallback(OnDuelEvent);
                var id = _duelIdCounter++;
                duels[(uint)i / 2 - 1] = new SessionDuel(id, duel, p1.Id, p2.Id);

                duelPerPlayer.Add(p1.Id, (duel, PlayerIndex.P1, id));
                duelPerPlayer.Add(p2.Id, (duel, PlayerIndex.P2, id));

                messages[i - 2] = (p1.Socket, new SessionDuelStartedMessage(
                    id, requireSessionPack, duel.MakeWelcomeMessage(PlayerIndex.P1)));

                messages[i - 1] = (p2.Socket, new SessionDuelStartedMessage(
                    id, requireSessionPack, duel.MakeWelcomeMessage(PlayerIndex.P2)));
            }

            DuelState = new SessionDuelState
            {
                RequiresSessionPack = requireSessionPack,
                ScoringFunction = scoring,
                Duels = duels,
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

            foreach (var (_, duel, _, _) in DuelState.Duels)
            {
                duel.SetEventCallback(null);
                duel.Terminate();
                duel.Dispose();
            }

            DuelState = null;

            BroadcastMessage(new SessionDuelEndedMessage());
        }
    }

    private void OnDuelEvent(Duel duel, DuelEvent ev)
    {
        // Beware!! We're in a Duel lock!

        if (ev is not DuelEndedEvent (var whoWon))
        {
            return;
        }

        lock (Lock)
        {
            if (DuelState is null)
            {
                return;
            }

            // Do a linear search to find the duel.
            for (var i = 0; i < DuelState.Duels.Length; i++)
            {
                ref var d = ref DuelState.Duels[i];
                if (d.Duel == duel)
                {
                    d.Ongoing = false;
                    d.WinnerId = whoWon switch
                    {
                        PlayerIndex.P1 => d.Player1Id,
                        PlayerIndex.P2 => d.Player2Id,
                        _ => null
                    };
                    if (DuelState.ScoringFunction is {} f && d.WinnerId is {} w)
                    {
                        Players[w].Score += f(duel, whoWon!.Value);
                    }

                    SendPhaseUpdateMessages();
                    break;
                }
            }
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

    public UserSocket.Connection? BeginUserConnection(Player? player)
    {
        // Small optimization for duel welcome messages:
        // First try fetching the duel and create a welcome message.
        // We'll check later if that message is still valid, else, we'll redo the whole thing.
        // Thing helps to avoid locking the session for too long, and for nothing.

        (int id, DuelWelcomeMessage welcome)? CreateDuelInfo(out SessionDuelState? ds)
        {
            ds = DuelState;
            if (player is not null && ds is not null &&
                ds.PlayerToDuel.TryGetValue(player.Id, out var tuple))
            {
                return (tuple.duelId, tuple.duel.MakeWelcomeMessage(tuple.idx));
            }
            else
            {
                return null;
            }
        }

        var duelInfo = CreateDuelInfo(out var initDs);
        var socket = player?.Socket ?? HostSocket;
        
        lock (Lock)
        {
            var connection = socket.StartConnection();
            if (connection is null) return null;

            if (player is not null)
            {
                // Recreate the welcome message if the data is outdated
                if (initDs != DuelState)
                {
                    duelInfo = CreateDuelInfo(out _);
                }
            }

            var msg = new WelcomeMessage(Id,
                PermanentId,
                Code,
                player is not null ? new PlayerPayload(player.Id, player.Name) : null,
                Pack is { } p ? new DownloadablePackPayload(p.DefUrlFilePath, p.ResUrlFilePath) : null,
                duelInfo?.welcome,
                duelInfo?.id,
                DuelState?.RequiresSessionPack ?? false,
                PhaseName,
                Phase.GetStateForUser(player),
                UserGameSessionSettings.Convert(Settings));
            
            socket.SendMessage(msg);
            return connection;
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
    // Called inside a Duel and GameSession lock!
    public required Func<Duel, PlayerIndex, int>? ScoringFunction { get; init; }

    // The array won't change size, neither will the duel itself. However, Ongoing and WinnerId might change
    public required SessionDuel[] Duels { get; init; }
    public required ImmutableDictionary<int, (Duel duel, PlayerIndex idx, int duelId)> PlayerToDuel { get; init; }
}

public record struct SessionDuel(int Id, Duel Duel, int Player1Id, int Player2Id)
{
    public bool Ongoing { get; set; } = true;
    public int? WinnerId { get; set; } = null;
}