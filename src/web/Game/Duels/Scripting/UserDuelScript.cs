using System.Collections.Immutable;
using CardLab.Game.AssetPacking;

namespace CardLab.Game.Duels.Scripting;

public sealed class UserDuelScript(Duel duel, DuelUnit entity, CardScript script) : DuelScript<DuelUnit>(duel, entity)
{
    public const int MaxIndividualTriggersPerIteration = 5;

    public const int MaxTotalTriggersPerIteration = 25;

    // Maximum amount of depth (only counting UnitTriggerFragments by this unit)
    // for running triggers.
    // For example, with a value of 2, you can have:
    // - FragUnitTrigger (Me)
    //   - FragUnitTrigger (Me)
    //     [No more FragUnitTrigger by me past this point]
    public const int SelfTriggerMaxDepth = 2;
    
    // Same thing, but with ANY trigger!
    public const int AnyTriggerMaxDepth = 4;

    private PlayerIndex MyPlayerIdx => entity.Owner;
    private PlayerIndex AdvPlayerIdx => MyPlayerIdx == PlayerIndex.P1 ? PlayerIndex.P2 : PlayerIndex.P1;
    private DuelPlayerState MyPlayer => State.GetPlayer(MyPlayerIdx);
    private DuelPlayerState AdvPlayer => State.GetPlayer(AdvPlayerIdx);

    // To avoid recursive deployments (eg. On deployment, deploy myself)
    private bool _deploymentsDisabledThisTurn = false;
    private int _numOfAttacks = 0;
    private int _triggersThisIteration = 0;
    private readonly List<int> _modifiersToRemoveOnDeath = new();

    // Special events:
    // - PostSpawn is handled inside... PostSpawn
    // - PostNthAttack is handled inside PostUnitAttack
    // - PostDeath is handled inside PostEliminated, since listeners are removed on death.
    private readonly List<CardAction> _postSpawnActions = new();
    private readonly List<(int nth, ImmutableArray<CardAction> actions)> _postNthAttackTriggers = new();
    private readonly List<CardAction> _postDeathActions = new();

    /*
     * Main script handlers
     */

    public override void PostSpawn(DuelFragment frag)
    {
        RegisterScriptEventHandlers();
        if (_postSpawnActions.Count != 0)
        {
            QueueTrigger(frag, [.._postSpawnActions]);
        }
    }

    public override void PostMutationEnd(DuelMutation mut)
    {
        _triggersThisIteration = 0;
    }

    public override void PostTurnChange(DuelFragment frag, PlayerIndex prev, PlayerIndex now, int idx)
    {
        _deploymentsDisabledThisTurn = false;
    }

    public override void PostEliminated(DuelFragment frag)
    {
        if (_postDeathActions.Count != 0)
        {
            QueueTrigger(frag, [.._postDeathActions], true);
        }

        frag.EnqueueFragment(new Duel.FragRemoveModifiers(_modifiersToRemoveOnDeath));
        _modifiersToRemoveOnDeath.Clear();
    }

    public override void UnitPostAttack(DuelFragment frag, int targetId)
    {
        _numOfAttacks++;
        for (var i = _postNthAttackTriggers.Count - 1; i >= 0; i--)
        {
            var postNthAttackTrigger = _postNthAttackTriggers[i];
            if (postNthAttackTrigger.nth == _numOfAttacks)
            {
                _postNthAttackTriggers.RemoveAt(i);
                QueueTrigger(frag, postNthAttackTrigger.actions);
            }
        }
    }

    /*
     * Filters
     */

