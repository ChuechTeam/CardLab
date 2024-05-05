using System.Diagnostics.CodeAnalysis;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace CardLab.Game.Duels;

// Basically a glorified dictionary of integer values
// For now, it doesn't support attributes altering other attributes (e.g. maxHealth)
// We could also later update this to add support for other types of attributes (e.g. position)
[JsonConverter(typeof(JsonConv))]
public sealed class DuelAttributeSetV2(DuelAttributesMeta meta)
{
    private Dictionary<DuelAttributeId, (int baseVal, int actualVal)> _attributes = new();
    public Dictionary<DuelAttributeId, (int baseVal, int actualVal)> PrevVals { get; } = new();
    public DuelAttributesMeta Meta { get; } = meta;

    public int this[DuelAttributeId id]
    {
        get => _attributes.GetValueOrDefault(id).actualVal;
        // should only be used for init or base-only attrs
        set => Set(id, value);
    }

    public bool Registered(DuelAttributeId id)
    {
        return _attributes.ContainsKey(id);
    }

    // Returns (0, 0) if not present
    public (int baseVal, int actualVal) Get(DuelAttributeId id)
    {
        return _attributes.GetValueOrDefault(id);
    }
    
    public int GetBase(DuelAttributeId id)
    {
        return _attributes.GetValueOrDefault(id).baseVal;
    }
    
    public int GetActual(DuelAttributeId id)
    {
        return _attributes.GetValueOrDefault(id).actualVal;
    }

    public void Set(DuelAttributeId id, int bothVal)
    {
        Set(id, (bothVal, bothVal));
    }

    public void Set(DuelAttributeId id, (int baseVal, int actualVal) value)
    {
        _ = PrevVals.TryAdd(id, Get(id));
        _attributes[id] = value;
    }

    public void ClearPrevVals()
    {
        PrevVals.Clear();
    }

    public DuelAttributeSetV2 Snapshot()
    {
        var set = new DuelAttributeSetV2(this.Meta);
        set._attributes = new(this._attributes);
        return set;
    }

    public sealed class JsonConv : JsonConverter<DuelAttributeSetV2>
    {
        public override DuelAttributeSetV2 Read(ref Utf8JsonReader reader, Type typeToConvert,
            JsonSerializerOptions options)
        {
            throw new NotImplementedException();
        }

        public override void Write(Utf8JsonWriter writer, DuelAttributeSetV2 value, JsonSerializerOptions options)
        {
            writer.WriteStartObject();
            foreach (var (key, val) in value._attributes)
            {
                var meta = value.Meta.Get(key);
                if (!meta.Internal)
                {
                    writer.WriteNumber(meta.Key, val.actualVal);
                }
            }

            writer.WriteEndObject();
        }
    }
}

public readonly record struct DuelAttributeId(ushort Value)
{
    // meh... but it's required for switch statements
    public static implicit operator DuelAttributeId(ushort value) => new(value);
    public static implicit operator ushort(DuelAttributeId id) => id.Value;
}

public class DuelAttributesMeta
{
    private readonly Dictionary<DuelAttributeId, DuelAttrMeta> _attributes = new();

    public DuelAttributesMeta(DuelAttrMeta[]? attributes)
    {
        if (attributes == null) return;

        foreach (var meta in attributes)
        {
            _attributes[meta.Id] = meta;
        }
    }

    public static readonly DuelAttributesMeta Base = new([
        new DuelAttrMeta(DuelBaseAttrs.CoreHealth, "coreHealth"),
        new DuelAttrMeta(DuelBaseAttrs.Energy, "energy"),
        new DuelAttrMeta(DuelBaseAttrs.MaxEnergy, "maxEnergy"),
        new DuelAttrMeta(DuelBaseAttrs.Attack, "attack"),
        new DuelAttrMeta(DuelBaseAttrs.Health, "health"),
        new DuelAttrMeta(DuelBaseAttrs.MaxHealth, "maxHealth"),
        new DuelAttrMeta(DuelBaseAttrs.Cost, "cost"),
        new DuelAttrMeta(DuelBaseAttrs.InactionTurns, "inactionTurns"),
        new DuelAttrMeta(DuelBaseAttrs.ActionsLeft, "actionsLeft"),
        new DuelAttrMeta(DuelBaseAttrs.ActionsPerTurn, "actionsPerTurn"),
        new DuelAttrMeta(DuelBaseAttrs.CardsPlayedThisTurn, "cardsPlayedThisTurn", true)
    ]);

    public void Register(DuelAttrMeta meta)
    {
        if (!_attributes.TryAdd(meta.Id, meta))
        {
            throw new InvalidOperationException("Attribute already registered");
        }
    }

    public DuelAttrMeta Get(DuelAttributeId id)
    {
        return _attributes[id];
    }
}

public readonly record struct DuelAttrMeta(DuelAttributeId Id, string Key, bool Internal=false);

public static class DuelBaseAttrs
{
    public const ushort CoreHealth = 0;
    public const ushort Energy = 1;
    public const ushort MaxEnergy = 2;
    public const ushort Attack = 3;
    public const ushort Health = 4;
    public const ushort MaxHealth = 5;
    public const ushort Cost = 6;
    public const ushort InactionTurns = 7;
    public const ushort ActionsLeft = 8;
    public const ushort ActionsPerTurn = 9;
    public const ushort CardsPlayedThisTurn = 10;

    public static int GetCoreHealth(this DuelAttributeSetV2 attribs)
    {
        return attribs[CoreHealth];
    }

    public static int GetEnergy(this DuelAttributeSetV2 attribs)
    {
        return attribs[Energy];
    }

    public static int GetMaxEnergy(this DuelAttributeSetV2 attribs)
    {
        return attribs[MaxEnergy];
    }

    public static int GetAttack(this DuelAttributeSetV2 attribs)
    {
        return attribs[Attack];
    }

    public static int GetHealth(this DuelAttributeSetV2 attribs)
    {
        return attribs[Health];
    }

    public static int GetMaxHealth(this DuelAttributeSetV2 attribs)
    {
        return attribs[MaxHealth];
    }

    public static int GetCost(this DuelAttributeSetV2 attribs)
    {
        return attribs[Cost];
    }

    public static int GetInactionTurns(this DuelAttributeSetV2 attribs)
    {
        return attribs[InactionTurns];
    }

    public static int GetActionsLeft(this DuelAttributeSetV2 attribs)
    {
        return attribs[ActionsLeft];
    }

    public static int GetActionsPerTurn(this DuelAttributeSetV2 attribs)
    {
        return attribs[ActionsPerTurn];
    }
    
    public static int GetCardsPlayedThisTurn(this DuelAttributeSetV2 attribs)
    {
        return attribs[CardsPlayedThisTurn];
    }
}