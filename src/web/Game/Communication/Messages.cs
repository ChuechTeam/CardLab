using System.Text.Json.Serialization;
using CardLab.Game.AssetPacking;
using CardLab.Game.Duels;

namespace CardLab.Game.Communication;

[JsonDerivedType(typeof(HelloWorldMessage), "helloWorld")]
[JsonDerivedType(typeof(LobbyPlayerUpdatedMessage), "lobbyPlayerUpdated")]
[JsonDerivedType(typeof(SwitchedPhaseMessage), "switchedPhase")]
[JsonDerivedType(typeof(WelcomeMessage), "welcome")]
[JsonDerivedType(typeof(SettingsChangedMessage), "settingsChanged")]
[JsonDerivedType(typeof(PackAvailableMessage), "packAvailable")]
[JsonDerivedType(typeof(SessionDuelStartedMessage), "sessionDuelStarted")]
[JsonDerivedType(typeof(SessionDuelEndedMessage), "sessionDuelEnded")]
[JsonDerivedType(typeof(TutorialStartedMessage), "tutorialStarted")]
[JsonDerivedType(typeof(PhaseStateUpdatedMessage), "phaseStateUpdated")]
[JsonDerivedType(typeof(DuelWelcomeMessage), "duelWelcome")]
[JsonDerivedType(typeof(DuelMutatedMessage), "duelMutated")]
[JsonDerivedType(typeof(DuelRequestFailedMessage), "duelRequestFailed")]
[JsonDerivedType(typeof(DuelRequestAckMessage), "duelRequestAck")]
[JsonDerivedType(typeof(DuelEndTurnMessage), "duelEndTurn")]
[JsonDerivedType(typeof(DuelUseCardPropositionMessage), "duelUseCardProposition")]
[JsonDerivedType(typeof(DuelUseUnitPropositionMessage), "duelUseUnitProposition")]
[JsonDerivedType(typeof(DuelControlTimer), "duelControlTimer")]
[JsonDerivedType(typeof(DuelReportReady), "duelReportReady")]
[JsonDerivedType(typeof(DuelTimerUpdated), "duelTimerUpdated")]
[JsonPolymorphic(TypeDiscriminatorPropertyName = "type")]
public abstract record LabMessage;

public record HelloWorldMessage(string Message) : LabMessage();

public enum LobbyPlayerUpdateKind
{
    Join,
    Quit,
    Update
}

public sealed record LobbyPlayerUpdatedMessage(int PlayerId, string PlayerName, LobbyPlayerUpdateKind Kind) : LabMessage;

public sealed record SwitchedPhaseMessage(GamePhaseName Name, PhaseStatePayload? State) : LabMessage;

public sealed record WelcomeMessage(
    int TempId,
    Guid PermId,
    string Code,
    PlayerPayload? Me,
    DownloadablePackPayload? Pack,
    DuelWelcomeMessage? Duel,
    int? DuelId,
    bool DuelRequireSessionPack,
    GamePhaseName PhaseName,
    PhaseStatePayload? PhaseState,
    UserGameSessionSettings Settings) : LabMessage;

public sealed record SettingsChangedMessage(UserGameSessionSettings Settings) : LabMessage;

public sealed record PackAvailableMessage(DownloadablePackPayload Pack) : LabMessage;

public sealed record SessionDuelStartedMessage(int Id, bool RequireSessionPack, DuelWelcomeMessage Welcome) : LabMessage;
public sealed record SessionDuelEndedMessage() : LabMessage;

public sealed record TutorialStartedMessage : LabMessage;

public sealed record PhaseStateUpdatedMessage(PhaseStatePayload? State) : LabMessage;