    private IEnumerable<IEntity> ApplyFilter(IEnumerable<IEntity> entities, Filter filter)
    {
        return filter switch
        {
            AttrFilter af => Attr(af.Attr, af.Op, af.Value),
            WoundedFilter => Wounded(),
            AdjacentFilter => Adjacent(),
            ArchetypeFilter arf => Archetype(arf.NormalizedArchetype),
            _ => entities
        };

        IEnumerable<IEntity> Attr(ScriptableAttribute attr, FilterOp op, int value)
        {
            foreach (var ent in entities)
            {
                ushort attrId = attr switch
                {
                    ScriptableAttribute.Health => DuelBaseAttrs.Health,
                    ScriptableAttribute.Attack => DuelBaseAttrs.Attack,
                    ScriptableAttribute.Cost => DuelBaseAttrs.Cost,
                    _ => throw new ArgumentOutOfRangeException(nameof(attr), attr, null)
                };

                // Special case for the Cost attribute, so we retrieve it from the card.
                var attribs = ent.Attribs;
                if (attrId == DuelBaseAttrs.Cost && ent is DuelUnit u)
                {
                    attribs = u.OriginStats;
                }
                
                if (!attribs.Registered(attrId))
                {
                    continue;
                }

                int cur = attribs.GetActual(attrId);
                bool pass = op switch
                {
                    FilterOp.Greater => cur > value,
                    FilterOp.Lower => cur < value,
                    FilterOp.Equal => cur == value,
                    _ => throw new ArgumentOutOfRangeException(nameof(op), op, null)
                };

                if (pass)
                {
                    yield return ent;
                }
            }
        }

        IEnumerable<IEntity> Wounded()
        {
            foreach (var entity in entities)
            {
                if (entity.Attribs.GetHealth() < entity.Attribs.GetMaxHealth())
                {
                    yield return entity;
                }
            }
        }

        IEnumerable<IEntity> Archetype(string normArchetype)
        {
            foreach (var entity in entities)
            {
                if (entity is DuelUnit unit && unit.NormalizedArchetype == normArchetype)
                {
                    yield return entity;
                }
            }
        }

        IEnumerable<IEntity> Adjacent()
        {
            foreach (var entity in entities)
            {
                if (entity is DuelUnit unit)
                {
                    foreach (var adj in GetAdjacentUnits(unit.Position.Player, unit.Position.Vec))
                    {
                        yield return adj;
                    }
                }
            }
        }
    }

    private IEnumerable<IEntity> ApplyFilters(IEnumerable<IEntity> entities, ImmutableArray<Filter> filters)
    {
        return Enumerable.Aggregate(filters, entities, ApplyFilter);
    }

    /*
     * Targets
     */

