namespace CardLab.Game;

public enum GamePhaseName
{
    WaitingForPlayers,
    CreatingCards,
    PostCreate,
    Ended,
    Terminated
}

public abstract record GamePhase(GameSession Session, GamePhaseName Name)
{
    public virtual void OnStart()
    {
    }

    public virtual void OnEnd()
    {
    }
}

public sealed record WaitingForPlayersPhase(GameSession Session) : GamePhase(Session, GamePhaseName.WaitingForPlayers);

public sealed record CreatingCardsPhase(GameSession Session) : GamePhase(Session, GamePhaseName.CreatingCards)
{
    public int PendingCardUploads { get; private set; } = 0;

    public bool WaitingForRemainingUploads { get; private set; } = false;
    
    
    // Those functions assume we're in a lock on session.
    
    public void RegisterCardUploadBegin()
    {
        PendingCardUploads++;
    }

    public void RegisterCardUploadDone()
    {
        PendingCardUploads--;
        if (PendingCardUploads == 0 && WaitingForRemainingUploads)
        {
            Session.SwitchPhase(GamePhaseName.PostCreate);
        }
    }
}

public sealed record PostCreatePhase(GameSession Session) : GamePhase(Session, GamePhaseName.PostCreate);

public sealed record EndedPhase(GameSession Session) : GamePhase(Session, GamePhaseName.Ended);

public sealed record TerminatedPhase(GameSession Session) : GamePhase(Session, GamePhaseName.Terminated);
