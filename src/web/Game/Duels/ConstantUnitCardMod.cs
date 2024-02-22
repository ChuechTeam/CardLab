namespace CardLab.Game.Duels;

public sealed class ConstantUnitCardMod : UnitDuelCardModifier
{
    public int HealthMult { get; init; } = 1;
    public int AttackMult { get; init; } = 1;

    public int HealthAdd { get; init; } = 0;
    public int AttackAdd { get; init; } = 0;

    public override DuelCardStats ModifyStats(DuelCardStats s)
    {
        return new DuelCardStats
        {
            Health = HealthMult * s.Health + HealthAdd, 
            Attack = AttackMult * s.Attack + AttackAdd
        };
    }
}