    private IEnumerable<IEntity> EvaluateTarget(Target target, DuelFragment context)
    {
        return target switch
        {
            MeTarget => new[] { Entity },
            SourceTarget => context switch
            {
                Duel.FragAttackUnit frag => IdToEntityList(frag.UnitId),
                Duel.FragHurtEntity frag => IdToEntityList(frag.SourceId),
                Duel.FragHealEntity frag => IdToEntityList(frag.SourceId),
                Duel.FragDestroyUnit frag => IdToEntityList(frag.SourceId),
                _ => Enumerable.Empty<IEntity>()
            },
            TargetTarget => context switch
            {
                Duel.FragAttackUnit frag => IdToEntityList(frag.TargetId),
                Duel.FragHurtEntity frag => IdToEntityList(frag.TargetId),
                Duel.FragHealEntity frag => IdToEntityList(frag.TargetId),
                Duel.FragDestroyUnit frag => IdToEntityList(frag.UnitId),
                Duel.FragMoveCard frag => IdToEntityList(frag.CardId),
                _ => Enumerable.Empty<IEntity>()
            },
            CoreTarget t => [t.Enemy ? AdvPlayer : MyPlayer],
            QueryTarget q => Query(q),
            NearbyAllyTarget(var dir) => Nearby(dir),
            _ => Enumerable.Empty<IEntity>()
        };

        IEnumerable<IEntity> Query(QueryTarget t)
        {
            IEnumerable<IEntity> allSameTeam;

            switch (t.Kind)
            {
                case EntityType.Unit:
                {
                    var all = State.Units.Values;
                    allSameTeam = t.Team switch
                    {
                        GameTeam.Ally => all.Where(x => x.Owner == Entity.Owner && x.Id != Entity.Id),
                        GameTeam.Enemy => all.Where(x => x.Owner != Entity.Owner),
                        _ => all
                    };
                    break;
                }
                case EntityType.Card:
                {
                    allSameTeam = t.Team switch
                    {
                        GameTeam.Ally => HandCards(MyPlayerIdx),
                        GameTeam.Enemy => HandCards(AdvPlayerIdx),
                        _ => HandCardsAll()
                    };
                    break;
                }
                default:
                    throw new InvalidOperationException();
            }

            List<IEntity> filtered = ApplyFilters(allSameTeam, t.Filters).ToList();

            // Then we need to pick at random
            if (t.N > 0)
            {
                while (filtered.Count > t.N)
                {
                    var deleteIdx = Duel.Rand.Next(filtered.Count);
                    var lastIdx = filtered.Count - 1;
                    filtered[deleteIdx] = filtered[lastIdx];
                    filtered.RemoveAt(lastIdx);
                }
            }

            return filtered;
        }

        IEnumerable<IEntity> Nearby(UnitDirection dir)
        {
            var pos = Entity.Position.Vec;
            if (ApplyUnitDir(pos, dir) is {} p && MyPlayer.Units[p.ToIndex(Duel)] is { } unitId)
            {
                return new[] { State.FindUnit(unitId)! };
            }
            else
            {
                return Enumerable.Empty<IEntity>();
            }
        }
    }

    private IEnumerable<IEntity> EvaluateTarget(Target target, in EventContext context) =>
        EvaluateTarget(target, context.ReactingTo);

    /*
     * Actions
     */

