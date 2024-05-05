using System.Collections.Immutable;
using CardLab.Game.Duels;
using Microsoft.CodeAnalysis;

namespace CardLab.Game;

public static partial class CardModule
{
    public static UsageSummary CalculateCardBalance(CardDefinition cardDef)
    {
        int creditsAvailable = AllocatedScriptCredits(cardDef.Cost) + AllocatedStatCredits(cardDef.Cost);
        int creditsUsed = 0;

        creditsUsed += StatCost(BalanceStat.Attack, cardDef.Attack, cardDef.Cost);
        creditsUsed += StatCost(BalanceStat.Health, cardDef.Health, cardDef.Cost);

        var sc = cardDef.Script;
        if (sc is not null)
        {
            foreach (var handler in sc.Handlers)
            {
                var w = EventCostWeight(cardDef, handler.Event);
                foreach (var action in handler.Actions)
                {
                    var ctx = new BalanceEvalContext(handler.Event, action);
                    creditsUsed += (int)(ActionCost(ref ctx) * w);
                }
            }
        }

        return new UsageSummary(creditsAvailable, creditsUsed);
    }

    private static float EventCostWeight(CardDefinition def, CardEvent ev)
    {
        return ev switch
        {
            PostTurnEvent (var team) => team == GameTeam.Any ? 1.75f : 1.0f,
            PostSpawnEvent => 0.5f,
            PostUnitKillEvent => 0.7f,
            PostCoreHurtEvent (var team) => 0.6f * TeamFreq(team),
            PostUnitHurtEvent (var team, _) => 0.9f * TeamFreq(team),
            PostUnitHealEvent (var team, _) => 0.6f * TeamFreq(team),
            PostUnitAttackEvent (var team, _) => 0.8f * TeamFreq(team),
            PostUnitHealthChange (var thresh)
                => Math.Clamp(0.9f - 0.6f*Math.Abs(def.Health-thresh)/def.Health, 0.1f, 1.0f),
            PostUnitNthAttackEvent (var n) => n switch
            {
                <= 0 => 1.0f,
                1 => 0.7f,
                2 => 0.45f,
                3 => 0.3f,
                _ => 1.0f / n
            },
            PostNthCardPlayEvent (var n) => n switch
            {
                <= 1 => 0.9f,
                _ => Decay(n - 1, 0.7f) //n >= 2 
            },
            PostCardMoveEvent (var mk) => mk switch
            {
                CardMoveKind.Played => 1.5f,
                CardMoveKind.Drawn => 1.3f,
                CardMoveKind.Discarded => 0.5f,
                _ => 1.0f
            },
            _ => 1.0f
        };

        static float TeamFreq(GameTeam team)
        {
            return team switch
            {
                GameTeam.Enemy or GameTeam.Ally => 1.5f,
                GameTeam.Any => 2.0f,
                GameTeam.Self => 1.0f,
                _ => 0.0f
            };
        }

        static float Decay(int x, float valueAt1)
        {
            float invVal = 1 / valueAt1;
            return 1.0f / (invVal * x + 1);
        }
    }

