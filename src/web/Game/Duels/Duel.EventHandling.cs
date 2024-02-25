using System.Collections.Immutable;

namespace CardLab.Game.Duels;

// Event handling: where we handle stuff named events.
// HandleX methods occurs inside fragments, and can only queue actions to be executed after the fragment is done.

public sealed partial class Duel
{
    /**
     * Event handling
     */
    private void HandlePreFragment(DuelMutation mut, IDuelFragment2 fragment)
    {
        _logger.LogTrace("Applying fragment start: {Frag}", fragment);
        // todo
    }

    private void HandlePostFragment<T>(DuelMutation mut, IDuelFragment2<T> fragment, T ret)
    {
        _logger.LogTrace("Applying fragment end: {Frag}", fragment);
        // todo
    }

    // private ImmutableArray<DuelAction> HandleDeltaApplied(DuelFragment fragment, DuelStateDelta delta)
    // {
    //     return ImmutableArray<DuelAction>.Empty;
    // }

    // Fragment event handlers only add actions to the queue.

    private void HandlePostHurt(IDuelFragment2 frag, DuelSource source, DuelTarget target, int hp)
    {
        _logger.LogTrace("""
                         EVENT: PostHurt
                         in fragment {Frag}
                         by {Source}
                         to {Target}
                         dmg {Hp}
                         """, frag, source, target, hp);
        // todo
    }

    // core death is a special case
    private void HandlePostDeath(IDuelFragment2 frag, DuelSource? source, DuelUnit target)
    {
        _logger.LogTrace("""
                         EVENT: PostDeath
                         in fragment {Frag}
                         by {Source}
                         to {Target}
                         """, frag, source?.ToString() ?? "<NONE>", target);
        // todo
    }
}