    private bool ExecuteAction(in EventContext ctx, CardAction action)
    {
        List<DuelFragment> fragments = new();
        switch (action)
        {
            case HurtAction:
            case HealAction:
            {
                var dmg = action is HurtAction;
                var targetNode = dmg ? ((HurtAction)action).Target : ((HealAction)action).Target;
                var value = dmg ? ((HurtAction)action).Damage : ((HealAction)action).Damage;

                var target = EvaluateTarget(targetNode, ctx).ToList();
                fragments = target
                    .Select<IEntity, DuelFragment>(t =>
                        dmg
                            ? new Duel.FragHurtEntity(Entity.Id, t.Id, value)
                            : new Duel.FragHealEntity(Entity.Id, t.Id, value))
                    .ToList();

                var tint = dmg ? EffectTint.Negative : EffectTint.Positive;
                return RunFragmentListInEffect(ctx, tint, fragments);
            }
            case DrawCardAction dc:
            {
                if (dc.N <= 0)
                {
                    return false;
                }

                if (dc.Filters.IsEmpty)
                {
                    for (int i = 0; i < dc.N; i++)
                    {
                        fragments.Add(new Duel.FragDrawCards(MyPlayerIdx, 1));
                    }
                }
                else
                {
                    foreach (var card in PickRandomCards(DeckCards(MyPlayerIdx), dc.Filters, dc.N))
                    {
                        fragments.Add(new Duel.FragDrawCards(MyPlayerIdx, 0, card.Id));
                    }
                }

                return RunFragmentList(ctx, fragments);
            }
            case DiscardCardAction disc:
            {
                if (disc.N <= 0)
                {
                    return false;
                }

                var whoseHand = disc.MyHand ? MyPlayerIdx : AdvPlayerIdx;
                var gone = PickRandomCards(HandCards(whoseHand), disc.Filters, disc.N);

                foreach (var card in gone)
                {
                    fragments.Add(new Duel.FragMoveCard(card.Id, DuelCardLocation.Discarded));
                }

                return RunFragmentList(ctx, fragments);
            }
            case AttackAction att:
            {
                var targets = EvaluateTarget(att.Target, ctx);
                foreach (var target in targets)
                {
                    fragments.Add(new Duel.FragAttackUnit(Entity.Id, target.Id, true));
                }

                return RunFragmentList(ctx, fragments);
            }
            case ModifierAction mod:
            {
                var negateValue = mod.Attr == ScriptableAttribute.Cost ? mod.IsBuff : !mod.IsBuff;
                var value = negateValue ? -Math.Abs(mod.Value) : Math.Abs(mod.Value);
                if (value == 0)
                {
                    return false;
                }

                var targets = EvaluateTarget(mod.Target, ctx).ToList();

                List<(int, ushort)> toApply = new();
                foreach (var target in targets)
                {
                    ushort? attr = mod.Attr switch
                    {
                        ScriptableAttribute.Attack => target is not DuelPlayerState ? DuelBaseAttrs.Attack : null,
                        ScriptableAttribute.Health => target switch
                        {
                            DuelUnit => DuelBaseAttrs.MaxHealth,
                            DuelCard => DuelBaseAttrs.Health,
                            _ => null
                        },
                        ScriptableAttribute.Cost => target is DuelCard ? DuelBaseAttrs.Cost : null,
                        _ => null
                    };
                    if (attr is not { } realAttr)
                    {
                        continue;
                    }

                    toApply.Add((target.Id, realAttr));
                }

                if (ctx.RunningTrigger is null)
                {
                    return toApply.Count > 0;
                }

                // This is real from now on!
                ctx.RunningTrigger.ApplyFrag(new Duel.FragEffect(Entity.Id,
                    mod.IsBuff ? EffectTint.Neutral : EffectTint.Negative, f =>
                    {
                        foreach (var (targetId, attr) in toApply)
                        {
                            f.ApplyFrag(new Duel.FragAlteration(
                                Entity.Id, targetId, mod.IsBuff, f2 =>
                                {
                                    var target = State.FindEntity(targetId)!;
                                    if (mod.Duration == -1)
                                    {
                                        var newVal = target.Attribs.GetBase(attr) + value;
                                        f2.ApplyFrag(new Duel.FragSetAttribute(target.Id, attr, newVal));
                                    }
                                    else
                                    {
                                        var modifier = new DuelModifier
                                        {
                                            Attribute = attr,
                                            Op = DuelModifierOperation.Add,
                                            Value = value,
                                            TargetId = target.Id,
                                            TurnsRemaining = mod.Duration == 0 ? -1 : mod.Duration
                                        };
                                        var frag = new Duel.FragAddModifiers(modifier);
                                        var res = f.ApplyFrag(frag);
                                        if (mod.Duration == 0 && res == DuelFragmentResult.Success &&
                                            frag.CreatedIds.Count != 0)
                                        {
                                            _modifiersToRemoveOnDeath.Add(frag.CreatedIds[0]);
                                        }
                                    }

                                    // Special case so applying a max health modifier also heals indirectly
                                    if (attr == DuelBaseAttrs.MaxHealth && value > 0)
                                    {
                                        var newVal = target.Attribs.GetHealth() + value;
                                        f2.ApplyFrag(new Duel.FragSetAttribute(target.Id, DuelBaseAttrs.Health,
                                            newVal));
                                    }
                                }));
                        }
                    }));

                return true;
            }
            case DeployAction deploy:
            {
                if (_deploymentsDisabledThisTurn)
                {
                    return false;
                }
                
                var pool = new List<QualCardRef>();
                if (deploy.Filters.IsEmpty)
                {
                    pool.AddRange(Duel.CardDatabase.Keys);
                }
                else
                {
                    foreach (var pair in Duel.CardDatabase)
                    {
                        var virtualEntity = Duel.MakeCard(pair.Key, true);
                        if (ApplyFilters(new[] { virtualEntity }, deploy.Filters).Any())
                        {
                            pool.Add(pair.Key);
                        }

                        // We just need one unit for dry running. No need to create a whole pool.
                        if (ctx.DryRun)
                        {
                            break;
                        }
                    }
                }

                // I don't want to overcomplicate dry-run checks, so from now on we'll assume there's enough
                // space in the board.
                if (ctx.DryRun && pool.Count > 0)
                {
                    return true;
                }

                var randomPick = pool[Duel.Rand.Next(pool.Count)];
                var vec = ApplyUnitDir(Entity.Position.Vec, deploy.Direction);
                if (vec is null || MyPlayer.Units[vec.Value.ToIndex(Duel)] is not null)
                {
                    var vecPool = new List<DuelGridVec>(MyPlayer.Units.Length);
                    for (int i = 0; i < MyPlayer.Units.Length; i++)
                    {
                        if (MyPlayer.Units[i] is null)
                        {
                            vecPool.Add(DuelGridVec.FromIndex(Duel, i));
                        }
                    }

                    if (vecPool.Count != 0)
                    {
                        vec = vecPool[Duel.Rand.Next(vecPool.Count)];
                    }
                }

                if (vec is { } realVec)
                {
                    var virtCard = Duel.MakeCard(randomPick, true);
                    ctx.ApplyFrag(new Duel.FragSpawnUnit(MyPlayerIdx, -1, 
                        new DuelArenaPosition(MyPlayerIdx, realVec), virtCard)
                    {
                        Configure = ConfigureUnit
                    });
                }

                // Use a configure function to avoid recursive deployments. 
                static void ConfigureUnit(DuelUnit u)
                {
                    if (u.Script is UserDuelScript script)
                    {
                        script._deploymentsDisabledThisTurn = true;
                    }
                }

                return true;
            }
            case SingleConditionalAction condSingle:
            {
                var target = condSingle.Target switch
                {
                    ConditionalTarget.Me => Entity,
                    ConditionalTarget.Source => EvaluateTarget(new SourceTarget(), ctx).FirstOrDefault(),
                    ConditionalTarget.Target => EvaluateTarget(new TargetTarget(), ctx).FirstOrDefault(),
                    _ => null
                };

                if (target == null || !ApplyFilters(new[] { target }, condSingle.Conditions).Any())
                {
                    return false;
                }

                return ExecuteActionSequence(ctx, condSingle.Actions.AsSpan());
            }
            case MultiConditionalAction condMulti:
            {
                var query = new QueryTarget(EntityType.Unit, condMulti.Team, condMulti.Conditions, 0);
                var targets = EvaluateTarget(query, ctx);
                if (targets.Count() >= condMulti.MinUnits)
                {
                    return ExecuteActionSequence(ctx, condMulti.Actions.AsSpan());
                }
                else
                {
                    return false;
                }
            }
            default:
                Duel.Logger.LogError("Unknown action: {Action}", action);
                return false;
        }
    }

