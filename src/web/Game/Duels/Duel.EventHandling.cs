using System.Runtime.CompilerServices;

namespace CardLab.Game.Duels;

// Event handling: where we handle stuff named events (surprising!).
// Pre-fragment handlers run fragments directly, during the preparation phase.
// During & post-fragment handlers only add fragments to the queue.

public sealed partial class Duel
{
    // returns true if stuff happened
    private bool HandlePreFragment(DuelFragment fragment)
    {
        return false; // ...todo
    }

    private void HandlePostFragment(DuelFragment fragment, DuelFragmentResult result)
    {
        foreach (var listener in State.Listeners.GetFragmentListeners(fragment.GetType()))
        {
            listener(fragment, result);
        }
    }
    
    private void HandlePostAttributeBaseChange(DuelFragment frag, IEntity entity, DuelAttributeId attribute,
        int prevValue, int newValue)
    {
        // ... Other triggers
    }

    private void HandlePostAttributeChange(DuelFragment frag, IEntity entity, DuelAttributeId attribute,
        int prevValue, int newValue)
    {
        // Core listeners
        if (attribute == DuelBaseAttrs.Health)
        {
            CheckUnitDeath(frag, entity);
        }

        if (attribute == DuelBaseAttrs.CoreHealth)
        {
            CheckGameWin(frag);
        }

        if (entity is IScriptable scriptable)
        {
            scriptable.Script?.PostAttributeChange(frag, attribute, prevValue, newValue);
        }

        // Extension listeners
        foreach (var listener in frag.State.Listeners.GetAttributeListeners(attribute))
        {
            listener(frag, entity, attribute, prevValue, newValue);
        }
    }
}

public class DuelListenerSet
{
    private readonly Dictionary<Type, List<DuelFragmentListener>> _fragmentListeners = new();
    private readonly Dictionary<DuelAttributeId, List<DuelAttributeListener>> _attributeListeners = new();
    
    private DuelFragmentListenerHandle RegisterFragmentListenerPriv<T>(DuelFragmentListener listener)
        where T : DuelFragment
    {
        var type = typeof(T);
        if (!_fragmentListeners.TryGetValue(type, out List<DuelFragmentListener>? value))
        {
            value = new();
            _fragmentListeners.Add(type, value);
        }

        value.Add(listener);
        return new DuelFragmentListenerHandle(type, listener);
    }
    
    public DuelFragmentListenerHandle RegisterFragmentListener<T>(Action<T, DuelFragmentResult> listener)
        where T : DuelFragment
    {
        return RegisterFragmentListenerPriv<T>((frag, res) => listener((T)frag, res));
    }

    public DuelFragmentListenerHandle RegisterFragmentListener<T>(Action<T> listener)
        where T : DuelFragment
    {
        return RegisterFragmentListenerPriv<T>((frag, res) =>
        {
            if (res == DuelFragmentResult.Success)
            {
                listener((T)frag);
            }
        });
    }
    
    public List<DuelFragmentListener> GetFragmentListeners(Type type)
    {
        // Make a copy to avoid concurrent modification.
        return _fragmentListeners.TryGetValue(type, out var list) ? [..list] : [];
    }

    public void UnregisterListener(DuelFragmentListenerHandle handle)
    {
        if (_fragmentListeners.TryGetValue(handle.FragmentType, out var list))
        {
            list.Remove(handle.Listener);
        }
    }
    
    public DuelAttributeListenerHandle RegisterAttributeListener(DuelAttributeId attribute, DuelAttributeListener listener)
    {
        if (!_attributeListeners.ContainsKey(attribute))
        {
            _attributeListeners.Add(attribute, new());
        }

        _attributeListeners[attribute].Add(listener);
        return new DuelAttributeListenerHandle(attribute, listener);
    }
    
    public List<DuelAttributeListener> GetAttributeListeners(DuelAttributeId attribute)
    {
        return _attributeListeners.TryGetValue(attribute, out var list) ? [..list] : [];
    }
    
    public void UnregisterListener(DuelAttributeListenerHandle handle)
    {
        if (_attributeListeners.TryGetValue(handle.Attribute, out var list))
        {
            list.Remove(handle.Listener);
        }
    }
}

// todo: prefragment

public delegate void DuelFragmentListener(DuelFragment frag, DuelFragmentResult result);
public readonly record struct DuelFragmentListenerHandle(Type FragmentType, DuelFragmentListener Listener);

public delegate void DuelAttributeListener(DuelFragment frag, IEntity entity, DuelAttributeId attribute, int prevValue, int newValue);
public readonly record struct DuelAttributeListenerHandle(DuelAttributeId Attribute, DuelAttributeListener Listener);

// Maybe add global listeners in the future?