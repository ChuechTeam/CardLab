using System.Text.Json.Serialization;

namespace CardLab.Game.Communication;

[JsonDerivedType(typeof(HelloWorldMessage), "helloWorld")]
[JsonDerivedType(typeof(LobbyPlayerUpdatedMessage), "lobbyPlayerUpdated")]
[JsonDerivedType(typeof(SwitchedPhaseMessage), "switchedPhase")]
[JsonDerivedType(typeof(WelcomeMessage), "welcome")]
[JsonPolymorphic(TypeDiscriminatorPropertyName = "type")]
public abstract record LabMessage;

public record HelloWorldMessage(string Message) : LabMessage();

public enum LobbyPlayerUpdateKind
{
    Join,
    Quit,
    Update
}

public record LobbyPlayerUpdatedMessage(int PlayerId, string PlayerName, LobbyPlayerUpdateKind Kind) : LabMessage;
public record SwitchedPhaseMessage(GamePhaseName Name, PhaseStatePayload? State) : LabMessage;

public record WelcomeMessage(PlayerPayload? Me, GamePhaseName PhaseName, PhaseStatePayload? PhaseState) : LabMessage;