    private static TargetEvaluation EvaluateTarget(Target target, ref readonly BalanceEvalContext ctx)
    {
        return target switch
        {
            CoreTarget t => new TargetEvaluation
            {
                AverageCardinality = 1,
                AllyProbability = t.Enemy ? 0 : 1
            },
            SourceTarget => new TargetEvaluation
            {
                AverageCardinality = 1,
                AllyProbability = AllyProbEvent(ctx.Event, true)
            },
            TargetTarget => new TargetEvaluation
            {
                AverageCardinality = 1,
                AllyProbability = AllyProbEvent(ctx.Event, false)
            },
            NearbyAllyTarget => new TargetEvaluation
            {
                AverageCardinality = 1,
                AllyProbability = 1
            },
            MeTarget => new TargetEvaluation
            {
                AverageCardinality = 1,
                AllyProbability = 1
            },
            QueryTarget q => Query(q, in ctx),
            _ => throw new InvalidOperationException($"{target.GetType()} unsupported"),
        };

        static float? AllyProbEvent(CardEvent ev, bool source)
        {
            static float ReverseTeamProb(GameTeam t) => 1.0f - TeamProb(t);

            // Boolean table:
            // DEALT | SOURCE
            // 0     | 0     -> 0  (Dealt is false, "team" represents the target, and we want the target)
            // 0     | 1     -> 1  (Dealt is false, "team" represents the target, BUT we want the source)
            // 1     | 0     -> 1  (Dealt is true,  "team" represents the source, BUT we want the target)
            // 1     | 1     -> 0  (Dealt is true,  "team" represents the source, and we want the source)
            // --> XOR
            return ev switch
            {
                PostUnitHealEvent (var team, _)
                    => TeamProb(team), // Healing is (almost) always from same team to same team.
                PostUnitHurtEvent (var team, var dealt)
                    => dealt ^ source ? TeamProb(team) : ReverseTeamProb(team),
                PostUnitAttackEvent (var team, var dealt)
                    => dealt ^ source ? TeamProb(team) : ReverseTeamProb(team),
                PostUnitEliminatedEvent (var team)
                    => source ? ReverseTeamProb(team) : TeamProb(team),
                _ => null
            };
        }

        static TargetEvaluation Query(QueryTarget target, ref readonly BalanceEvalContext ctx)
        {
            GameTeam team = target.Team;
            var teamProb = TeamProb(target.Team);
            var avgCard = target.N <= 0 ? (team == GameTeam.Any ? 5 : 3) : target.N;
            var filterProb = 1.0f;
            for (var i = 0; i < target.Filters.Length; i++)
            {
                var filter = target.Filters[i];
                // Find out duplicate filters and ignore them.
                for (var j = 0; j < i; j++)
                {
                    if (target.Filters[j] == filter)
                    {
                        continue;
                    }
                }

                var filterEval = EvaluateFilter(filter, in ctx);
                filterProb *= filterEval.MatchProbability;

                if (filterEval.EnforcedTeam is not GameTeam.Any && filterEval.EnforcedTeam != team)
                {
                    if (team == GameTeam.Any)
                    {
                        team = filterEval.EnforcedTeam;
                        teamProb = TeamProb(filterEval.EnforcedTeam);
                    }
                    else
                    {
                        // Then we have two incompatible teams overlapping.
                        return new TargetEvaluation
                        {
                            AverageCardinality = 0,
                            AllyProbability = 0
                        };
                    }
                }

                if (filterEval.EnforcedMaxCardinality >= 0)
                {
                    avgCard = Math.Min(avgCard, filterEval.EnforcedMaxCardinality);
                }
            }

            return new TargetEvaluation
            {
                AverageCardinality = avgCard * filterProb,
                AllyProbability = teamProb
            };
        }
    }

    private static FilterEvaluation EvaluateFilter(Filter filter, ref readonly BalanceEvalContext ctx)
    {
        return filter switch
        {
            WoundedFilter => new FilterEvaluation
            {
                MatchProbability = 0.7f
            },
            AdjacentFilter => new FilterEvaluation
            {
                EnforcedMaxCardinality = 3,
                MatchProbability = 0.65f,
                EnforcedTeam = GameTeam.Ally
            },
            ArchetypeFilter => new FilterEvaluation
            {
                // Deploying units of a specific archetype is very advantageous.
                Power = 1.3f,
                MatchProbability = 0.5f
            },
            CardTypeFilter => new FilterEvaluation
            {
                Power = 1.1f,
                MatchProbability = 0.75f
            },
            AttrFilter a => Attr(a, in ctx),
            _ => throw new InvalidOperationException()
        };

        static FilterEvaluation Attr(AttrFilter filter, ref readonly BalanceEvalContext ctx)
        {
            const int coverableVals = 12; // Includes 0! ==> [0, n-1]
            const int avgStat = 5;
            const float powerPerStatPt = 3.0f;
            const float minProb = 0.05f;

            var coveredVals = filter.Op switch
            {
                FilterOp.Equal => 1,
                FilterOp.Greater => Math.Max(0, coverableVals - filter.Value + 1),
                FilterOp.Lower => Math.Clamp(filter.Value, 0, coverableVals), // Excluding 0 here
                _ => 0
            };
            var coveredRatio = coveredVals / (float)coverableVals;

            float statMagnitude = filter.Value - avgStat;
            float power = 1.0f + (statMagnitude * (1 - coveredRatio)) / powerPerStatPt;

            return new FilterEvaluation
            {
                Power = power,
                MatchProbability = float.Lerp(minProb, 1.0f, coveredRatio)
            };
        }
    }

    private static float TargetWeight(Target target, TargetWeightMode mode, ref readonly BalanceEvalContext ctx)
    {
        const float maxNegativeImpact = -0.5f;

        var eval = EvaluateTarget(target, in ctx);
        var baseWeight = eval.AverageCardinality;

        float negativeWeight = 1;
        if (eval.AllyProbability is { } ap)
        {
            negativeWeight = mode switch
            {
                TargetWeightMode.AllyBenefit => float.Lerp(maxNegativeImpact, 1, ap),
                TargetWeightMode.EnemyBenefit => float.Lerp(1, maxNegativeImpact, ap),
                _ => 1
            };
        }

        return baseWeight * negativeWeight;
    }

