using System.Collections.Immutable;

namespace CardLab.Game.Duels;

// Actions are functions running fragments sequentially, initiated by a player, a card, or a unit.

public sealed partial class Duel
{
    private DuelAction ActPlayUnitCard(PlayerIndex player, UnitDuelCard card, int placementIdx)
    {
        return new DuelAction(F, $"PlayUnitCard (cardId={card.Id}, placementIdx={placementIdx})");

        DuelMutation F(DuelMutation mut)
        {
            var (frag, res) = ApplyFragEx(mut, FragPlayCard(card.Id, player));
            if (res.Success)
            {
                frag = ApplyFrag(frag, FragPlaceUnit(player, MakeUnit(card), placementIdx));
            }

            return frag;
        }
    }

    private DuelAction ActNextTurn()
    {
        return new DuelAction(F, "NextTurn");

        // right now we ignore failures... what should we do when the deck is empty?
        DuelMutation F(DuelMutation mut)
        {
            var nextPlayer = mut.State.WhoseTurn == PlayerIndex.P1 ? PlayerIndex.P2 : PlayerIndex.P1;
            var frag = ApplyFrag(mut, FragSwitchTurn(nextPlayer));
            frag = ApplyFrag(frag, FragDrawDeckCards(nextPlayer, 1));
            return frag;
        }
    }

    private DuelAction ActGameStartRandom()
    {
        return new DuelAction(F, "GameStartRandom");

        DuelMutation F(DuelMutation mut)
        {
            var randomGuy = (PlayerIndex)_rand.Next(0, 2);

            var frag = ApplyFrag(mut, FragDrawDeckCards(PlayerIndex.P1, Settings.StartCards));
            frag = ApplyFrag(frag, FragDrawDeckCards(PlayerIndex.P2, Settings.StartCards));
            frag = ApplyFrag(frag, FragSwitchTurn(randomGuy));
            return frag;
        }
    }

    private DuelAction ActUseUnitAttack(DuelUnit unit, DuelTarget target)
    {
        return new DuelAction(F, $"UseUnitAttack (unitId={unit.Id}, target={target})");

        DuelMutation F(DuelMutation mut)
        {
            (mut, var fr) = ApplyFragEx(mut, FragAttackUnit(unit.Id, target));
            if (fr.Success)
            {
                mut = ApplyFrag(mut, FragUnitConsumeAction(unit.Id));
            }

            return mut;
        }
    }
    
    public DuelMutation ApplyActOpt(DuelMutation mut, DuelAction action)
    {
        _logger.LogTrace("Applying action start: {Act}", action.Name);

        if (action.Scope is not null)
        {
            mut = mut.Apply(action.Scope with { State = ScopeDelta.ScopeState.Start }).ThrowIfFailed();
        }

        mut = action.Function(mut);

        if (action.Scope is not null)
        {
            mut = mut.Apply(action.Scope with { State = ScopeDelta.ScopeState.End }).ThrowIfFailed();
        }

        _logger.LogTrace("Applying action end: {Act}", action.Name);

        return mut;
    }
}

public readonly record struct DuelAction(
    Func<DuelMutation, DuelMutation> Function,
    string Name, // Used for debug
    ScopeDelta? Scope = null)
{
    public override string ToString() => Name;
}