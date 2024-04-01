namespace CardLab.Game.Duels;

public class DuelMutation(Duel duel, DuelState state)
{
    public List<DuelStateDelta> Deltas { get; init; } = [];

    private readonly Dictionary<int, Dictionary<string, object>> _pendingAttrChanges = new();

    // We have to make an exception for attributes because else it's going to be a nightmare
    // Throws when the attribute isn't present.
    // Returns true when the attribute changed.
    public bool SetAttributeBaseValue(IEntity entity, DuelAttributeDefinition def, int value, out int newVal)
    {
        var attribs = entity.Attribs;
        var prev = attribs[def];
        attribs.SetBaseValue(def, value, out newVal);
        if (prev != newVal)
        {
            if (!_pendingAttrChanges.ContainsKey(entity.Id))
            {
                _pendingAttrChanges.Add(entity.Id, new Dictionary<string, object>());
            }

            if (!_pendingAttrChanges[entity.Id].TryAdd(def.Key, newVal))
            {
                _pendingAttrChanges[entity.Id][def.Key] = newVal;
            }

            return true;
        }
        else
        {
            return false;
        }
    }

    // todo: Modifier stuff

    public Result<Unit> Apply(DuelStateDelta delta)
    {
        FlushPendingAttrDeltas();
        
        var res = delta.Apply(duel, state);

        if (res.Succeeded)
        {
            Deltas.Add(delta);
        }

        return res;
    }

    public void FlushPendingAttrDeltas()
    {
        if (_pendingAttrChanges.Count != 0)
        {
            foreach (var (key, value) in _pendingAttrChanges)
            {
                Deltas.Add(new UpdateEntityAttribsDelta
                {
                    EntityId = key,
                    Attribs = value
                });
            }
        }
        _pendingAttrChanges.Clear();
    }

    public DuelFragmentResult ApplyFrag(DuelFragment f)
    {
        return duel.ApplyFrag2(this, f);
    }
}