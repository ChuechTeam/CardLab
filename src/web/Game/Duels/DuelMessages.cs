using CardLab.Game.Communication;

namespace CardLab.Game.Duels;

// Remember to add the new message to the LabMessage JSON attributes in Messages.cs
public abstract record DuelMessage : LabMessage;

public record DuelStatusChangedMessage(DuelStatus Status) : DuelMessage;

public record DuelWelcomeMessage(DuelState State, int Iteration, DuelStatus Status) : DuelMessage;

public record DuelMutatedMessage(List<DuelStateDelta> Deltas, DuelState State, int Iteration) : DuelMessage;

public record DuelRequestFailed(int RequestId, string Reason) : DuelMessage;