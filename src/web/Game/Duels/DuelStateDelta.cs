using System.Collections.Immutable;
using System.Reflection.Metadata.Ecma335;
using System.Text.Json.Serialization;
using CardLab.Game.AssetPacking;

namespace CardLab.Game.Duels;

// All the deltas are here!

// Deltas are the *ONLY* way to modify the state of a duel after its creation.
// The game client can receive deltas and apply them to their local state, at
// the pace they want, in order to play relevant animations for each step of a
// mutation.

// Deltas are designed to be one-to-one with in-game animations, but there might
// be some exceptions (too complex stuff for instance).

[JsonPolymorphic(TypeDiscriminatorPropertyName = "type")]
[JsonDerivedType(typeof(DrawDeckCardsDelta), "drawDeckCards")]
[JsonDerivedType(typeof(SwitchTurnDelta), "switchTurn")]
[JsonDerivedType(typeof(RemoveCardsDelta), "removeCards")]
[JsonDerivedType(typeof(PlaceUnitDelta), "placeUnit")]
[JsonDerivedType(typeof(RemoveUnitDelta), "removeUnit")]
[JsonDerivedType(typeof(UpdateBoardAttribsDelta), "updateBoardAttribs")]
[JsonDerivedType(typeof(UpdateEnergyDelta), "updateEnergy")]
[JsonDerivedType(typeof(UnitAttackScopeDelta), "unitAttackScope")]
[JsonDerivedType(typeof(UnitTriggerScopeDelta), "unitTriggerScope")]
public abstract record DuelStateDelta
{
    public abstract Result<DuelState> Apply(DuelState state);
}

// Must be sanitized!
// The delta used when drawing cards from the top of the deck.
// Removes N top cards from the deck, and add those top cards.
// Simultaneous draws are supported with this technique.
public sealed record DrawDeckCardsDelta : DuelStateDelta
{
    public PlayerPair<int> Num { get; init; }

    // For the client only!
    // Set in Apply, i'm not sure if this mutability is a good idea but honestly i'm out of ideas anyway...
    // Sanitize: empty array if opposite player
    private PlayerPair<ImmutableArray<DuelCard>> _cards;

    public PlayerPair<ImmutableArray<DuelCard>> Cards
    {
        get => _cards;
        set => _cards = value;
    }

    public override Result<DuelState> Apply(DuelState state)
    {
        static DuelPlayerState ApplyPlayer(DuelPlayerState player, int num, out ImmutableArray<DuelCard> outCards)
        {
            var cardsBuilder = ImmutableArray.CreateBuilder<DuelCard>();
            var newDeck = player.Deck;
            for (int i = 0; i < num; i++)
            {
                cardsBuilder.Add(newDeck.Peek());
                newDeck = newDeck.Pop();
            }

            var cards = cardsBuilder.ToImmutable();
            var newHand = player.Hand.AddRange(cards);
            outCards = cards;

            return player with
            {
                Hand = newHand,
                CardsInHand = newHand.Length,
                Deck = newDeck,
                CardsInDeck = newDeck.Count() // todo perf!
            };
        }

        if (!EnoughCards(state))
        {
            return Result.Fail<DuelState>("Not enough cards for drawing from a deck.");
        }

        return state with
        {
            Player1 = ApplyPlayer(state.Player1, Num.P1, out _cards.P1),
            Player2 = ApplyPlayer(state.Player2, Num.P2, out _cards.P2)
        };
    }

    private bool EnoughCards(DuelState state)
    {
        // todo: perf!!
        return state.Player1.Deck.Count() >= Num.P1 && state.Player2.Deck.Count() >= Num.P2;
    }
}

public sealed record SwitchTurnDelta : DuelStateDelta
{
    public required int NewTurn { get; init; }
    public required PlayerIndex WhoPlays { get; init; }
    public required int NewEnergy { get; init; }

    public override Result<DuelState> Apply(DuelState state)
    {
        DuelPlayerState ApplyPlayer(DuelPlayerState player)
        {
            return player with
            {
                Energy = NewEnergy,
                MaxEnergy = NewEnergy
            };
        }

        return state with
        {
            Turn = NewTurn,
            WhoseTurn = WhoPlays,
            Player1 = WhoPlays == PlayerIndex.P1 ? ApplyPlayer(state.Player1) : state.Player1,
            Player2 = WhoPlays == PlayerIndex.P2 ? ApplyPlayer(state.Player2) : state.Player2
        };
    }
}

public sealed record RemoveCardsDelta : DuelStateDelta
{
    public required PlayerIndex Player { get; init; }

    public required ImmutableArray<int> CardIds { get; init; }

    public required RemReason Reason { get; init; } // (Only for cosmetic purposes)

    public enum RemReason
    {
        Played,
        Discarded
    }

    public override Result<DuelState> Apply(DuelState state)
    {
        var playerSt = state.GetPlayer(Player);
        var newHand = playerSt.Hand.RemoveAll(c => CardIds.Contains(c.Id));

        var newPlayerSt = playerSt with
        {
            Hand = newHand,
            CardsInHand = newHand.Length
        };
        return state.WithPlayerState(Player, newPlayerSt);
    }
}

