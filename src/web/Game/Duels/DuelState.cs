using System.Collections.Immutable;
using System.Runtime.CompilerServices;
using System.Text.Json.Serialization;
using CardLab.Game.AssetPacking;

namespace CardLab.Game.Duels;

public sealed record DuelState
{
    public required DuelPlayerState Player1 { get; init; }
    public required DuelPlayerState Player2 { get; init; }

    public int Turn { get; init; } = 1;
    public required PlayerIndex WhoseTurn { get; init; } // 1 or 2

    public ImmutableDictionary<int, DuelUnit> Units { get; init; } = ImmutableDictionary<int, DuelUnit>.Empty;
    
    [JsonIgnore]
    public ImmutableDictionary<int, DuelCard> Cards { get; init; } = ImmutableDictionary<int, DuelCard>.Empty;
    
    // Set by sanitizer, mutable for convenience.
    public ImmutableArray<int> HiddenCards { get; set; } = ImmutableArray<int>.Empty;
    public ImmutableDictionary<int, DuelCard> KnownCards { get; set; } = ImmutableDictionary<int, DuelCard>.Empty;
    
    public DuelPlayerState GetPlayer(PlayerIndex idx) => idx switch
    {
        PlayerIndex.P1 => Player1,
        PlayerIndex.P2 => Player2,
        _ => throw new ArgumentException($"Invalid player (idx={idx}).", nameof(idx))
    };

    public DuelState WithPlayerState(PlayerIndex idx, DuelPlayerState state)
    {
        return this with
        {
            Player1 = idx == PlayerIndex.P1 ? state : Player1,
            Player2 = idx == PlayerIndex.P2 ? state : Player2
        };
    }
}

public sealed record DuelPlayerState
{
    public required int CoreHealth { get; init; }
    public required int Energy { get; init; }
    public required int MaxEnergy { get; init; }

    // Should be cleared for the opposite player.
    public ImmutableArray<DuelCard> Hand { get; init; } = ImmutableArray<DuelCard>.Empty;
    [JsonIgnore] public ImmutableStack<DuelCard> Deck { get; init; } = ImmutableStack<DuelCard>.Empty;
    public ImmutableArray<int> Units { get; init; } = ImmutableArray<int>.Empty;

    public required int CardsInHand { get; init; } // Can be sent to the client at any time
    public required int CardsInDeck { get; init; } // Can be sent to the client at any time
}

public readonly record struct DuelCardStats
{
    public required int Health { get; init; }
    public required int Attack { get; init; }
}

// Represents a card in the hand or in a deck.
[JsonPolymorphic(TypeDiscriminatorPropertyName = "type")]
[JsonDerivedType(typeof(UnitDuelCard), typeDiscriminator: "unit")]
public abstract record DuelCard
{
    public required int Id { get; init; }
    
    public required int Cost { get; init; }
    
    [JsonIgnore] public PlayerPair<bool> Revealed { get; init; }

    public DuelCardLocation Location { get; init; } = DuelCardLocation.Temp;
    
    // todo: modifier for all cards (cost only so)

    public required QualCardRef BaseDefRef { get; init; }
}

public enum DuelCardLocation
{
    Deck,
    Hand,
    DiscardPile,
    Temp
}

public sealed record UnitDuelCard : DuelCard
{
    // Ignore this for now, as it's tricky to send to the client without sending a ton of data...
    // Plus that's not very critical, we don't yet have user-friendly strings for them. 
    [JsonIgnore]
    public ImmutableArray<(int id, UnitDuelCardModifier mod)> AppliedModifiers { get; init; }
        = ImmutableArray<(int id, UnitDuelCardModifier mod)>.Empty;

    public required DuelCardStats Stats { get; init; }
    public required ImmutableArray<CardTrait> Traits { get; init; }

    // That's a cool idea we'll implement later.
    // Server only.
    // [JsonIgnore]
    // public CardScript? ModifiedScript { get; init; } = null;
    // public string? ModifiedDescription { get; init; } = null;
}

public abstract class UnitDuelCardModifier
{
    public virtual DuelCardStats ModifyStats(DuelCardStats stats) => stats;
    public virtual ImmutableArray<CardTrait> ModifyTraits(ImmutableArray<CardTrait> traits) => traits;
}

public sealed record DuelUnit
{
    public required int Id { get; init; }

    public required QualCardRef OriginRef { get; init; }
    
    public required DuelCardStats OriginStats { get; init; }
    public required ImmutableArray<CardTrait> OriginTraits { get; init; }

    [JsonIgnore]
    public ImmutableArray<(int id, DuelUnitModifier mod)> AppliedModifiers { get; init; }
        = ImmutableArray<(int id, DuelUnitModifier mod)>.Empty;

    public required DuelUnitAttribs Attribs { get; init; }
}

public record struct DuelUnitAttribs
{
    public required int Attack { get; set; }
    public required int CurHealth { get; set; }
    public required int MaxHealth { get; set; }

    public required int InactionTurns { get; set; }
    public required int ActionsLeft { get; set; }
    public required int ActionsPerTurn { get; set; }

    public required ImmutableArray<CardTrait> Traits { get; set; }
}

public abstract class DuelUnitModifier
{
    public virtual void ModifyAttribs(ref DuelUnitAttribs attrs) {}
}