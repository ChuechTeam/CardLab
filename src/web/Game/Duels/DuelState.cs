using System.Collections;
using System.Collections.Immutable;
using System.Runtime.CompilerServices;
using System.Text.Json.Serialization;
using CardLab.Game.AssetPacking;

namespace CardLab.Game.Duels;

// todo one day: actually split up the state sent to the client and the state used by the server

public sealed record DuelState
{
    public DuelStatus Status { get; set; } = DuelStatus.AwaitingConnection;
    
    // fun little hack to have C-like inline arrays
    private readonly PlayerArray _players;
    [JsonIgnore] public PlayerArray Players => _players;
    
    public required DuelPlayerState Player1
    {
        get => Players[0];
        init => _players[0] = value;
    }

    public required DuelPlayerState Player2
    {
        get => Players[1];
        init => _players[1] = value;
    }
    
    public int Turn { get; set; } = 1;
    public required PlayerIndex WhoseTurn { get; set; }

    public Dictionary<int, DuelUnit> Units { get; init; } = new();

    [JsonIgnore] public Dictionary<int, DuelCard> Cards { get; init; } = new();

    // Set by sanitizer, mutable for convenience.
    // also this is DISGUSTING because we have to ""clone"" the state which isn't a real deep clone...
    public ImmutableArray<int> HiddenCards { get; set; } = ImmutableArray<int>.Empty;
    public ImmutableDictionary<int, DuelCard> KnownCards { get; set; } = ImmutableDictionary<int, DuelCard>.Empty;

    public DuelPlayerState GetPlayer(PlayerIndex idx) => Players[(int)idx];

    public DuelCard? FindCard(int id)
    {
        return Cards.GetValueOrDefault(id);
    }

    public DuelUnit? FindUnit(int id)
    {
        return Units.GetValueOrDefault(id);
    }

    public IEntity? FindEntity(int id)
    {
        if (DuelIdentifiers.TryExtractType(id, out var type))
        {
            return type switch
            {
                DuelEntityType.Card => FindCard(id),
                DuelEntityType.Unit => FindUnit(id),
                DuelEntityType.Player => id switch
                {
                    DuelIdentifiers.Player1 => Player1,
                    DuelIdentifiers.Player2 => Player2,
                    _ => null
                },
                _ => null // invalid type
            };
        }
        else
        {
            return null;
        }
    }

    [InlineArray(2)]
    public struct PlayerArray
    {
        private DuelPlayerState _obj;
    }
}

public interface IEntity
{
    public int Id { get; }
    // True when it doesn't appear in any list.
    public bool Eliminated { get; }
    
    public DuelAttributeSet Attribs { get; }
}

public enum DuelEntityType : byte
{
    Player = 0,
    Card = 1,
    Unit = 2,
    Modifier = 3, // todo!
}

public sealed record DuelPlayerState : IEntity
{
    public PlayerIndex Index => (PlayerIndex) (Id >> 4);
    public required int Id { get; init; }

    [JsonIgnore] public bool Eliminated => false;

    public required DuelAttributeSet Attribs { get; init; }
    
    public List<int> Hand { get; init; } = new();
    public List<int> Deck { get; init; } = new();

    // The unit grid.
    // The size of the array is Width*Height, row-major.
    // null = empty
    public required int?[] Units { get; init; }

    // todo: not have horrid performance (por favor)
    [JsonIgnore] public IEnumerable<int> ExistingUnits => Units.Select(x => x ?? -1).Where(x => x != -1);
}

// Represents a card in the hand or in a deck.
[JsonPolymorphic(TypeDiscriminatorPropertyName = "type")]
[JsonDerivedType(typeof(UnitDuelCard), typeDiscriminator: "unit")]
public abstract record DuelCard : IEntity
{
    public required int Id { get; init; }

    // Requires cost.
    public required DuelAttributeSet Attribs { get; set; }
    
    [JsonIgnore] public bool Eliminated => false;

    // public field looks like a crime here but i'm becoming crazy anyway i have other issues
    [JsonIgnore] public PlayerPair<bool> Revealed;

    public DuelCardLocation Location { get; set; } = DuelCardLocation.Temp;

    // todo: modifier for all cards (cost only so)

    public required QualCardRef BaseDefRef { get; init; }

    public abstract DuelCard TakeSnapshot();
}

public enum DuelCardLocation
{
    DeckP1,
    DeckP2,
    HandP1,
    HandP2,
    Discarded,
    Temp
}

public sealed record UnitDuelCard : DuelCard
{
    public required List<CardTrait> Traits { get; set; }

    // That's a cool idea we'll implement later.
    // Server only.
    // [JsonIgnore]
    // public CardScript? ModifiedScript { get; init; } = null;
    // public string? ModifiedDescription { get; init; } = null;

    public override UnitDuelCard TakeSnapshot()
    {
        return this with
        {
            Traits = Traits.ToList()
        };
    }
}

public sealed record DuelUnit : IEntity
{
    public required int Id { get; init; }

    public required QualCardRef OriginRef { get; init; }

    public required DuelAttributeSet OriginStats { get; init; }
    public required ImmutableArray<CardTrait> OriginTraits { get; init; }
    
    public required DuelAttributeSet Attribs { get; set; }

    public required DuelArenaPosition Position { get; set; }
    
    public required PlayerIndex Owner { get; set; }
    
    // Internal variables. Can be set outside of deltas.
    
    [JsonIgnore] public int? LastDamageSourceId { get; set; } = null;
    [JsonIgnore] public bool Eliminated { get; set; } = false;
    [JsonIgnore] public bool DeathPending { get; set; } = false;

    public DuelUnit Snapshot()
    {
        return new DuelUnit(this)
        {
            Attribs = Attribs.Snapshot()
        };
    }
}

// Y+
// |
// |
// |
// 0------ X+
public record struct DuelGridVec(int X, int Y)
{
    public static DuelGridVec operator +(DuelGridVec a, DuelGridVec b)
    {
        return new DuelGridVec(a.X + b.X, a.Y + b.Y);
    }

    public static DuelGridVec operator -(DuelGridVec a, DuelGridVec b)
    {
        return new DuelGridVec(a.X - b.X, a.Y - b.Y);
    }

    public static DuelGridVec operator *(DuelGridVec a, int b)
    {
        return new DuelGridVec(a.X * b, a.Y * b);
    }

    public int ToIndex(Duel duel)
    {
        return X + duel.Settings.UnitsX * Y;
    }

    public bool Valid(Duel duel)
    {
        return X >= 0 && Y >= 0 && X < duel.Settings.UnitsX && Y < duel.Settings.UnitsY;
    }
}

public record struct DuelArenaPosition(PlayerIndex Player, DuelGridVec Vec);