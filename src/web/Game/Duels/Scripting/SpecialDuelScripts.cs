using System.Collections.Immutable;
using Microsoft.AspNetCore.OutputCaching;

namespace CardLab.Game.Duels.Scripting;

public static class SpecialDuelScripts
{
    public static readonly List<Func<Duel, IEntity, DuelScript>> Scripts = [];

    private static int AddScript(Func<Duel, IEntity, DuelScript> scriptFunc)
    {
        Scripts.Add(scriptFunc);
        return Scripts.Count - 1;
    }

    public static readonly int Test = AddScript((a, b) => new TestSpecialScript(a, b));
    public static readonly int Test2 = AddScript((a, b) => new Test2SpecialScript(a, b));
    public static readonly int EvasionFiscale = AddScript((a, b) => new EvasionFiscaleSpecialScript(a, b));
    public static readonly int RecyclageAstucieux = AddScript((a, b) => new RecyclageAstucieuxSpecialScript(a, b));
}

public class TestSpecialScript(Duel duel, IEntity entity) : DuelScript(duel, entity)
{
    public override bool CardCanPlay(DuelFragment frag, PlayerIndex player, ImmutableArray<DuelArenaPosition> slots,
        ImmutableArray<int> entities)
    {
        return entities.Length == 1 && State.FindUnit(entities[0]) is { } unit && unit.Owner == player;
    }

    public override void CardOnPlay(DuelFragment frag, PlayerIndex player, ImmutableArray<DuelArenaPosition> slots,
        ImmutableArray<int> entities)
    {
        //var target = State.FindUnit(entities[0])!;
        frag.ApplyFrag(new Duel.FragEffect(Entity.Id, EffectTint.Neutral, f =>
        {
            f.ApplyFrag(new Duel.FragAlteration(Entity.Id, entities[0], true, f2 =>
            {
                f2.ApplyFrag(new Duel.FragAddModifiers(new DuelModifier
                {
                    Attribute = DuelBaseAttrs.Attack,
                    Op = DuelModifierOperation.Add,
                    Value = 3,
                    TargetId = entities[0],
                    TurnsRemaining = 1,
                    SourceId = Entity.Id
                }));
            }));
        }));
    }
}

public class Test2SpecialScript(Duel duel, IEntity entity) : DuelScript(duel, entity)
{
    private int _lastAttackIteration = -1;

    public override void PostSpawn(DuelFragment frag)
    {
        if (Entity is DuelUnit u)
        {
            var me = State.GetPlayer(u.Owner);
            var meId = me.Id;
            var allies = me.ExistingUnits.ToList();
            var randAlly = allies.Count != 0 ? allies[Duel.Rand.Next(allies.Count)] : (int?)null;

            frag.EnqueueFragment(new Duel.FragUnitTrigger(u.Id, f =>
                f.ApplyFrag(new Duel.FragEffect(u.Id, EffectTint.Positive, f2 =>
                {
                    f2.ApplyFrag(new Duel.FragHealEntity(u.Id, meId, 1));
                    if (randAlly.HasValue)
                    {
                        f2.ApplyFrag(new Duel.FragHealEntity(u.Id, randAlly.Value, 1));
                    }
                }))));

            ListenFragment<Duel.FragAttackUnit>(f =>
            {
                if (f.UnitId == u.Id)
                {
                    _lastAttackIteration = Duel.StateIteration;
                    return;
                }

                if (State.FindUnit(f.TargetId) is { DeathPending: false } target
                    && State.FindUnit(f.UnitId) is { } attacker
                    && attacker.Owner == u.Owner
                    && f.UnitId != u.Id
                    && !u.DeathPending
                    && _lastAttackIteration != Duel.StateIteration)
                {
                    _lastAttackIteration = Duel.StateIteration;
                    f.EnqueueFragment(new Duel.FragUnitTrigger(u.Id, f2 =>
                        f2.ApplyFrag(new Duel.FragAttackUnit(u.Id, f.TargetId))));
                }
            });
        }
    }
}

public class EvasionFiscaleSpecialScript : DuelScript<DuelCard>
{
    public EvasionFiscaleSpecialScript(Duel duel, IEntity entity) : base(duel, entity)
    {
    }
    
    public override bool CardCanPlay(DuelFragment frag, PlayerIndex player1, ImmutableArray<DuelArenaPosition> slots,
        ImmutableArray<int> entities)
    {
        var owner = Entity.GetOwner();
        if (owner is null)
        {
            return false;
        }

        var player = State.GetPlayer(owner.Value);
        var compatible = 0;
        foreach (var c in player.Hand)
        {
            if (c != Entity.Id && State.FindCard(c)!.Attribs.GetCost() > 0)
            {
                compatible++;
                if (compatible == 2)
                {
                    return true;
                }
            }
        }
        
        return false;
    }

    public override void CardOnPlay(DuelFragment frag, PlayerIndex player, ImmutableArray<DuelArenaPosition> slots,
        ImmutableArray<int> entities)
    {
        var ps = State.GetPlayer(player);
        var cards = ps.Hand.ToList();
        cards.Remove(Entity.Id);

        frag.ApplyFrag(new Duel.FragEffect(Entity.Id, EffectTint.Neutral, f =>
        {
            foreach (var card in cards)
            {
                var cost = State.FindCard(card)!.Attribs.GetCost() - 1;
                if (cost >= 0)
                {
                    f.ApplyFrag(new Duel.FragAlteration(Entity.Id, card, true, f2 =>
                    {
                        f2.ApplyFrag(new Duel.FragSetAttribute(card, DuelBaseAttrs.Cost, cost));
                    }));
                }
            }
        }));
    }
}

public class RecyclageAstucieuxSpecialScript : DuelScript<DuelCard>
{
    public RecyclageAstucieuxSpecialScript(Duel duel, IEntity entity) : base(duel, entity)
    {
    }
    
    public override bool CardCanPlay(DuelFragment frag, PlayerIndex player, ImmutableArray<DuelArenaPosition> slots,
        ImmutableArray<int> entities)
    {
        return State.GetPlayer(player).Hand.Count > 2;
    }

    public override void CardOnPlay(DuelFragment frag, PlayerIndex player, ImmutableArray<DuelArenaPosition> slots,
        ImmutableArray<int> entities)
    {
        var ps = State.GetPlayer(player);
        var cards = ps.Hand.ToList();
        if (cards.Count == 0)
        {
            return;
        }

        var card = cards[Duel.Rand.Next(cards.Count)];
        frag.ApplyFrag(new Duel.FragEffect(Entity.Id, EffectTint.Neutral, f =>
        {
            f.ApplyFrag(new Duel.FragMoveCard(card, DuelCardLocation.Discarded));
            f.ApplyFrag(new Duel.FragDrawCards(player, 3));
        }) { DisableTargeting = true, StartDelay = 500, EndDelay = 200 });
    }
}