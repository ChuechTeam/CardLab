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
public sealed class DuelAttributeSet
{
    private Dictionary<DuelAttributeDefinition, AttrEntry> _attributes = new();
    private Dictionary<int, DuelAttributeDefinition> _modIdToAttr = new();
    private int _modIdSeq = 0;
    
    public void Register(DuelAttributeDefinition def)
    {
        if (!_attributes.ContainsKey(def))
        {
            _attributes.Add(def, new(def.DefaultValue, def.DefaultValue, new()));
        }
        else
        {
            // ...do nothing?
        }
    }

    public bool Registered(DuelAttributeDefinition def)
    {
        return _attributes.ContainsKey(def);
    }

    public int this[DuelAttributeDefinition def]
    {
        get => Get(def).actualVal;
        // should only be used for init
        set
        {
            if (!_attributes.ContainsKey(def))
            {
                Register(def);
            }
            SetBaseValue(def, value, out _);
        }
    }

    public (int baseVal, int actualVal) Get(DuelAttributeDefinition def)
    {
        ref AttrEntry at = ref CollectionsMarshal.GetValueRefOrNullRef(_attributes, def);
        if (Unsafe.IsNullRef(ref at))
        {
            throw new InvalidOperationException($"Attribute {def.Key} not registered");
        }

        return (at.Base, at.Actual);
    }
    
    public bool TryGet(DuelAttributeDefinition def, out int baseValue, out int actualValue)
    {
        ref AttrEntry at = ref CollectionsMarshal.GetValueRefOrNullRef(_attributes, def);
        if (Unsafe.IsNullRef(ref at))
        {
            actualValue = 0;
            baseValue = 0;
            return false;
        }
        
        actualValue = at.Actual;
        baseValue = at.Base;
        return true;
    }
    
    public void SetBaseValue(DuelAttributeDefinition def, int value, out int newActual)
    {
        ref var attr = ref CollectionsMarshal.GetValueRefOrNullRef(_attributes, def);
        if (Unsafe.IsNullRef(ref attr))
        {
            throw new InvalidOperationException($"Attribute {def.Key} not registered");
        }

        attr.Base = ClampAttr(def, value);
        UpdateAttributeActual(def, ref attr);
        newActual = attr.Actual;
    }

    // Returns the id of the modifier
    public int RegisterModifier(DuelAttributeDefinition def, int value, DuelAttributeSetModifier.Operation op,
        out int newActual)
    {
        ref var attr = ref CollectionsMarshal.GetValueRefOrNullRef(_attributes, def);
        if (Unsafe.IsNullRef(ref attr))
        {
            throw new InvalidOperationException($"Attribute {def.Key} not registered");
        }

        var id = _modIdSeq++;
        attr.Modifiers.Add(new(id, value, op));
        _modIdToAttr.Add(id, def);
        ApplyModifiers(def, ref attr);
        newActual = attr.Actual;

        return id;
    }

    public bool RemoveModifier(int id, 
        [NotNullWhen(true)] out DuelAttributeDefinition? changedAttr, out int newActual)
    {
        if (_modIdToAttr.TryGetValue(id, out changedAttr))
        {
            ref AttrEntry attr = ref CollectionsMarshal.GetValueRefOrNullRef(_attributes, changedAttr);
            attr.Modifiers.RemoveAll(m => m.InternalId == id);
            UpdateAttributeActual(changedAttr, ref attr);
            newActual = attr.Actual;
            return true;
        }

        newActual = -1;
        return false;
    }

    private void UpdateAttributeActual(DuelAttributeDefinition def, ref AttrEntry attr)
    {
        if (def.SupportsModifiers)
        {
            ApplyModifiers(def, ref attr);
        }
        else
        {
            attr.Actual = attr.Base;
        }
    }

    private void ApplyModifiers(DuelAttributeDefinition def, ref AttrEntry attr)
    {
        var actual = attr.Base;
        foreach (var mod in attr.Modifiers)
        {
            actual = mod.Op switch
            {
                DuelAttributeSetModifier.Operation.Add => actual + mod.Value,
                DuelAttributeSetModifier.Operation.Multiply => actual * mod.Value,
                DuelAttributeSetModifier.Operation.Set => mod.Value,
                _ => throw new ArgumentOutOfRangeException()
            };
        }

        attr.Actual = ClampAttr(def, actual);
    }