    private bool ExecuteActionSequence(in EventContext ctx, ReadOnlySpan<CardAction> actions, bool allowDeath = false)
    {
        bool atLeastOne = false;
        foreach (var act in actions)
        {
            atLeastOne |= ExecuteAction(ctx, act);

            // Exit early in dryRun.
            if (ctx.DryRun && atLeastOne)
            {
                return true;
            }

            // Return early; we don't want to execute actions when dead EXCEPT for on-death events.
            if (allowDeath || !Entity.Eliminated)
            {
                return atLeastOne;
            }
        }

        return atLeastOne;
    }

    private bool RunFragmentList(in EventContext context, List<DuelFragment> fragments)
    {
        if (fragments.Count == 0)
        {
            return false;
        }

        foreach (var duelFragment in fragments)
        {
            if (!duelFragment.Verify(Duel))
            {
                return false;
            }
        }

        if (context.RunningTrigger != null)
        {
            foreach (var frag in fragments)
            {
                context.RunningTrigger.ApplyFrag(frag);
            }
        }

        return true;
    }

    private bool RunFragmentListInEffect(in EventContext context, EffectTint tint, List<DuelFragment> fragments)
    {
        if (!fragments.Any(x => x.Verify(Duel)))
        {
            return false;
        }

        if (context.RunningTrigger != null)
        {
            context.RunningTrigger.ApplyFrag(new Duel.FragEffect(Entity.Id, tint, fragments));
        }

        return true;
    }