public sealed record PlaceUnitDelta : DuelStateDelta
{
    public required PlayerIndex Player { get; init; }
    public required DuelUnit Unit { get; init; }
    public required int Position { get; init; }

    public override Result<DuelState> Apply(DuelState state)
    {
        var newGlobalUnits = state.Units.Add(Unit.Id, Unit);

        var playerSt = state.GetPlayer(Player);
        var newUnits = playerSt.Units.Insert(Position, Unit.Id);
        var newPlayerSt = playerSt with
        {
            Units = newUnits
        };
        return state.WithPlayerState(Player, newPlayerSt) with
        {
            Units = newGlobalUnits
        };
    }
}

public sealed record RemoveUnitDelta : DuelStateDelta
{   
    public required ImmutableArray<int> RemovedIds { get; init; }
    public RemReason Reason { get; init; } // Cosmetic

    public enum RemReason
    {
        Death
    }

    public override Result<DuelState> Apply(DuelState state)
    {
        var newUnits = state.Units.RemoveRange(RemovedIds);
        var newP1State = state.Player1 with
        {
            Units = state.Player1.Units.RemoveAll(x => RemovedIds.Contains(x))
        };
        var newP2State = state.Player2 with
        {
            Units = state.Player2.Units.RemoveAll(x => RemovedIds.Contains(x))
        };

        return state with
        {
            Units = newUnits,
            Player1 = newP1State,
            Player2 = newP2State
        };
    }
}

public sealed record UpdateBoardAttribsDelta : DuelStateDelta
{
    public ImmutableArray<AttribChange> Attribs { get; init; } = ImmutableArray<AttribChange>.Empty;
    
    // null = no change
    public PlayerPair<int?> CoreHealths { get; init; } = new(null);
    
    public readonly record struct AttribChange(int UnitId, DuelUnitAttribs NewAttribs);
    
    public override Result<DuelState> Apply(DuelState state)
    {
        var newUnits = state.Units;
        foreach (var attrib in Attribs)
        {
            var unit = newUnits[attrib.UnitId];
            newUnits = newUnits.SetItem(attrib.UnitId, unit with
            {
                Attribs = attrib.NewAttribs
            });
        }

        static DuelPlayerState UpdatePlayer(DuelPlayerState st, int? coreHp)
        {
            if (coreHp is { } hp)
            {
                return st with { CoreHealth = hp };
            }
            else
            {
                return st;
            }
        }

        return state with
        {
            Units = newUnits,
            Player1 = UpdatePlayer(state.Player1, CoreHealths.P1),
            Player2 = UpdatePlayer(state.Player2, CoreHealths.P2)
        };
    }
}

public sealed record UpdateEnergyDelta : DuelStateDelta
{
    public required PlayerIndex Player { get; init; }
    public required int NewEnergy { get; init; }
    public required int NewMaxEnergy { get; init; }

    public override Result<DuelState> Apply(DuelState state)
    {
        var player = state.GetPlayer(Player);
        var newPlayer = player with
        {
            Energy = NewEnergy,
            MaxEnergy = NewMaxEnergy
        };
        return state.WithPlayerState(Player, newPlayer);
    }
}


public sealed record CreateCardsDelta : DuelStateDelta
{
    public required ImmutableArray<DuelCard> Cards { get; init; }
    
    public override Result<DuelState> Apply(DuelState state)
    {
        var newCards = state.Cards.AddRange(Cards.Select(c => new KeyValuePair<int, DuelCard>(c.Id, c)));
        return state with
        {
            Cards = newCards
        };
    }
}

public sealed record UpdateCardsRevealStateDelta : DuelStateDelta
{
    [JsonIgnore] public ImmutableArray<(DuelCard card, PlayerPair<bool> newReveal)> Changes { get; init; }
    
    // Set by sanitizer
    public ImmutableArray<int> HiddenCards { get; set; } = ImmutableArray<int>.Empty;
    public ImmutableArray<DuelCard> RevealedCards { get; set; } = ImmutableArray<DuelCard>.Empty;
    public override Result<DuelState> Apply(DuelState state)
    {
        var newCards = state.Cards;
        foreach (var (card, newReveal) in Changes)
        {
            newCards = newCards.SetItem(card.Id, card with
            {
                Revealed = newReveal
            });
        }

        return state with
        {
            Cards = newCards
        };
    }
}

public sealed record MoveCardsToDeckDelta : DuelStateDelta
{
    
}

// Scopes: used to know who did what

public abstract record ScopeDelta : DuelStateDelta
{
    public enum ScopeState
    {
        Start,
        End
    }
    
    public ScopeState State { get; init; }

    public string? Tag { get; init; } = null;
    
    public override Result<DuelState> Apply(DuelState state) => state;
}

public sealed record UnitAttackScopeDelta(int UnitId) : ScopeDelta;
public sealed record UnitTriggerScopeDelta(int UnitId) : ScopeDelta;

public sealed record CardScopeDelta(DuelCard Card) : ScopeDelta;