    private static float FilterPowerWeight(ImmutableArray<Filter> filters, float probFalloffThresh,
        ref readonly BalanceEvalContext ctx)
    {
        const float intensity = 1.5f;

        float power = 1.0f;
        for (var i = 0; i < filters.Length; i++)
        {
            var filter = filters[i];
            var filterEval = EvaluateFilter(filter, in ctx);
            if (filterEval.MatchProbability < probFalloffThresh)
            {
                power *= filterEval.Power * (float)Math.Pow(filterEval.MatchProbability / probFalloffThresh, 3);
            }
            else
            {
                power *= filterEval.Power;
            }
        }

        if (power <= 1.0f)
        {
            return power;
        }
        else
        {
            return 1.0f + (power - 1.0f) * intensity;
        }
    }

    // Remember: Average credit (per turn action, per unique target) is 150
    private static int ActionCost(ref BalanceEvalContext ctx)
    {
        const int costMin = -170;

        var act = ctx.Action;
        float cost = act switch
        {
            HurtAction a => 35 * Math.Max(0, a.Damage) * TargetWeight(a.Target, TargetWeightMode.EnemyBenefit, in ctx),
            HealAction a => 25 * Math.Max(0, a.Damage) * TargetWeight(a.Target, TargetWeightMode.AllyBenefit, in ctx)
                * (a.Target is MeTarget ? 1.8f : 1.0f),
            AttackAction a => 20 * TargetWeight(a.Target, TargetWeightMode.EnemyBenefit, in ctx),
            DrawCardAction a => 30 * a.N * FilterPowerWeight(a.Filters, 0.15f, in ctx),
            CreateCardAction a => 40 * a.N * FilterPowerWeight(a.Filters, 0.15f, in ctx),
            DiscardCardAction a => 30 * a.N * FilterPowerWeight(a.Filters, 0.35f, in ctx) * (a.MyHand ? -0.75f : 1.0f),
            DeployAction a => 90 * FilterPowerWeight(a.Filters, 0.15f, in ctx),
            GrantAttackAction a => 150 * TargetWeight(a.Target, TargetWeightMode.Neutral, in ctx)
                                       * (a.Target is MeTarget ? 3.0f : 1.0f),
            ModifierAction a => Modifier(a, in ctx),
            SingleConditionalAction a => SingleCondition(a, ref ctx),
            MultiConditionalAction a => MultiCondition(a, ref ctx),
            RandomConditionalAction a => Math.Clamp(a.PercentChance * 0.01f, 0.1f, 1.0f)
                                         * ActionSequenceCost(a.Actions, ref ctx),
            _ => 0
        };
        return Math.Max(costMin, (int)Math.Round(cost));

        static float Modifier(ModifierAction a, ref readonly BalanceEvalContext ctx)
        {
            // Values considering permanent effects.
            const int atkBaseValue = 50;
            const int hpBaseValue = 44;
            const int costBaseValue = 40;

            TargetWeightMode wm = a.IsBuff ? TargetWeightMode.AllyBenefit : TargetWeightMode.EnemyBenefit;
            int baseVal = a.Attr switch
            {
                ScriptableAttribute.Attack => atkBaseValue,
                ScriptableAttribute.Health => hpBaseValue,
                ScriptableAttribute.Cost => costBaseValue,
                _ => 0
            };
            float frequencyWeight = a.Duration switch
            {
                0 => 0.8f, // Until I die
                -1 => 1, // Forever
                var x => Math.Min(0.75f, 0.45f + x * 0.15f) // X turns (x=1 -> 0.6)
            };

            return baseVal * a.Value * frequencyWeight * TargetWeight(a.Target, wm, in ctx);
        }

        static float SingleCondition(SingleConditionalAction a, ref BalanceEvalContext ctx)
        {
            // Avoid abuse in the post spawn event, there's no interesting conditions to do here!
            if (ctx.Event is PostSpawnEvent)
            {
                return ActionSequenceCost(a.Actions, ref ctx);
            }

            var target = a.Target;

            // Simplify the target to "me" if we know that the source or target is the unit.
            // This helps avoid abuse
            if (a.Target == ConditionalTarget.Source && SourceOrTargetIsMe(ctx.Event, true)
                || a.Target == ConditionalTarget.Target && SourceOrTargetIsMe(ctx.Event, false))
            {
                target = ConditionalTarget.Me;
            }

            var weight = target switch
            {
                ConditionalTarget.Me => BranchTakenProbability(a,
                    static x => x is AttrFilter { Attr: not ScriptableAttribute.Cost } or
                        WoundedFilter, in ctx),
                ConditionalTarget.Source or ConditionalTarget.Target => BranchTakenProbability(a, static _ => true,
                    in ctx),
                _ => 1.0f
            };
            return weight * ActionSequenceCost(a.Actions, ref ctx);

            static float BranchTakenProbability(SingleConditionalAction a,
                Func<Filter, bool> filterFilter, // 10/10 variable name
                ref readonly BalanceEvalContext ctx)
            {
                float w = 1.0f;
                foreach (var cond in a.Conditions)
                {
                    // Special case to avoid abuse in obvious non-applicable cases.
                    if (ctx.Event is PostUnitHurtEvent or PostUnitAttackEvent or PostUnitKillEvent
                        && cond is WoundedFilter)
                    {
                        continue;
                    }

                    if (filterFilter(cond))
                    {
                        w *= EvaluateFilter(cond, in ctx).MatchProbability;
                    }
                }

                return w;
            }
        }

        static float MultiCondition(MultiConditionalAction a, ref BalanceEvalContext ctx)
        {
            const float missingUnitMargin = 2;

            if (a.Conditions.Length == 0)
            {
                return ActionSequenceCost(a.Actions, ref ctx);
            }

            var query = EvaluateTarget(new QueryTarget(EntityType.Unit, a.Team, a.Conditions, 0), in ctx);
            var avgMissingUnits = missingUnitMargin + a.MinUnits - query.AverageCardinality;
            var weight = Math.Clamp(1.1f - 0.27f * avgMissingUnits, 0.1f, 1.0f);

            return weight * ActionSequenceCost(a.Actions, ref ctx);
        }
    }