    /*
     * Events
     */

    private void RegisterEventHandler(CardEventHandler handler)
    {
        switch (handler.Event)
        {
            case PostSpawnEvent:
                _postSpawnActions.AddRange(handler.Actions);
                break;
            case PostUnitNthAttackEvent nthAt:
                _postNthAttackTriggers.Add((nthAt.N, handler.Actions));
                break;
            case PostUnitEliminatedEvent unitElim:
                if (unitElim.Team == GameTeam.Self)
                {
                    _postDeathActions.AddRange(handler.Actions);
                }
                else
                {
                    ListenFragment<Duel.FragDestroyUnit>(f =>
                    {
                        if (State.FindUnit(f.UnitId, true) is { } u && IsInTeam(u, unitElim.Team))
                        {
                            QueueTrigger(f, handler.Actions);
                        }
                    });
                }
                break;
            case PostUnitKillEvent:
                ListenFragment<Duel.FragDestroyUnit>(f =>
                {
                    if (f.SourceId == Entity.Id)
                    {
                        QueueTrigger(f, handler.Actions);
                    }
                });
                break;
            case PostUnitHurtEvent hurt:
                ListenFragment<Duel.FragHurtEntity>(f =>
                {
                    var subject = hurt.Dealt ? f.SourceId : f.TargetId;
                    if (subject is { } s && State.FindUnit(s, true) is { } u && IsInTeam(u, hurt.Team))
                    {
                        QueueTrigger(f, handler.Actions);
                    }
                });
                break;
            case PostUnitHealEvent heal:
                ListenFragment<Duel.FragHealEntity>(f =>
                {
                    var subject = heal.Dealt ? f.SourceId : f.TargetId;
                    if (subject is { } s && State.FindUnit(s, true) is { } u && IsInTeam(u, heal.Team))
                    {
                        QueueTrigger(f, handler.Actions);
                    }
                });
                break;
            case PostUnitAttackEvent attack:
                ListenFragment<Duel.FragAttackUnit>(f =>
                {
                    var subject = attack.Dealt ? f.UnitId : f.TargetId;
                    if (State.FindUnit(subject, true) is { } u && IsInTeam(u, attack.Team))
                    {
                        QueueTrigger(f, handler.Actions);
                    }
                });
                break;
            case PostNthCardPlayEvent nthCard:
                ListenAttribute(DuelBaseAttrs.CardsPlayedThisTurn, (frag, ent, _, _, newValue) =>
                {
                    if (newValue == nthCard.N && ent.Id == MyPlayer.Id)
                    {
                        QueueTrigger(frag, handler.Actions);
                    }
                });
                break;
            case PostCardMoveEvent move:
                ListenFragment<Duel.FragMoveCard>(f =>
                {
                    bool run = move.Kind switch
                    {
                        CardMoveKind.Played => f.Parent is Duel.FragUseCard uc 
                                               && uc.Player == MyPlayerIdx,
                        CardMoveKind.Discarded => f.NewLocation == DuelCardLocation.Discarded
                                                  && f.PrevLocation == Duel.PlayerHandLoc(MyPlayerIdx),
                        CardMoveKind.Drawn => f.Parent is Duel.FragDrawCards dc
                                              && dc.Player == MyPlayerIdx,
                        _ => false
                    };
                    if (run)
                    {
                        QueueTrigger(f, handler.Actions);
                    }
                });
                break;
            case PostTurnEvent turn:
                ListenFragment<Duel.FragSwitchTurn>(f =>
                {
                    bool run = turn.Team switch
                    {
                        GameTeam.Self or GameTeam.Ally => f.Player == MyPlayerIdx,
                        GameTeam.Enemy => f.Player == AdvPlayerIdx,
                        _ => true
                    };

                    if (run)
                    {
                        QueueTrigger(f, handler.Actions);
                    }
                });
                break;
            default:
                Duel.Logger.LogError("Unknown event: {Event}", handler.Event);
                break;
        }
    }

