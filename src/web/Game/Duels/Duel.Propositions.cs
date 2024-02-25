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
                case UnitDuelCard unitCard:
                    var acceptableSlots = ImmutableArray.CreateBuilder<DuelGridVec>();
                    for (var x = 0; x < Settings.UnitsX; x++)
                    {
                        for (var y = 0; y < Settings.UnitsY; y++)
                        {
                            var vec = new DuelGridVec(x, y);
                            if (new ActPlayUnitCard(player, unitCard, vec).CanDo(this))
                            {
                                acceptableSlots.Add(vec);
                            }
                        }
                    }

                    if (acceptableSlots.Count == 0)
                    {
                        break;
                    }

                    var pair = new PlayerPair<ImmutableArray<DuelGridVec>>(ImmutableArray<DuelGridVec>.Empty);
                    pair[player] = acceptableSlots.ToImmutable();
                    
                    cardProps.Add(new DuelCardProposition
                    {
                        CardId = id,
                        Requirement = CardRequirement.SingleChoice,
                        AllowedSlots = pair,
                        AllowedCores = new(false)
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
            var unit = State.Units[id];
            
            var acceptableUnits = ImmutableArray.CreateBuilder<int>();
            // for now we only accept attacking enemy units of course
            
            // top 10 binary hack
            foreach (var otherId in State.Players[~(int)player & 1].ExistingUnits)
            {
                if (new ActUseUnitAttack(unit, new UnitDuelTarget(otherId)).CanDo(this))
                {
                    acceptableUnits.Add(otherId);
                }
            }

            // but we accept attacking our core too. go figure.
            var acceptableCores = new PlayerPair<bool>(false)
            {
                [0] = new ActUseUnitAttack(unit, new CoreDuelTarget(PlayerIndex.P1)).CanDo(this),
                [1] = new ActUseUnitAttack(unit, new CoreDuelTarget(PlayerIndex.P1)).CanDo(this)
            };
            
            if (acceptableUnits.Count == 0 && !acceptableCores[0] && !acceptableCores[1])
            {
                continue;
            }
            
            unitProps.Add(new DuelUnitProposition
            {
                UnitId = id,
                AllowedUnits = acceptableUnits.ToImmutable(),
                AllowedCores = acceptableCores
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
    
    public required PlayerPair<ImmutableArray<DuelGridVec>> AllowedSlots { get; init; }
    public required PlayerPair<bool> AllowedCores { get; init; }
}

public readonly record struct DuelUnitProposition
{
    public required int UnitId { get; init; }
    
    public required ImmutableArray<int> AllowedUnits { get; init; }
    public required PlayerPair<bool> AllowedCores { get; init; }
}

public enum CardRequirement
{
    SingleChoice,
    None
}