    private int ClampAttr(DuelAttributeDefinition def, int value)
    {
        return Math.Max(def.MinValue, Math.Min(def.MaxValue, value));
    }

    public DuelAttributeSet Snapshot()
    {
        var set = new DuelAttributeSet();
        set._attributes = new Dictionary<DuelAttributeDefinition, AttrEntry>(_attributes);
        foreach (var k in set._attributes.Keys)
        {
            ref AttrEntry v = ref CollectionsMarshal.GetValueRefOrNullRef(set._attributes, k);
            v.Modifiers = [..v.Modifiers];
        }
        set._modIdToAttr = new Dictionary<int, DuelAttributeDefinition>(_modIdToAttr);
        return set;
    }

    private record struct AttrEntry(int Base, int Actual, List<DuelAttributeSetModifier> Modifiers);

    public sealed class JsonConv : JsonConverter<DuelAttributeSet>
    {
        public override DuelAttributeSet Read(ref Utf8JsonReader reader, Type typeToConvert,
            JsonSerializerOptions options)
        {
            throw new NotImplementedException();
        }

        public override void Write(Utf8JsonWriter writer, DuelAttributeSet value, JsonSerializerOptions options)
        {
            writer.WriteStartObject();
            foreach (var (key, attrEntry) in value._attributes)
            {
                if (!key.Internal)
                {
                    writer.WriteNumber(key.Key, attrEntry.Actual);
                }
            }

            writer.WriteEndObject();
        }
    }
}

public readonly record struct DuelAttributeSetModifier(int InternalId, int Value, DuelAttributeSetModifier.Operation Op)
{
    public enum Operation
    {
        Add,
        Multiply,
        Set
    }
}

public class DuelAttributes(DuelSettings settings)
{
    public readonly DuelAttributeDefinition CoreHealth
        = new("coreHealth", int.MinValue, settings.MaxCoreHealth, settings.MaxCoreHealth)
        {
            SupportsModifiers = false
        };

    public readonly DuelAttributeDefinition Energy
        = new("energy", 0, 0, settings.MaxEnergy)
        {
            SupportsModifiers = false
        };

    public readonly DuelAttributeDefinition MaxEnergy
        = new("maxEnergy", 0, 0, settings.MaxEnergy);

    public readonly DuelAttributeDefinition Attack
        = new("attack", 0, 0, int.MaxValue);

    public readonly DuelAttributeDefinition Health
        = new("health", 0, 0, int.MaxValue)
        {
            SupportsModifiers = false
        };
    
    public readonly DuelAttributeDefinition MaxHealth
        = new("maxHealth", 0, 0, int.MaxValue);

    public readonly DuelAttributeDefinition Cost
        = new("cost", 0, 0, int.MaxValue);

    /*
     *     public required int InactionTurns { get; set; }
    public required int ActionsLeft { get; set; }
    public required int ActionsPerTurn { get; set; }
     */

    public readonly DuelAttributeDefinition InactionTurns
        = new("inactionTurns", 0, 0, int.MaxValue);

    public readonly DuelAttributeDefinition ActionsLeft
        = new("actionsLeft", 0, 0, int.MaxValue);

    public readonly DuelAttributeDefinition ActionsPerTurn
        = new("actionsPerTurn", 0, 0, int.MaxValue);
}

public record DuelAttributeDefinition(
    string Key,
    int MinValue,
    int DefaultValue,
    int MaxValue)
{
    public bool SupportsModifiers { get; init; } = true;
    public bool Internal { get; init; } = false;

    public virtual bool Equals(DuelAttributeDefinition? other)
    {
        if (ReferenceEquals(null, other)) return false;
        if (ReferenceEquals(this, other)) return true;
        return Key == other.Key;
    }

    public override int GetHashCode()
    {
        return Key.GetHashCode();
    }
}