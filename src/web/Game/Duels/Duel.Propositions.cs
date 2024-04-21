using System.Collections.Immutable;
using System.Data;

namespace CardLab.Game.Duels;

public sealed partial class Duel
{
    public DuelPropositions GeneratePropositions(PlayerIndex player)
    {
        var ps = State.GetPlayer(player);
        if (State.WhoseTurn != player || State.Status != DuelStatus.Playing)
        {
            return new DuelPropositions
            {
                Card = ImmutableArray<DuelCardProposition>.Empty,
                Unit = ImmutableArray<DuelUnitProposition>.Empty
            };
        }
        
        // For now, this is a bit performance-heavy, we could ask the cards for some custom logic.
        var cardProps = ImmutableArray.CreateBuilder<DuelCardProposition>();
        List<IEntity>? selectableEntities = null;
        foreach (var id in ps.Hand)
        {
            var card = State.Cards[id];
            if (!ActPlayCard.MightBePlayableInHand(this, id, player))
            {
                continue;
            }
            
            switch (card.Requirement)
            {
                case CardRequirement.SingleSlot:
                    var acceptableSlots = ImmutableArray.CreateBuilder<DuelArenaPosition>();
                    for (int i = 0; i <= 1; i++)
                    {
                        var pl = (PlayerIndex)i;
                        var isUnit = card.Type == CardType.Unit;
                        
                        // Early weed-out for units
                        if (isUnit && pl != player)
                        {
                            continue;
                        }
                        
                        var slotPlayer = State.GetPlayer(pl);
                        for (var x = 0; x < Settings.UnitsX; x++)
                        {
                            for (var y = 0; y < Settings.UnitsY; y++)
                            {
                                var pos = new DuelArenaPosition(pl, new DuelGridVec(x, y));
                                // Early weed-out for units
                                if (isUnit && slotPlayer.Units[pos.Vec.ToIndex(this)] != null)
                                {
                                    continue;
                                }
                                
                                if (new ActPlayCard(player, id, [pos], []).Verify(this))
                                {
                                    acceptableSlots.Add(pos);
                                }
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
                case CardRequirement.SingleEntity:
                    selectableEntities ??=
                    [
                        ..State.Units.Values, 
                        State.Player1, 
                        State.Player2,
                        ..State.Cards.Values.Where(x=> x.Location != DuelCardLocation.DeckP1 
                                                       && x.Location != DuelCardLocation.DeckP2
                                                       && x.Location != DuelCardLocation.Discarded)
                    ];
                    var acceptableEntities = ImmutableArray.CreateBuilder<int>();
                    foreach (var entity in selectableEntities)
                    {
                        if (new ActPlayCard(player, id, ImmutableArray<DuelArenaPosition>.Empty, [entity.Id]).Verify(this))
                        {
                            acceptableEntities.Add(entity.Id);
                        }
                    }
                    
                    if (acceptableEntities.Count != 0)
                    {
                        cardProps.Add(new DuelCardProposition
                        {
                            CardId = id,
                            Requirement = CardRequirement.SingleEntity,
                            AllowedSlots = ImmutableArray<DuelArenaPosition>.Empty,
                            AllowedEntities = acceptableEntities.ToImmutable()
                        });
                    }

                    break;
                case CardRequirement.None:
                    if (new ActPlayCard(player, id, [], []).Verify(this))
                    {
                        cardProps.Add(new DuelCardProposition
                        {
                            CardId = id,
                            Requirement = CardRequirement.None,
                            AllowedSlots = [],
                            AllowedEntities = []
                        });
                    }

                    break;
                default:
                    Logger.LogWarning("Card type not supported: {CardType} ; Help!!", card.GetType());
                    break;
            }
        }
        
        var unitProps = ImmutableArray.CreateBuilder<DuelUnitProposition>();
        foreach (var id in ps.ExistingUnits)
        {
            var okEntities = ImmutableArray.CreateBuilder<int>();
            // for now we only accept attacking enemy units of course
            
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