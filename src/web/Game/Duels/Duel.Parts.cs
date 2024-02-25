using System.Collections.Immutable;

namespace CardLab.Game.Duels;

// Parts are functions used inside fragments that can often trigger events.

public sealed partial class Duel
{
    public bool PartHurtEntity<T>(DuelFragment2<T> frag, DuelSource source, DuelTarget target, int hp)
    {
        if (hp < 0)
        {
            return false;
        }

        switch (target)
        {
            case UnitDuelTarget unitTarget:
            {
                var unit = State.Units.GetValueOrDefault(unitTarget.UnitId);
                if (unit is null)
                {
                    return false;
                }

                if (unit.Attribs.CurHealth <= 0)
                {
                    return false;
                }
                
                var newAttribs = unit.Attribs with { CurHealth = unit.Attribs.CurHealth - hp };
                unit.LastDamageSource = source; // update the damage source for death event
                frag.ApplyDelta(new UpdateBoardAttribsDelta
                {
                    Attribs = ImmutableArray.Create(new UpdateBoardAttribsDelta.AttribChange(unit.Id, newAttribs))
                });

                break;
            }
            case CoreDuelTarget coreTarget:
            {
                var coreHp = State.GetPlayer(coreTarget.Player).CoreHealth;
                if (coreHp <= 0)
                {
                    return false;
                }
                
                frag.ApplyDelta(new UpdateBoardAttribsDelta
                {
                    CoreHealths = PlayerPair.ForPlayer<int?>(coreTarget.Player, coreHp - hp)
                });
                
                break;
            }
        }

        HandlePostHurt(frag, source, target, hp);
        return true;
    }
}