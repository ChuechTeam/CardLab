using System.Collections.Immutable;

namespace CardLab.Game;

public sealed class Player
{
    // The id of the player in the current session.
    public required int Id { get; init; }

    public required string Name { get; init; }

    public required UserToken LoginToken { get; init; }

    public Card[] Cards { get; init; } = [];
}

public enum GamePhase
{
    WaitingForPlayers,
    CreatingCards,
    PostCreate,
    Ended,
    Terminated
}

public sealed class GameSession(int id, string code)
{
    // The id of the session.
    public int Id { get; } = id;

    // The invitation code. Should be unique per session.
    public string Code { get; } = code;

    public UserToken HostToken { get; } = UserToken.Generate();

    public int CardsPerPlayer { get; private set; } = 2;

    public GamePhase Phase { get; private set; } = GamePhase.WaitingForPlayers;

    // We use an immutable dictionaries here so we don't need to lock the session every time we want
    // to check if the player is authenticated.
    // Both properties can safely be read without locks, but may provide outdated data (by microseconds, lol)

    public ImmutableDictionary<int, Player> Players { get; private set; }
        = ImmutableDictionary<int, Player>.Empty;

    public ImmutableDictionary<UserToken, Player> PlayersByToken { get; private set; }
        = ImmutableDictionary<UserToken, Player>.Empty;

    private int _idCounter = 1;

    private ReaderWriterLockSlim _lock = new();

    // Locking is a VERY BAD SOLUTION right now for concurrency... but it works fine for small
    // amounts of players in a session.
    // This is just a temporary solution right now, the better way to do this would be to
    // use a command queue (in-memory, of course).

    // Create a new read-only transaction, which should be used when reading mutable data.
    public SessionTransaction CreateReadTransaction()
    {
        var transact = new SessionTransaction(this, false);
        _lock.EnterReadLock();
        return transact;
    }

    public SessionTransaction CreateReadWriteTransaction()
    {
        var transact = new SessionTransaction(this, true);
        _lock.EnterWriteLock();
        return transact;
    }

    // The methods now! Methods assume you're inside a read or read-write transaction, depending
    // on the method.

    // Requires a read-write transaction.
    public Player AddPlayer(string name)
    {
        if (Phase != GamePhase.WaitingForPlayers)
        {
            throw new InvalidOperationException("Cannot add players after the game has started");
        }

        int id = _idCounter;
        _idCounter++;

        var player = new Player
        {
            Id = id, 
            Name = name, 
            LoginToken = UserToken.Generate(), 
            Cards = Enumerable.Range(0, CardsPerPlayer).Select(_ => new Card()).ToArray()
        };
        Players = Players.Add(id, player);
        PlayersByToken = PlayersByToken.Add(player.LoginToken, player);
        return player;
    }

    // Requires a read-write transaction.
    // Returns false if the player has not been found.
    public bool PlayerQuit(int id)
    {
        if (Players.TryGetValue(id, out var player))
        {
            if (Phase == GamePhase.WaitingForPlayers)
            {
                // Remove the player
                Players = Players.Remove(id);
                PlayersByToken = PlayersByToken.Remove(player.LoginToken);
            }
            else
            {
                // Mark them as left?
            }
        }
        else
        {
            return false;
        }

        return true;
    }

    // Requires a read-write transaction.
    public bool StartGame()
    {
        if (Phase != GamePhase.WaitingForPlayers)
        {
            return false;
        }

        if (Players.Count < 1)
        {
            return false;
        }

        Phase = GamePhase.CreatingCards;

        return true;
    }

    // Requires a read-write transaction.
    public void TerminateGame()
    {
        Phase = GamePhase.Terminated;
    }

    public readonly struct SessionTransaction(GameSession session, bool rw) : IDisposable
    {
        public void Dispose()
        {
            if (rw)
            {
                session._lock.ExitWriteLock();
            }
            else
            {
                session._lock.ExitReadLock();
            }
        }
    }
}