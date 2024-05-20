using System.Collections.Immutable;
using System.Text.Json.Serialization;

namespace CardLab.Game.Communication;

[JsonPolymorphic(TypeDiscriminatorPropertyName = "type")]
[JsonDerivedType(typeof(WaitingForPlayersStatePayload), "waitingForPlayers")]
[JsonDerivedType(typeof(CreatingCardsStatePayload), "creatingCards")]
[JsonDerivedType(typeof(TutorialStatePayload), "tutorial")]
[JsonDerivedType(typeof(PreparationStatePayload), "preparation")]
[JsonDerivedType(typeof(DuelsStatePayload), "duels")]
public abstract record PhaseStatePayload;

public sealed record WaitingForPlayersStatePayload(string Code, ImmutableArray<PlayerPayload> Players) : PhaseStatePayload;

public sealed record CreatingCardsStatePayload : PhaseStatePayload
{
    public CreatingCardsStatePayload(HostData host)
    {
        Host = host; 
    }
    
    public CreatingCardsStatePayload(PlayerData player)
    {
        Player = player;
    }
    
    public sealed record HostData(); // Empty for now

    public sealed record PlayerData(ImmutableArray<CardDefinition> Cards);
    
    public HostData? Host { get; } = null;
    public PlayerData? Player { get; } = null;
}

public sealed record TutorialStatePayload(bool Started) : PhaseStatePayload;
public sealed record PreparationStatePayload(PreparationPhase.Status Status, string? YourOpponent) : PhaseStatePayload;

public readonly record struct DuelInfoPayload(int Id, string Player1, string Player2, bool Ongoing, int WhoWon);

// For the host only!
public sealed record DuelsStatePayload(bool RoundOngoing,
    ImmutableArray<DuelInfoPayload> Duels, 
    ImmutableArray<DuelsStatePayload.LeaderboardEntry> Leaderboard) : PhaseStatePayload
{
    // WhoWon is the index of the winner; negative if nobody won.
    public readonly record struct LeaderboardEntry(int Id, string Player, int Score);
}