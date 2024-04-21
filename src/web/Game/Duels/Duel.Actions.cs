using System.Collections.Immutable;

namespace CardLab.Game.Duels;

// Actions are fragments that initiate a mutation.
// They're the root fragment of the tree, basically.
// Some of them can be initiated by players, others by the game itself, but never inside a mutation.
// todo: add error messages

public sealed partial class Duel
{
    public sealed class ActPlayCard(PlayerIndex player, int cardId, 
        ImmutableArray<DuelArenaPosition> slots,
        ImmutableArray<int> entities)
        : DuelAction
    {
        public PlayerIndex Player { get; } = player;
        public int CardId { get; } = cardId;
        
        public override ScopeDelta? Scope { get; protected set; } = new CardPlayScopeDelta(cardId, player);

        public static bool MightBePlayableInHand(Duel duel, int cardId, PlayerIndex player)
        {
            if (duel.State.FindCard(cardId) is not { } card)
            {
                return false;
            }

            return FragUseCard.CanUseInHand(duel, cardId, player);
        }
        
        protected override bool Verify()
        {
            if (State.WhoseTurn != Player)
            {
                return false;
            }

            if (State.FindCard(CardId) is not { } card)
            {
                return false;
            }
            
            foreach (var frag in FragmentsToRun(card))
            {
                if (!frag.Verify(Duel))
                {
                    return false;
                }    
            }

            if (card.Script is not null
                && !card.Script.CardCanPlay(this, Player, slots, entities))
            {
                return false;
            }
            
            switch (card.Requirement)
            {
                case CardRequirement.SingleSlot:
                    if (slots.Length != 1)
                    {
                        return false;
                    }
                    break;
                case CardRequirement.SingleEntity:
                    if (entities.Length != 1)
                    {
                        return false;
                    }
                    break;
                case CardRequirement.None:
                default: break;
                    // nothing
            }

            return true;
        }

        protected override bool Run()
        {
            var card = State.FindCard(CardId)!;
            foreach (var fragment in FragmentsToRun(card))
            {
                if (ApplyFrag(fragment) != DuelFragmentResult.Success)
                {
                    return false;
                }
            }

            if (card.Type == CardType.Spell)
            {
                card.Script?.CardOnPlay(this, Player, slots, entities);
            }

            var ps = State.GetPlayer(Player);
            var newVal = ps.Attribs.GetCardsPlayedThisTurn() + 1;
            ApplyFrag(new FragSetAttribute(ps.Id, DuelBaseAttrs.CardsPlayedThisTurn, newVal));

            return true;
        }

        private IEnumerable<DuelFragment> FragmentsToRun(DuelCard card)
        {
            yield return new FragUseCard(CardId, Player);
            
            switch (card.Type)
            {
                case CardType.Unit:
                    var slot = slots[0];
                    yield return new FragSpawnUnit(Player, CardId, slot);
                    break;
                case CardType.Spell:
                    break;
                default:
                    throw new ArgumentOutOfRangeException();
            }
        }
    }

    public sealed class ActNextTurn : DuelAction
    {
        protected override bool Run()
        {
            var nextPlayer = State.WhoseTurn == PlayerIndex.P1 ? PlayerIndex.P2 : PlayerIndex.P1;
            ApplyFrag(new FragSwitchTurn(nextPlayer));
            ApplyFrag(new FragDrawCards(nextPlayer, 1));
            return true;
        }
    }

    public sealed class ActGameStartRandom : DuelAction
    {
        public override DuelStatus RequiredStatus { get; set; } = DuelStatus.AwaitingConnection;

        protected override bool Run()
        {
            var randomGuy = (PlayerIndex)Random.Shared.Next(0, 2);
            
            ApplyFrag(new FragSwitchToPlay());
            ApplyFrag(new FragDrawCards(PlayerIndex.P1, Duel.Settings.StartCards));
            ApplyFrag(new FragDrawCards(PlayerIndex.P2, Duel.Settings.StartCards));
            ApplyFrag(new FragSwitchTurn(randomGuy));

            return true;
        }
    }

    public sealed class ActUseUnitAttack(PlayerIndex initiator, int unitId, int targetId) : DuelAction
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

    public sealed class ActTerminateGame : DuelAction
    {
        protected override bool Run()
        {
            ApplyFrag(new FragSwitchToEnd(null));
            return true;
        }
    }
}

public abstract class DuelAction : DuelFragment
{
}