    private void RegisterScriptEventHandlers()
    {
        foreach (var handler in script.Handlers)
        {
            RegisterEventHandler(handler);
        }
    }

    private void QueueTrigger(DuelFragment reactingTo, ImmutableArray<CardAction> actions, bool allowDeath = false)
    {
        if (!CanStartTrigger(reactingTo, allowDeath))
        {
            return;
        }

        // Queue a trigger that verifies inside the fragments so we get correct validation,
        // instead of checking now which might be stale data.

        reactingTo.EnqueueFragment(new Duel.FragUnitTrigger(Entity.Id,
            f =>
            {
                RegisterTriggerExecuted(reactingTo);
                ExecuteActionSequence(new EventContext(reactingTo, f), actions.AsSpan(), allowDeath);
            }, f => CanStartTrigger(reactingTo, allowDeath, true)
                    && ExecuteActionSequence(new EventContext(reactingTo, null), actions.AsSpan(), allowDeath)));
    }

    private void RegisterTriggerExecuted(DuelFragment reactingTo)
    {
        _triggersThisIteration++;
        reactingTo.Mutation.UserScriptingState.TotalTriggers++;
    }

    private bool CanStartTrigger(DuelFragment reactingTo, bool allowDeath, bool disableParentCheck = false)
    {
        // Keep a reasonable limit of triggers per iteration.
        var maxTriggersOk =
            _triggersThisIteration < MaxIndividualTriggersPerIteration
            && reactingTo.Mutation.UserScriptingState.TotalTriggers < MaxTotalTriggersPerIteration;

        if (!maxTriggersOk)
        {
            return false;
        }
        
        if (!allowDeath && Entity.Eliminated)
        {
            return false;
        }

        if (disableParentCheck)
        {
            return true;
        }

        // Then, we need to make sure that any trigger that comes from forbidden fragments
        // don't occur too much.
        // Example:
        // - FragDrawCard = A
        //   - [children fragments]
        // - FragUnitTrigger to A
        //   - FragDrawCard = B
        //     - [children fragments]
        //   - FragUnitTrigger to B <-- Max depth!
        //     [No more FragUnitTrigger]
        var parent = reactingTo.Parent;
        int myDepth = 0;
        int anyDepth = 0;
        while (parent is not null)
        {
            if (parent is Duel.FragUnitTrigger f)
            {
                if (f.UnitId == Entity.Id)
                {
                    myDepth++;
                }

                anyDepth++;

                if (myDepth >= SelfTriggerMaxDepth || anyDepth >= AnyTriggerMaxDepth)
                {
                    return false;
                }
            }

            parent = parent.Parent;
        }

        return true;
    }

    /*
     * Random utilities
     */

    private IEnumerable<DuelCard> PickRandomCards(IEnumerable<DuelCard> cards, ImmutableArray<Filter> filters, int n)
    {
        var eligibleCards = ApplyFilters(cards, filters).ToList();
        for (int i = 0; i < n && eligibleCards.Count > 0; i++)
        {
            var idx = Duel.Rand.Next(eligibleCards.Count);
            yield return (DuelCard)eligibleCards[idx];
            eligibleCards.RemoveAt(idx);
        }
    }

