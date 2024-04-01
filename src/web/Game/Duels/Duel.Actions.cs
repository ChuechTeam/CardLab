using System.Collections.Immutable;

namespace CardLab.Game.Duels;

// Actions are fragments that initiate a mutation.
// They're the root fragment of the tree, basically.
// Some of them can be initiated by players, others by the game itself, but never inside a mutation.
// todo: add error messages

public sealed partial class Duel
{
    private sealed class ActPlayUnitCard(PlayerIndex player, int cardId, DuelGridVec placementVec)
        : DuelAction
    {
        public override ScopeDelta? Scope { get; } = new CardPlayScopeDelta(cardId, player);

        protected override bool Verify()
        {
            if (State.WhoseTurn != player)
            {
                return false;
            }
            
            return new FragUseCard(cardId, player).Verify(Duel) &&
                   new FragSpawnUnit(player, cardId, new(player, placementVec)).Verify(Duel);
        }

        protected override bool Run()
        {
            if (ApplyFrag(new FragUseCard(cardId, player)) != DuelFragmentResult.Success)
            {
                return false;
            }

            if (ApplyFrag(new FragSpawnUnit(player, cardId, new(player, placementVec))) != DuelFragmentResult.Success)
            {
                return false;
            }

            return true;
        }
    }

    private sealed class ActNextTurn : DuelAction
    {
        protected override bool Run()
        {
            var nextPlayer = State.WhoseTurn == PlayerIndex.P1 ? PlayerIndex.P2 : PlayerIndex.P1;
            ApplyFrag(new FragSwitchTurn(nextPlayer));
            ApplyFrag(new FragDrawDeckCards(nextPlayer, 1));
            return true;
        }
    }

    private sealed class ActGameStartRandom : DuelAction
    {
        public override DuelStatus RequiredStatus { get; set; } = DuelStatus.AwaitingConnection;

        protected override bool Run()
        {
            var randomGuy = (PlayerIndex)Duel._rand.Next(0, 2);

            ApplyFrag(new FragSwitchToPlay());
            ApplyFrag(new FragDrawDeckCards(PlayerIndex.P1, Duel.Settings.StartCards));
            ApplyFrag(new FragDrawDeckCards(PlayerIndex.P2, Duel.Settings.StartCards));
            ApplyFrag(new FragSwitchTurn(randomGuy));

            return true;
        }
    }

    private sealed class ActUseUnitAttack(PlayerIndex initiator, int unitId, int targetId) : DuelAction
    {
        protected override bool Verify()
        {
            if (State.WhoseTurn != initiator)
            {
                return false;
            }
            
            if (State.FindUnit(unitId) is not { } unit
                || unit.Owner != initiator)
            {
                return false;
            }
            
            return new FragAttackUnit(unitId, targetId).Verify(Duel) &&
                   new FragUnitConsumeAction(unitId).Verify(Duel);
        }

        protected override bool Run()
        {
            if (ApplyFrag(new FragAttackUnit(unitId, targetId)) != DuelFragmentResult.Success)
            {
                return false;
            }

            if (ApplyFrag(new FragUnitConsumeAction(unitId)) != DuelFragmentResult.Success)
            {
                return false;
            }

            return true;
        }
    }
}

public abstract class DuelAction : DuelFragment
{
}