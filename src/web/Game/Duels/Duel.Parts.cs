using System.Collections.Immutable;

namespace CardLab.Game.Duels;

// Parts are functions used inside fragments that can often trigger events.

public sealed partial class Duel
{
    public DuelFragment PartHurtEntity(DuelFragment frag, DuelSource source, DuelTarget target, int hp, 
        out bool success)
    {
        success = false;
        if (hp < 0)
        {
            return frag;
        }

        switch (target)
        {
            case UnitDuelTarget unitTarget:
            {
                var unit = frag.Mutation.State.Units.GetValueOrDefault(unitTarget.UnitId);
                if (unit is null)
                {
                    return frag;
                }

                if (unit.Attribs.CurHealth <= 0)
                {
                    return frag;
                }
                
                var newAttribs = unit.Attribs with { CurHealth = unit.Attribs.CurHealth - hp };
                frag = FragDeltaOpt(frag, new UpdateBoardAttribsDelta
                {
                    Attribs = ImmutableArray.Create(new UpdateBoardAttribsDelta.AttribChange(unit.Id, newAttribs))
                });

                break;
            }
            case CoreDuelTarget coreTarget:
            {
                var coreHp = frag.Mutation.State.GetPlayer(coreTarget.Player).CoreHealth;
                if (coreHp <= 0)
                {
                    return frag;
                }
                
                frag = FragDeltaOpt(frag, new UpdateBoardAttribsDelta
                {
                    CoreHealths = PlayerPair.ForPlayer<int?>(coreTarget.Player, coreHp - hp)
                });
                
                break;
            }
        }

        frag = HandlePostHurt(frag, source, target, ref hp);
        success = true;
        return frag;
    }
}