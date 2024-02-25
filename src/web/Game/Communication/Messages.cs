using System.Text.Json.Serialization;
using CardLab.Game.Duels;

namespace CardLab.Game.Communication;

[JsonDerivedType(typeof(HelloWorldMessage), "helloWorld")]
[JsonDerivedType(typeof(LobbyPlayerUpdatedMessage), "lobbyPlayerUpdated")]
[JsonDerivedType(typeof(SwitchedPhaseMessage), "switchedPhase")]
[JsonDerivedType(typeof(WelcomeMessage), "welcome")]
[JsonDerivedType(typeof(DuelWelcomeMessage), "duelWelcome")]
[JsonDerivedType(typeof(DuelMutatedMessage), "duelMutated")]
[JsonDerivedType(typeof(DuelRequestFailed), "duelRequestFailed")]
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