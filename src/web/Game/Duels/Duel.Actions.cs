using System.Collections.Immutable;

namespace CardLab.Game.Duels;

// Actions are functions running fragments sequentially, initiated by a player, a card, or a unit.

public sealed partial class Duel
{
    private sealed class ActPlayUnitCard(PlayerIndex player, UnitDuelCard card, DuelGridVec placementVec)
        : SeqDuelAction
    {
        public override ScopeDelta? Scope { get; } = new CardPlayScopeDelta(card.Id, player);

        protected override ImmutableArray<(DuelFragment2<bool> frag, bool required)> GetFragments(Duel duel)
        {
            return
            [
                (new FragUseCard(card.Id, player), true),
                (new FragPlaceUnit(player, duel.MakeUnit(card, player), placementVec), true)
            ];
        }
    }

    private sealed class ActNextTurn : DuelAction
    {
        // right now we ignore failures... what should we do when the deck is empty?
        public override void Run(Duel duel, DuelMutation mut)
        {
            var nextPlayer = duel.State.WhoseTurn == PlayerIndex.P1 ? PlayerIndex.P2 : PlayerIndex.P1;

            mut.ApplyFrag(new FragSwitchTurn(nextPlayer));
            mut.ApplyFrag(new FragDrawDeckCards(nextPlayer, 1));
        }
    }

    private sealed class ActGameStartRandom : DuelAction
    {
        public override void Run(Duel duel, DuelMutation mut)
        {
            var randomGuy = (PlayerIndex)duel._rand.Next(0, 2);

            mut.ApplyFrag(new FragSwitchToPlay());
            mut.ApplyFrag(new FragDrawDeckCards(PlayerIndex.P1, duel.Settings.StartCards));
            mut.ApplyFrag(new FragDrawDeckCards(PlayerIndex.P2, duel.Settings.StartCards));
            mut.ApplyFrag(new FragSwitchTurn(randomGuy));
        }
    }

    private sealed class ActUseUnitAttack(DuelUnit unit, DuelTarget target) : SeqDuelAction
    {
        protected override ImmutableArray<(DuelFragment2<bool> frag, bool required)> GetFragments(Duel duel)
        {
            return
            [
                (new FragAttackUnit(unit.Id, target), true),
                (new FragUnitConsumeAction(unit.Id), true)
            ];
        }
    }

    public void ApplyAct(DuelMutation mut, DuelAction action)
    {
        _logger.LogTrace("Applying action start: {Act}", action);

        if (action.Scope is not null)
        {
            mut.Apply(action.Scope with { State = ScopeDelta.ScopeState.Start }).ThrowIfFailed();
        }

        action.Run(this, mut);

        if (action.Scope is not null)
        {
            mut.Apply(action.Scope with { State = ScopeDelta.ScopeState.End }).ThrowIfFailed();
        }

        _logger.LogTrace("Applying action end: {Act}", action);
    }
}

public abstract class DuelAction
{
    public virtual ScopeDelta? Scope => null;

    public abstract void Run(Duel duel, DuelMutation mut);

    public virtual bool CanDo(Duel duel) => true;
}

public abstract class SeqDuelAction : DuelAction
{
    protected abstract ImmutableArray<(DuelFragment2<bool> frag, bool required)> GetFragments(Duel duel);

    public override void Run(Duel duel, DuelMutation mut)
    {
        var frags = GetFragments(duel);
        foreach (var f in frags)
        {
            var res = mut.ApplyFrag(f.frag);
            if (!res && f.required)
            {
                break;
            }
        }
    }

    public override bool CanDo(Duel duel)
    {
        var frags = GetFragments(duel);

        return frags.All(x => x.required && x.frag.Verify(duel));
    }
}