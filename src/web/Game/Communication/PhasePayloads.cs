using System.Collections.Immutable;
using System.Text.Json.Serialization;

namespace CardLab.Game.Communication;

[JsonPolymorphic(TypeDiscriminatorPropertyName = "type")]
[JsonDerivedType(typeof(WaitingForPlayersStatePayload), "waitingForPlayers")]
[JsonDerivedType(typeof(CreatingCardsStatePayload), "creatingCards")]
public abstract record PhaseStatePayload;

public record WaitingForPlayersStatePayload(string Code, ImmutableArray<PlayerPayload> Players) : PhaseStatePayload;

public record CreatingCardsStatePayload : PhaseStatePayload
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