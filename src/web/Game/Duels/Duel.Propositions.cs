using System.Collections.Immutable;

namespace CardLab.Game.Duels;

public sealed partial class Duel
{
    public DuelPropositions GeneratePropositions(PlayerIndex player)
    {
        var ps = State.GetPlayer(player);
        if (State.WhoseTurn != player)
        {
            return new DuelPropositions
            {
                Card = ImmutableArray<DuelCardProposition>.Empty,
                Unit = ImmutableArray<DuelUnitProposition>.Empty
            };
        }
        
        var cardProps = ImmutableArray.CreateBuilder<DuelCardProposition>();
        foreach (var id in ps.Hand)
        {
            var card = State.Cards[id];
            switch (card)
            {
                case UnitDuelCard:
                    var acceptableSlots = ImmutableArray.CreateBuilder<DuelArenaPosition>();
                    for (var x = 0; x < Settings.UnitsX; x++)
                    {
                        for (var y = 0; y < Settings.UnitsY; y++)
                        {
                            var vec = new DuelGridVec(x, y);
                            if (new ActPlayUnitCard(player, id, vec).Verify(this))
                            {
                                acceptableSlots.Add(new DuelArenaPosition(player, vec));
                            }
                        }
                    }

                    if (acceptableSlots.Count == 0)
                    {
                        break;
                    }
                    
                    cardProps.Add(new DuelCardProposition
                    {
                        CardId = id,
                        Requirement = CardRequirement.SingleSlot,
                        AllowedSlots = acceptableSlots.ToImmutable(),
                        AllowedEntities = ImmutableArray<int>.Empty
                    });
                    break;
                default:
                    _logger.LogWarning("Card type not supported: {CardType} ; Help!!", card.GetType());
                    break;
            }
        }
        
        var unitProps = ImmutableArray.CreateBuilder<DuelUnitProposition>();
        foreach (var id in ps.ExistingUnits)
        {
            var okEntities = ImmutableArray.CreateBuilder<int>();
            // for now we only accept attacking enemy units of course
            
            // top 10 binary hack
            foreach (var (otherId, otherUnit) in State.Units)
            {
                if (otherUnit.Owner != player && new ActUseUnitAttack(player, id, otherId).Verify(this))
                {
                    okEntities.Add(otherId);
                }
            }

            if (new ActUseUnitAttack(player, id, DuelIdentifiers.Player1).Verify(this))
            {
                okEntities.Add(DuelIdentifiers.Player1);
            }
            if (new ActUseUnitAttack(player, id, DuelIdentifiers.Player2).Verify(this))
            {
                okEntities.Add(DuelIdentifiers.Player2);
            }
            
            if (okEntities.Count == 0)
            {
                continue;
            }
            
            unitProps.Add(new DuelUnitProposition
            {
                UnitId = id,
                AllowedEntities = okEntities.ToImmutable()
            });
        }
        
        return new DuelPropositions
        {
            Card = cardProps.ToImmutable(),
            Unit = unitProps.ToImmutable()
        };
    }
}

public readonly record struct DuelPropositions
{
    public required ImmutableArray<DuelCardProposition> Card { get; init; }
    
    public required ImmutableArray<DuelUnitProposition> Unit { get; init; }
}

public readonly record struct DuelCardProposition
{
    public required int CardId { get; init; }
    
    public required CardRequirement Requirement { get; init; }
    
    public required ImmutableArray<int> AllowedEntities { get; init; }
    public required ImmutableArray<DuelArenaPosition> AllowedSlots { get; init; }
}

public readonly record struct DuelUnitProposition
{
    public required int UnitId { get; init; }
    
    public required ImmutableArray<int> AllowedEntities { get; init; }
}

public enum CardRequirement
{
    SingleSlot,
    None
}