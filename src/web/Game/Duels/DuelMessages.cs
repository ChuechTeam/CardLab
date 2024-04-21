using System.Collections.Immutable;
using System.Text.Json.Serialization;
using CardLab.Game.Communication;

namespace CardLab.Game.Duels;

// Remember to add the new message to the LabMessage JSON attributes in Messages.cs
public abstract record DuelMessage : LabMessage;

// Timer is in milliseconds
public record DuelWelcomeMessage(
    DuelState State,
    DuelPropositions Propositions,
    int Iteration,
    PlayerIndex Player,
    [property: JsonPropertyName("p1Name")] string P1Name,
    [property: JsonPropertyName("p2Name")] string P2Name,
    int? Timer) : DuelMessage;

public record DuelMutatedMessage(List<DuelStateDelta> Deltas, PlayerIndex WhoseTurn,
    DuelPropositions Propositions, int Iteration, int? Timer)
    : DuelMessage;

public record DuelRequestFailedMessage(int RequestId, string Reason) : DuelMessage;

public record DuelRequestAckMessage(int RequestId) : DuelMessage;

public readonly record struct DuelRequestHeader(int RequestId, int Iteration);

public record DuelEndTurnMessage(DuelRequestHeader Header) : DuelMessage;

public record DuelUseCardPropositionMessage(
    DuelRequestHeader Header,
    int CardId,
    ImmutableArray<DuelArenaPosition> ChosenSlots,
    ImmutableArray<int> ChosenEntities) : DuelMessage;

public record DuelUseUnitPropositionMessage(
    DuelRequestHeader Header,
    int UnitId,
    int ChosenEntityId) : DuelMessage;

public record DuelControlTimer(bool Pause) : DuelMessage; // Not a request, because we don't care about the response 

public record DuelReportReady() : DuelMessage; // Not a request, because we don't care about the response 
public record DuelTimerUpdated(int Timer) : DuelMessage;