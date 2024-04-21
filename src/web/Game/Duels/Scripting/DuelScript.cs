using System.Collections.Immutable;
using System.Runtime.CompilerServices;

namespace CardLab.Game.Duels.Scripting;

public abstract class DuelScript(Duel duel, IEntity entity)
{
    public IEntity Entity { get; } = entity;
    public Duel Duel { get; } = duel;
    public DuelState State => Duel.State;
    protected readonly List<DuelFragmentListenerHandle> FragListeners = new();
    protected readonly List<DuelAttributeListenerHandle> AttrListeners = new();

    // Used by Duel/DuelState to know if it's in the ActiveScripts list
    public bool Active { get; set;  } = false;

    // not called for starting cards in deck (for now)
    public virtual void PostSpawn(DuelFragment frag)
    {
    }

    public virtual void PostEliminated(DuelFragment frag)
    {
    }

    public virtual void PostAttributeChange(DuelFragment frag, DuelAttributeId attribute, int prev, int now)
    {
    }

    /*
     * Called directly when the turn count changes, should be used for internal variable updates only.
     */
    public virtual void PostTurnChange(DuelFragment frag, PlayerIndex prev, PlayerIndex now, int idx)
    {
    }

    /*
     * Called when the mutation ends successfully.
     */
    public virtual void PostMutationEnd(DuelMutation mut)
    {
        
    }

    // Card-specific events
    public virtual void CardPostMove(DuelFragment frag, DuelCardLocation prev, DuelCardLocation now)
    {
    }

    // For all cards: checks costs and stuff
    // For spell cards: only uses this function to determine the card's playability
    // For unit cards: also checks if the slot is free.
    public virtual bool CardCanPlay(DuelFragment frag,
        PlayerIndex player,
        ImmutableArray<DuelArenaPosition> slots,
        ImmutableArray<int> entities)
    {
        return true;
    }

    // Only used for spell cards
    public virtual void CardOnPlay(DuelFragment frag,
        PlayerIndex player,
        ImmutableArray<DuelArenaPosition> slots,
        ImmutableArray<int> entities)
    {
    }

    // Unit-specific events
    public virtual void UnitPostMove(DuelFragment frag, DuelGridVec prev, DuelGridVec now)
    {
    }

    public virtual void UnitPostAttack(DuelFragment frag, int targetId)
    {
    }

    public virtual void UnitPostDealDamage(DuelFragment frag, int damage, int target)
    {
    }

    public virtual void UnitPostTakeDamage(DuelFragment frag, int damage, int? source)
    {
    }

    public virtual void UnitPostReceiveHeal(DuelFragment frag, int amount, int? source)
    {
    }

    public virtual void UnitPostGiveHeal(DuelFragment frag, int amount, int? source)
    {
    }

    protected DuelFragmentListenerHandle ListenFragment<T>(Action<T> listener, bool persistent = false)
        where T : DuelFragment
    {
        if (Entity.Eliminated) throw new InvalidOperationException();

        var l = State.Listeners.RegisterFragmentListener(listener);
        if (!persistent) FragListeners.Add(l);
        return l;
    }

    protected DuelFragmentListenerHandle ListenFragment<T>(Action<T, DuelFragmentResult> listener,
        bool persistent = false)
        where T : DuelFragment
    {
        if (Entity.Eliminated) throw new InvalidOperationException();

        var l = State.Listeners.RegisterFragmentListener(listener);
        if (!persistent) FragListeners.Add(l);
        return l;
    }

    protected DuelAttributeListenerHandle ListenAttribute(DuelAttributeId attribute, DuelAttributeListener listener,
        bool persistent = false)
    {
        if (Entity.Eliminated) throw new InvalidOperationException();

        var l = State.Listeners.RegisterAttributeListener(attribute, listener);
        if (!persistent) AttrListeners.Add(l);
        return l;
    }

    protected void Unlisten(DuelAttributeListenerHandle handle)
    {
        Duel.State.Listeners.UnregisterListener(handle);
        AttrListeners.Remove(handle);
    }

    protected void Unlisten(DuelFragmentListenerHandle handle)
    {
        Duel.State.Listeners.UnregisterListener(handle);
        FragListeners.Remove(handle);
    }

    public void Eliminate(DuelFragment frag)
    {
        ClearListeners();
        PostEliminated(frag);
    }

    public void ClearListeners()
    {
        foreach (var handle in FragListeners)
        {
            Duel.State.Listeners.UnregisterListener(handle);
        }

        foreach (var handle in AttrListeners)
        {
            Duel.State.Listeners.UnregisterListener(handle);
        }

        FragListeners.Clear();
        AttrListeners.Clear();
    }
}

public abstract class DuelScript<T> : DuelScript where T : class, IEntity
{
    public new T Entity => Unsafe.As<T>(base.Entity);

    protected DuelScript(Duel duel, IEntity entity) : base(duel, entity)
    {
        if (entity is not T)
        {
            throw new InvalidOperationException($"Entity is not of type ${typeof(T).Name}");
        }
    }
}