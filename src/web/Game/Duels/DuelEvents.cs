namespace CardLab.Game.Duels;

public abstract record DuelEvent;
public record DuelEndedEvent(PlayerIndex? Winner) : DuelEvent;