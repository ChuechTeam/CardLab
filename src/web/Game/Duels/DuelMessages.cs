using CardLab.Game.Communication;

namespace CardLab.Game.Duels;

// Remember to add the new message to the LabMessage JSON attributes in Messages.cs
public abstract record DuelMessage : LabMessage;

public record DuelWelcomeMessage(DuelState State, DuelPropositions Propositions,
    int Iteration, PlayerIndex Player) : DuelMessage;

public record DuelMutatedMessage(List<DuelStateDelta> Deltas, DuelPropositions Propositions, int Iteration) : DuelMessage;

public record DuelRequestFailed(int RequestId, string Reason) : DuelMessage;