    private IEnumerable<DuelUnit> GetAdjacentUnits(PlayerIndex player, DuelGridVec vec)
    {
        var ps = State.GetPlayer(player);
        var left = vec with { X = vec.X - 1 };
        var right = vec with { X = vec.X + 1 };
        var up = vec with { Y = vec.Y - 1 };
        var down = vec with { Y = vec.Y + 1 };

        if (left.Valid(Duel) && ps.Units[left.ToIndex(Duel)] is { } i1)
        {
            yield return State.FindUnit(i1)!;
        }

        if (right.Valid(Duel) && ps.Units[right.ToIndex(Duel)] is { } i2)
        {
            yield return State.FindUnit(i2)!;
        }

        if (up.Valid(Duel) && ps.Units[up.ToIndex(Duel)] is { } i3)
        {
            yield return State.FindUnit(i3)!;
        }

        if (down.Valid(Duel) && ps.Units[down.ToIndex(Duel)] is { } i4)
        {
            yield return State.FindUnit(i4)!;
        }
    }

    // not null if valid
    private DuelGridVec? ApplyUnitDir(DuelGridVec vec, UnitDirection dir)
    {
        DuelGridVec dp = dir switch
        {
            UnitDirection.Right => new(1, 0),
            UnitDirection.Left => new(-1, 0),
            UnitDirection.Up => new(0, 1),
            UnitDirection.Down => new(0, -1),
            _ => new(999, 999) // panic!
        };
        var newPos = vec + dp;
        if (newPos.Valid(Duel))
        {
            return newPos;
        }
        else
        {
            return null;
        }
    }

    private IEnumerable<IEntity> IdToEntityList(int? id)
    {
        if (id is null)
        {
            yield break;
        }

        var unit = State.FindUnit(id.Value);
        if (unit != null)
        {
            yield return unit!;
        }
    }

    private IEnumerable<DuelCard> HandCardsAll()
    {
        foreach (var player in State.Players)
        {
            foreach (var card in player.Hand)
            {
                yield return State.FindCard(card)!;
            }
        }
    }

    private IEnumerable<DuelCard> HandCards(PlayerIndex pi)
    {
        var player = State.GetPlayer(pi);

        foreach (var card in player.Hand)
        {
            yield return State.FindCard(card)!;
        }
    }

    private IEnumerable<DuelCard> DeckCards(PlayerIndex pi)
    {
        var player = State.GetPlayer(pi);

        foreach (var card in player.Deck)
        {
            yield return State.FindCard(card)!;
        }
    }

    private bool IsInTeam(IEntity ent, GameTeam team)
    {
        if (team == GameTeam.Any)
        {
            return true;
        }

        if (team == GameTeam.Self)
        {
            return ent is DuelUnit u && u == Entity;
        }

        if (team is GameTeam.Ally && ent.Equals(Entity))
        {
            return false;
        }

        var idx = team == GameTeam.Enemy ? AdvPlayerIdx : MyPlayerIdx;

        return ent switch
        {
            DuelUnit unit => unit.Owner == idx,
            DuelCard card => CardLocToPlayer(card.Location) == idx,
            DuelPlayerState s => s.Index == idx,
            _ => false
        };
    }

    private PlayerIndex? CardLocToPlayer(DuelCardLocation loc)
    {
        return loc switch
        {
            DuelCardLocation.DeckP1 => PlayerIndex.P1,
            DuelCardLocation.DeckP2 => PlayerIndex.P2,
            DuelCardLocation.HandP1 => PlayerIndex.P1,
            DuelCardLocation.HandP2 => PlayerIndex.P2,
            _ => null
        };
    }

    private readonly record struct EventContext(DuelFragment ReactingTo, DuelFragment? RunningTrigger)
    {
        public bool DryRun => RunningTrigger is null;

        public DuelFragmentResult ApplyFrag(DuelFragment f)
        {
            return DryRun ? DuelFragmentResult.VerifyFailed : RunningTrigger!.ApplyFrag(f);
        }
    }
}

public struct UserScriptingMutState()
{
    public int TotalTriggers = 0;
}