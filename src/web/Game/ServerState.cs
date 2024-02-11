using System.Collections.Immutable;
using System.Security.Cryptography;

namespace CardLab.Game;

public class ServerState
{
    private const string CodeAlphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    private const int CodeLength = 5;
    
    private ReaderWriterLockSlim _lock = new();
    
    // TODO: Have some background service or something that clears out ended sessions.
    private Dictionary<int, GameSession> _sessions = new();
    
    private Dictionary<string, GameSession> _sessionsByCode = new();

    private int _idCounter = 1;

    public GameSession? FindSession(int id)
    {
        _lock.EnterReadLock();
        try
        {
            return _sessions.GetValueOrDefault(id);
        }
        finally
        {
            _lock.ExitReadLock();
        }
    }
    
    public GameSession? FindSession(string code)
    {
        string normalized = code.ToUpperInvariant();
        
        _lock.EnterReadLock();
        try
        {
            return _sessionsByCode.GetValueOrDefault(normalized);
        }
        finally
        {
            _lock.ExitReadLock();
        }
    }
    
    public GameSession CreateSession()
    {
        _lock.EnterWriteLock();
        try
        {
            int id = _idCounter;
            _idCounter++;

            string code;
            do
            {
                code = RandomNumberGenerator.GetString(CodeAlphabet, CodeLength);
            } while (_sessionsByCode.ContainsKey(code));
            
            GameSession session = new(id, code);
            _sessions.Add(id, session);
            _sessionsByCode.Add(code, session);

            return session;
        }
        finally
        {
            _lock.ExitWriteLock();
        }
    }

    public ImmutableArray<GameSession> GetAllSessions()
    {
        _lock.EnterReadLock();
        try
        {
            return _sessions.Values.ToImmutableArray();
        }
        finally
        {
            _lock.ExitReadLock();
        }
    } 
}