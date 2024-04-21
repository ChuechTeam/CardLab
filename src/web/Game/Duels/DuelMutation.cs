using CardLab.Game.Duels.Scripting;

namespace CardLab.Game.Duels;

public class DuelMutation(Duel duel, DuelState state, DuelAction root)
{
    public const ushort MaxFragments = 2000;
    
    public List<DuelStateDelta> Deltas { get; } = [];
    public DuelAction Root { get; } = root;

    private readonly Dictionary<int, Dictionary<string, int>> _pendingAttrChanges = new();
    public int? PendingTurnTimer { get; set; } = null;
    public bool PendingTurnTimerStop { get; set; } = false;

    public UserScriptingMutState UserScriptingState = new(); 

    private ushort _nextFragId = 0;

    public void RegisterAttrUpdate(IEntity entity, DuelAttributeId id)
    {
        var attribs = entity.Attribs;

        if (!_pendingAttrChanges.TryGetValue(entity.Id, out var entityAttrChanges))
        {
            entityAttrChanges = new Dictionary<string, int>();
            _pendingAttrChanges.Add(entity.Id, entityAttrChanges);
        }

        var val = attribs[id];
        var (_, name, internalAttr) = attribs.Meta.Get(id);
        if (!internalAttr && !entityAttrChanges.TryAdd(name, val))
        {
            entityAttrChanges[name] = val;
        }
    }

    public void StartTurnTimer(int secs)
    {
        if (PendingTurnTimerStop)
        {
            PendingTurnTimerStop = false;
        }
        
        // we need to set the timer as late as possible to get accurate time.
        PendingTurnTimer = secs;
    }

    public void StopTurnTimer()
    {
        if (PendingTurnTimer != null)
        {
            PendingTurnTimer = null;
        }

        PendingTurnTimerStop = true;
    }

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

    public bool TryGiveFragId(out ushort id)
    {
        id = _nextFragId;
        
        if (_nextFragId < MaxFragments)
        {
            _nextFragId++;
            return true;
        }
        else
        {
            return false;
        }
    }

    public bool Run()
    {
        UserScriptingState.TotalTriggers = 0;
        
        var res = ApplyFrag(Root);
        FlushPendingAttrDeltas();
        
        // If the initial verification failed, then nothing happened.
        // If the second verification failed, we should have some deltas indicating
        // that some state has changed, or that the fragment was applied.
        var stuffHappened = res != DuelFragmentResult.VerifyFailed || Deltas.Count != 0;
        if (stuffHappened)
        {
            foreach (var script in duel.State.ActiveScripts)
            {
                script.PostMutationEnd(this);
            }
        }
        
        // Clear all eliminated units.
        foreach (var unitId in duel.State.EliminatedUnits)
        {
            duel.State.Units.Remove(unitId);
        }
        duel.State.EliminatedUnits.Clear();
        
        return stuffHappened;
    }

    public DuelFragmentResult ApplyFrag(DuelFragment f)
    {
        return duel.ApplyFrag(this, f);
    }
}