using System.Collections;
using System.Collections.Immutable;
using System.Runtime.CompilerServices;
using System.Text.Json.Serialization;
using CardLab.Game.AssetPacking;
using CardLab.Game.Duels.Scripting;

namespace CardLab.Game.Duels;

// todo one day: actually split up the state sent to the client and the state used by the server

public sealed record DuelState
{
    public DuelStatus Status { get; set; } = DuelStatus.AwaitingConnection;

    public PlayerIndex? Winner { get; set; } = null;

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
    [JsonIgnore] public IEnumerable<DuelUnit> AliveUnits => Units.Values.Where(x => !x.Eliminated);

    [JsonIgnore] public Dictionary<int, DuelCard> Cards { get; init; } = new();

    // Right now we don't expose this to the client as it'd take too much time.
    [JsonIgnore] public Dictionary<int, DuelModifier> Modifiers { get; } = new();

    // Set by sanitizer, mutable for convenience.
    // also this is DISGUSTING because we have to ""clone"" the state which isn't a real deep clone...
    public ImmutableArray<int> HiddenCards { get; set; } = ImmutableArray<int>.Empty;
    public ImmutableDictionary<int, DuelCard> KnownCards { get; set; } = ImmutableDictionary<int, DuelCard>.Empty;

    [JsonIgnore] public DuelListenerSet Listeners { get; } = new();
    [JsonIgnore] public List<DuelScript> ActiveScripts { get; } = new();

    // Used to remove eliminated units at the end of an iteration.
    [JsonIgnore] public List<int> EliminatedUnits { get; } = new();

    public DuelPlayerState GetPlayer(PlayerIndex idx) => Players[(int)idx];

    public DuelCard? FindCard(int id)
    {
        return Cards.GetValueOrDefault(id);
    }

    public DuelUnit? FindUnit(int id, bool allowEliminated = false)
    {
        if (allowEliminated)
        {
            return Units.GetValueOrDefault(id);
        }
        else if (Units.TryGetValue(id, out var u) && !u.Eliminated)
        {
            return u;
        }
        else
        {
            return null;
        }
    }

    public IEntity? FindEntity(int id, bool allowEliminated=false)
    {
        if (DuelIdentifiers.TryExtractType(id, out var type))
        {
            return type switch
            {
                DuelEntityType.Card => FindCard(id),
                DuelEntityType.Unit => FindUnit(id, allowEliminated),
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

    public DuelAttributeSetV2 Attribs { get; }
    public List<int> Modifiers { get; }
}

public interface IScriptable
{
    public DuelScript? Script { get; }
}

public enum DuelEntityType : byte
{
    Player = 0,
    Card = 1,
    Unit = 2,
    Modifier = 3, // todo! (once modifiers will be shown to client)
}

public sealed record DuelPlayerState : IEntity
{
    public PlayerIndex Index => (PlayerIndex)(Id >> 4);
    public required int Id { get; init; }

    [JsonIgnore] public bool Eliminated => false;

    public required DuelAttributeSetV2 Attribs { get; init; }
    [JsonIgnore] public List<int> Modifiers { get; } = new();

    public List<int> Hand { get; init; } = new();
    public List<int> Deck { get; init; } = new();

    // The unit grid.
    // The size of the array is Width*Height, row-major.
    // null = empty
    public required int?[] Units { get; init; }

    // todo: not have horrid performance (por favor)
    [JsonIgnore] public IEnumerable<int> ExistingUnits => Units.Where(x => x != null).Select(x => x!.Value);
}

// Represents a card in the hand or in a deck.
public record DuelCard : IEntity, IScriptable
{
    public required int Id { get; init; }

    public CardType Type { get; init; }
    public CardRequirement Requirement { get; init; }

    // Requires cost.
    public required DuelAttributeSetV2 Attribs { get; set; }

    [JsonIgnore] public string? NormalizedArchetype { get; set; }

    [JsonIgnore] public bool Eliminated => false;

    // public field looks like a crime here but i'm becoming crazy anyway i have other issues
    [JsonIgnore] public PlayerPair<bool> Revealed;

    [JsonIgnore] public List<int> Modifiers { get; } = new();

    [JsonIgnore] public DuelScript? Script { get; set; } = null;

    public DuelCardLocation Location { get; set; } = DuelCardLocation.Temp;

    // todo: modifier for all cards (cost only so)

    public required QualCardRef BaseDefRef { get; init; }

    public DuelCard TakeSnapshot()
    {
        return new DuelCard(this)
        {
            Attribs = Attribs.Snapshot()
        };
    }

    public PlayerIndex? GetOwner()
    {
        switch (Location)
        {
            case DuelCardLocation.HandP1:
            case DuelCardLocation.DeckP1:
                return PlayerIndex.P1;
            case DuelCardLocation.HandP2:
            case DuelCardLocation.DeckP2:
                return PlayerIndex.P2;
            default:
                return null;
        }
    }
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

public sealed record DuelUnit : IEntity, IScriptable
{
    public required int Id { get; init; }

    public required QualCardRef OriginRef { get; init; }

    public required DuelAttributeSetV2 OriginStats { get; init; }

    public required DuelAttributeSetV2 Attribs { get; set; }
    [JsonIgnore] public List<int> Modifiers { get; } = new();

    public required DuelArenaPosition Position { get; set; }

    public required PlayerIndex Owner { get; set; }

    [JsonIgnore] public string? NormalizedArchetype { get; set; } = null;

    // Internal variables. Can be set outside of deltas.

    [JsonIgnore] public int? LastDamageSourceId { get; set; } = null;
    [JsonIgnore] public bool Eliminated { get; set; } = false;
    [JsonIgnore] public bool DeathPending { get; set; } = false;

    [JsonIgnore] public DuelScript? Script { get; set; } = null;

    public DuelUnit Snapshot()
    {
        return new DuelUnit(this)
        {
            Attribs = Attribs.Snapshot()
        };
    }
}

public record struct DuelModifier
{
    public int Id { get; set; }
    public int? SourceId { get; set; }
    public QualCardRef? SourceCard { get; set; }
    public required int TargetId { get; init; }
    public required DuelAttributeId Attribute { get; init; }
    public required DuelModifierOperation Op { get; init; }
    public required int Value { get; init; }

    public required int TurnsRemaining { get; set; } // -1 = permanent
}

public enum DuelModifierOperation : byte
{
    Add,
    Multiply,
    Set
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

    public static DuelGridVec FromIndex(Duel duel, int idx)
    {
        return new DuelGridVec(idx % duel.Settings.UnitsX, idx / duel.Settings.UnitsX);
    }

    public bool Valid(Duel duel)
    {
        return X >= 0 && Y >= 0 && X < duel.Settings.UnitsX && Y < duel.Settings.UnitsY;
    }
}

public record struct DuelArenaPosition(PlayerIndex Player, DuelGridVec Vec);