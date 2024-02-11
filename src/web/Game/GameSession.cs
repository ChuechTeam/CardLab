using System.Collections.Immutable;
using System.Diagnostics;
using CardLab.Game.Communication;
using Microsoft.CodeAnalysis.CSharp.Syntax;

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

    public GamePhase Phase { get; private set; }
    public GamePhaseName PhaseName => Phase.Name;

    // We use an immutable dictionaries here so we don't need to lock the session every time we want
    // to check if the player is authenticated.
    // Both properties can safely be read without locks, but may provide outdated data (by microseconds, lol)

    public ImmutableDictionary<int, Player> Players { get; private set; }
        = ImmutableDictionary<int, Player>.Empty;

    public ImmutableDictionary<UserToken, Player> PlayersByToken { get; private set; }
        = ImmutableDictionary<UserToken, Player>.Empty;

    private int _idCounter = 1;

    public GameSession(int id, string code)
    {
        Id = id;
        Code = code;
        
        Phase = new WaitingForPlayersPhase(this);
    }
    
    // The lock is public as other components like Player and GamePhase can use it.
    public object Lock { get; } = new();

    // Although... locking is still a VERY BAD SOLUTION right now for concurrency... but it works fine for small
    // amounts of players in a session.
    // This is just a temporary solution right now, the better way to do this would be to
    // use a command queue (in-memory, of course).
    
    public Result<Player> AddPlayer(string name)
    {
        lock (Lock)
        {
            if (Phase.Name != GamePhaseName.WaitingForPlayers)
            {
                return Result.Fail<Player>("La partie a déjà commencé");
            }

            int id = _idCounter;
            _idCounter++;

            var player = new Player(this, CardsPerPlayer)
            {
                Id = id,
                Name = name,
                LoginToken = UserToken.Generate()
            };
            Players = Players.Add(id, player);
            PlayersByToken = PlayersByToken.Add(player.LoginToken, player);
            
            BroadcastMessage(new LobbyPlayerUpdatedMessage(id, player.Name, LobbyPlayerUpdateKind.Join));

            return Result.Success(player);
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

    public void SwitchPhase(GamePhaseName newPhase)
    {
        lock (Lock)
        {
            if (Phase.Name == newPhase)
            {
                throw new InvalidOperationException("Attempted to switch to the same phase.");
            }
            
            Phase.OnEnd();
            Phase = newPhase switch
            {
                GamePhaseName.CreatingCards => new CreatingCardsPhase(this),
                GamePhaseName.PostCreate => new PostCreatePhase(this),
                GamePhaseName.Ended => new EndedPhase(this),
                GamePhaseName.Terminated => new TerminatedPhase(this),
                _ => throw new ArgumentOutOfRangeException(nameof(newPhase))
            };
            Phase.OnStart();

            // Send message to host and players
            var hostState = Phase.GetStateForHost();
            HostSocket.SendMessage(new SwitchedPhaseMessage(newPhase, hostState));

            foreach (var player in Players.Values)
            {
                var playerState = Phase.GetStateForUser(player);
                player.Socket.SendMessage(new SwitchedPhaseMessage(newPhase, playerState));
            }
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

            if (Players.Count < 1)
            {
                return Result.Fail("Il n'y a pas assez de joueurs");
            }

            SwitchPhase(GamePhaseName.CreatingCards);

            return Result.Success();
        }
    }

    public void TerminateGame()
    {
        lock (Lock)
        {
            SwitchPhase(GamePhaseName.Terminated);
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
}