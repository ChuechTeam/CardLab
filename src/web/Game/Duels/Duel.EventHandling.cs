using System.Collections.Immutable;

namespace CardLab.Game.Duels;

// Event handling: where we handle stuff named events (surprising!).
// Pre-fragment handlers run fragments directly, during the preparation phase.
// During & post-fragment handlers only add fragments to the queue.

public sealed partial class Duel
{
    private void HandlePreFragment(DuelMutation mut, DuelFragment fragment)
    {
        _logger.LogTrace("Applying fragment start: {Frag}", fragment);
        // todo
    }

    private void HandlePostFragment(DuelMutation mut, DuelFragment fragment)
    {
        _logger.LogTrace("Applying fragment end: {Frag}", fragment);
        // todo
    }
    
    private void HandlePostHurt(DuelFragment frag, IEntity source, IEntity target, int hp)
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
    
    private void HandlePostDeath(DuelFragment frag, IEntity? source, IEntity target)
    {
        _logger.LogTrace("""
                         EVENT: PostDeath
                         in fragment {Frag}
                         by {Source}
                         to {Target}
                         """, frag, source?.ToString() ?? "<NONE>", target);
        // todo
    }

    private void HandlePostAttributeChange(DuelFragment frag, IEntity entity, DuelAttributeDefinition attribute,
        int prevValue, int newValue)
    {
        _logger.LogTrace("""
                         EVENT: PostAttributeChange
                         in fragment {Frag}
                         to {Entity}
                         attr {Attribute}
                         from {PrevValue}
                         to {NewValue}
                         """, frag, entity, attribute, prevValue, newValue);
    }
}