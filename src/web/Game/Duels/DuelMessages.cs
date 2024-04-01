using System.Collections.Immutable;
using CardLab.Game.Communication;

namespace CardLab.Game.Duels;

// Remember to add the new message to the LabMessage JSON attributes in Messages.cs
public abstract record DuelMessage : LabMessage;

public record DuelWelcomeMessage(
    DuelState State,
    DuelPropositions Propositions,
    int Iteration,
    PlayerIndex Player) : DuelMessage;

public record DuelMutatedMessage(List<DuelStateDelta> Deltas, DuelPropositions Propositions, int Iteration)
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