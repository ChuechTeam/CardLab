using System.Collections.Immutable;

namespace CardLab.Game.Duels;

public sealed partial class Duel
{
    /**
     * Event handling
     */
    private DuelMutation HandlePreFragment(DuelMutation mut, DuelFragmentKind kind)
    {
        _logger.LogTrace("Applying fragment start: {Frag}", kind.ToString());
        // todo
        return mut;
    }

    private DuelMutation HandlePostFragment(DuelMutation mut, DuelFragmentKind kind)
    {
        _logger.LogTrace("Applying fragment end: {Frag}", kind.ToString());
        // todo
        return mut;
    }

    private ImmutableArray<DuelAction> HandleDeltaApplied(DuelFragment fragment, DuelStateDelta delta)
    {
        return ImmutableArray<DuelAction>.Empty;
    }

    // Fragment event handlers only add actions to the queue.

    private DuelFragment HandlePostHurt(DuelFragment frag, DuelSource source, DuelTarget target, ref int hp)
    {
        return frag;
    }
}