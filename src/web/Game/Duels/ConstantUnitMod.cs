namespace CardLab.Game.Duels;

public sealed class ConstantUnitMod : DuelUnitModifier
{
    public int MaxHealthMult { get; init; } = 1;
    public int AttackMult { get; init; } = 1;

    public int MaxHealthAdd { get; init; } = 0;
    public int AttackAdd { get; init; } = 0;

    public override void ModifyAttribs(ref DuelUnitAttribs attrs)
    {
        attrs.MaxHealth = attrs.MaxHealth * MaxHealthMult + MaxHealthAdd;
        attrs.Attack = attrs.Attack * AttackMult + AttackAdd;
    }
}