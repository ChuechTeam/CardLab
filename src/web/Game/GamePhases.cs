using System.Collections.Immutable;
using System.Reflection.Metadata.Ecma335;
using System.Text.Json.Serialization;
using CardLab.Game.Communication;

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

public sealed record PostCreatePhase(GameSession Session) : GamePhase(Session, GamePhaseName.PostCreate);

public sealed record EndedPhase(GameSession Session) : GamePhase(Session, GamePhaseName.Ended);

public sealed record TerminatedPhase(GameSession Session) : GamePhase(Session, GamePhaseName.Terminated);