    private static int ActionSequenceCost(ImmutableArray<CardAction> actions, ref BalanceEvalContext ctx)
    {
        CardAction parent = ctx.Action;
        int sum = 0;
        foreach (var action in actions)
        {
            ctx.Action = action;
            sum += ActionCost(ref ctx);
        }

        ctx.Action = parent;
        return sum;
    }

    private static int StatCost(BalanceStat stat, int value, int cardCost)
    {
        // cost per point. Gets bigger and bigger as we approach the card cost, and grows higher even further.
        var baseCost = stat switch
        {
            BalanceStat.Attack => 9,
            BalanceStat.Health => 8,
            _ => 0
        };

        int sum = 0;
        for (int i = 1; i <= value; i++)
        {
            var mult = Math.Max(1, 4 + Math.Abs(i - cardCost) * (i - cardCost));
            sum += baseCost * mult;
        }

        return sum;
    }

    private static float TeamProb(GameTeam t) => t switch
    {
        GameTeam.Ally or GameTeam.Self => 1,
        GameTeam.Enemy => 0,
        GameTeam.Any => 0.5f,
        _ => 0
    };

    private static bool SourceOrTargetIsMe(CardEvent ev, bool source)
    {
        return ev switch
        {
            PostUnitHurtEvent (var team, var dealt) => team == GameTeam.Self && (dealt && source || !dealt && !source),
            PostUnitHealEvent (var team, var dealt) => team == GameTeam.Self && (dealt && source || !dealt && !source),
            PostUnitAttackEvent (var team, var dealt) =>
                team == GameTeam.Self && (dealt && source || !dealt && !source),
            PostUnitEliminatedEvent (var team) => team == GameTeam.Self && source,
            _ => false
        };
    }

    private static int AllocatedStatCredits(int cost)
    {
        return StatCost(BalanceStat.Attack, cost, cost)
               + StatCost(BalanceStat.Health, cost, cost);
    }

    private static int AllocatedScriptCredits(int cost)
    {
        // a+bn+cn(n-1)
        // a= 50
        // b=2
        // c=2
        return 50 + 2 * cost + 2 * cost * (cost - 1);
    }

    private enum BalanceStat
    {
        Attack,
        Health
    }

    private enum TargetWeightMode
    {
        AllyBenefit,
        EnemyBenefit,
        Neutral
    }

    private struct TargetEvaluation()
    {
        public float Power = 0.0f;
        public required float AverageCardinality;
        public required float? AllyProbability;
        public float? EnemyProbability => AllyProbability is { } f ? 1 - f : null;
    }

    private struct FilterEvaluation()
    {
        // 0.0f: Weak units (stats near 0|0)
        // 1.0f: Neutral (stats near 5|5)
        // 2.0f: Strong units (2x power of a neutral unit, 10|10)
        public float Power = 1.0f;
        public required float MatchProbability;
        public int EnforcedMaxCardinality = -1;
        public GameTeam EnforcedTeam = GameTeam.Any;
    }

    private struct BalanceEvalContext(CardEvent ev, CardAction ac)
    {
        public CardEvent Event = ev;
        public CardAction Action = ac;
    }
}