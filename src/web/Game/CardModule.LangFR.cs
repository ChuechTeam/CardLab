using System.Collections.Immutable;
using System.Text;
using static CardLab.Game.CardModule.LangFR.LangFlags;

namespace CardLab.Game;

public static partial class CardModule
{
    public static class LangFR
    {
        public static string GenerateCardDescription(CardDefinition def,
            Dictionary<string, string>? archetypeMap = null)
        {
            var desc = new StringBuilder();

            var script = def.Script;
            if (script is not null)
            {
                foreach (var handler in script.Handlers)
                {
                    NodeContext ctx = new(handler.Event)
                    {
                        ArchetypeMap = archetypeMap
                    };

                    desc.Append(SentenceStart(handler.Event));
                    for (var i = 0; i < handler.Actions.Length; i++)
                    {
                        var act = handler.Actions[i];
                        desc.Append(ActionInSentence(act, ref ctx));

                        // Peak programming right there
                        var dist = handler.Actions.Length - (i + 1);

                        var next = handler.Actions.ElementAtOrDefault(i + 1);
                        var nextCond = next is SingleConditionalAction or MultiConditionalAction;
                        var conditionalSwitch = nextCond || (act is SingleConditionalAction or MultiConditionalAction);
                        var connector = (dist, conditionalSwitch) switch
                        {
                            (0, _) => ".",
                            (> 0, true) => " ; ",
                            (1, _) => handler.Actions.Length switch
                            {
                                > 2 => ", ensuite, ",
                                _ => " et ",
                            },
                            _ => ", "
                        };

                        desc.Append(connector);
                    }

                    if (handler != script.Handlers.Last())
                    {
                        desc.AppendLine();
                    }
                }
            }

            return desc.ToString();
        }

        private static void BuildSentence(StringBuilder builder, string token, int i, int numTokens,
            bool finishSentence = true)
        {
            builder.Append(token);

            // Peak programming right there
            var remaining = numTokens - (i + 1);

            var connector = remaining switch
            {
                0 => finishSentence ? "." : "",
                1 => numTokens switch
                {
                    > 2 => ", ensuite, ",
                    _ => " et "
                },
                _ => ", "
            };
            builder.Append(connector);
        }

        private static string SentenceStart(CardEvent ev)
        {
            return ev switch
            {
                PostSpawnEvent => "À l'apparition, ",
                PostUnitEliminatedEvent e => e.Team switch
                {
                    GameTeam.Self => "Quand je suis éliminé, ",
                    _ => $"Quand {QualifiedUnitArtInd(e.Team, false, out var f)} est " +
                         $"{(f.HasFlag(Feminine) ? "éliminée" : "éliminé")}, "
                },
                PostUnitKillEvent => "Quand j'élimine une unité, ",
                PostUnitHealEvent e
                    => e.Team switch
                    {
                        GameTeam.Self => e.Dealt ? "Quand je soigne une unité, " : "Quand on me soigne, ",
                        _ => $"Quand {QualifiedUnitArtInd(e.Team, false, out var f)}".TrimEnd()
                             + (e.Dealt ? " soigne une autre unité, " : $" est {RegularNoun("soigné", f)}, ")
                    },
                PostUnitAttackEvent e
                    => e.Team switch
                    {
                        GameTeam.Self => e.Dealt ? "Quand j'attaque, " : "Quand on m'attaque, ",
                        _ => $"Quand {QualifiedUnitArtInd(e.Team, false, out var f)} ".TrimEnd()
                             + (e.Dealt ? " attaque, " : f.HasFlag(Feminine) ? " est attaquée, " : " est attaqué, ")
                    },
                PostUnitHurtEvent e
                    => e.Team switch
                    {
                        GameTeam.Self => e.Dealt ? "Quand j'inflige des dégâts, " : "Quand je subis des dégâts, ",
                        _ => $"Quand {QualifiedUnitArtInd(e.Team, false, out _)}".TrimEnd()
                             + (e.Dealt ? " inflige des dégâts, " : " subit des dégâts, "),
                    },
                PostUnitNthAttackEvent e => $"Après avoir attaqué {e.N} fois, ",
                PostNthCardPlayEvent e => $"Quand vous jouez votre {e.N}e carte du tour, ",
                PostCardMoveEvent e => e.Kind switch
                {
                    CardMoveKind.Played => "Quand vous jouez une carte, ",
                    CardMoveKind.Discarded => "Quand vous défaussez, ",
                    CardMoveKind.Drawn => "Quand vous piochez, ",
                    _ => "Lorsque ?",
                },
                PostTurnEvent e => e.Team switch
                {
                    GameTeam.Self or GameTeam.Ally => "Quand votre tour commence, ",
                    GameTeam.Enemy => "Quand le tour de l'ennemi commence, ",
                    _ => "À chaque changement de tour, "
                },
                _ => "Quand on ne sait quoi se produit, "
            };
        }

        private static string ActionInSentence(CardAction act, ref NodeContext ctx)
        {
            static string ModifierStr(ModifierAction m, ref readonly NodeContext ctx)
            {
                bool add = m.IsBuff;
                if (m.Attr == ScriptableAttribute.Cost)
                {
                    add = !add;
                }

                var duration = m.Duration switch
                {
                    <= -1 => "",
                    0 => " tant que je suis en vie",
                    1 => " pendant ce tour",
                    _ => $" pendant {m.Duration} tours"
                };
                var attrName = AttributeNameShort(m.Attr);
                var value = m.Value;
                if (m.Target is MeTarget)
                {
                    var verb = add ? "je gagne" : "je perds";
                    return $"{verb} {value} {attrName}{duration}";
                }
                else
                {
                    var sign = add ? "+" : "\u2212";
                    return
                        $"{sign}{value} {attrName} {TargetNamePrepA(m.Target, in ctx, out _)}{duration}";
                }
            }

            static string ConditionStr(SingleConditionalAction c, ref NodeContext ctx)
            {
                if (c.Conditions.Length == 0)
                {
                    return "";
                }

                LangFlags targetFlags = None;
                var targetName = c.Target switch
                {
                    ConditionalTarget.Me => "je",
                    ConditionalTarget.Source => TargetNameDefinite(new SourceTarget(), in ctx, out targetFlags),
                    ConditionalTarget.Target => TargetNameDefinite(new TargetTarget(), in ctx, out targetFlags),
                    _ => "",
                };

                var n = c.Actions.Length;
                var builder = new StringBuilder($"si {FilterCondition(targetName, targetFlags, c.Conditions, in ctx)}, ");
                ctx.Condition = c;
                for (int i = 0; i < n; i++)
                {
                    BuildSentence(builder, ActionInSentence(c.Actions[i], ref ctx), i, n, false);
                }

                ctx.Condition = null;

                return builder.ToString();
            }

            static string ConditionMultiStr(MultiConditionalAction c, ref NodeContext ctx)
            {
                if (c.Conditions.Length == 0)
                {
                    return "";
                }

                var p = c.MinUnits > 1;
                var n = c.Actions.Length;
                var noun = FilterizeNoun(QualifiedUnit(c.Team, p, out var flags), flags, c.Conditions, in ctx);
                var builder = new StringBuilder($"s'il y a au moins {c.MinUnits} {noun}, ");
                ctx.Condition = c;
                for (int i = 0; i < n; i++)
                {
                    BuildSentence(builder, ActionInSentence(c.Actions[i], ref ctx), i, n, false);
                }

                ctx.Condition = null;

                return builder.ToString();
            }

            return act switch
            {
                DrawCardAction draw => draw.N switch
                {
                    > 1 => $"vous piochez {draw.N} {FilterizeNoun("cartes", Plural | Feminine, draw.Filters, in ctx)}",
                    _ => $"vous piochez une {FilterizeNoun("carte", Feminine, draw.Filters, in ctx)}"
                },
                DiscardCardAction d => d.MyHand switch
                {
                    true => d.N switch
                    {
                        > 1 => $"vous défaussez {d.N} {FilterizeNoun("cartes", Plural | Feminine, d.Filters, in ctx)}",
                        _ => $"vous défaussez une {FilterizeNoun("carte", Feminine, d.Filters, in ctx)}"
                    },
                    false => d.N switch
                    {
                        > 1 => $"l'ennemi défausse {d.N} {FilterizeNoun("cartes", Plural | Feminine, d.Filters, in ctx)}",
                        _ => $"l'ennemi défausse une {FilterizeNoun("carte", Feminine, d.Filters, in ctx)}"
                    }
                },
                ModifierAction m => ModifierStr(m, in ctx),
                HurtAction h => h.Damage switch
                {
                    > 1 => $"inflige {h.Damage} dégâts {TargetNamePrepA(h.Target, in ctx, out _)}",
                    _ => $"inflige 1 dégât {TargetNamePrepA(h.Target, in ctx, out _)}"
                },
                HealAction h => h.Damage switch
                {
                    > 1 => $"soigne {h.Damage} PV {TargetNamePrepA(h.Target, in ctx, out _)}",
                    _ => $"soigne 1 PV {TargetNamePrepA(h.Target, in ctx, out _)}"
                },
                AttackAction a => $"j'attaque {TargetNameDefinite(a.Target, in ctx, out _)}",
                DeployAction d => $"déploie aléatoirement une {FilterizeNoun("unité", Feminine, d.Filters, in ctx)} "
                + d.Direction switch
                {
                    UnitDirection.Right => "à ma droite",
                    UnitDirection.Left => "à ma gauche",
                    UnitDirection.Up => "devant moi",
                    UnitDirection.Down => "derrière moi",
                    _ => "?"
                },
                SingleConditionalAction c => ConditionStr(c, ref ctx),
                MultiConditionalAction c => ConditionMultiStr(c, ref ctx),
                _ => "faire qqch"
            };
        }

        private static string FilterizeNoun(string noun, LangFlags flags, ImmutableArray<Filter> filters,
            ref readonly NodeContext ctx)
        {
            return FilterExpression(noun, false, flags, filters, in ctx);
        }

        private static string FilterCondition(string pronounOrNoun, LangFlags flags, ImmutableArray<Filter> filters, 
            ref readonly NodeContext ctx)
        {
            return FilterExpression(pronounOrNoun, true, flags, filters, in ctx);
        }

        private static string FilterExpression(string token, bool verbMode, LangFlags flags,
            ImmutableArray<Filter> filters, ref readonly NodeContext ctx)
        {
            if (filters.Length == 0)
            {
                return token;
            }

            var sorted = filters.Sort((a, b) => Position(a) - Position(b));
            var builder = new StringBuilder(token);
            bool firstPerson = verbMode && token == "je";
            bool noSpace = false;
            var plural = flags.HasFlag(Plural);

            if (verbMode)
            {
                var alreadyHasVerb = sorted[0] is AttrFilter
                {
                    Attr: ScriptableAttribute.Health or ScriptableAttribute.Attack
                };
                if (alreadyHasVerb && firstPerson)
                {
                    // Elision
                    builder.Clear();
                    builder.Append("j'");
                    noSpace = true;
                }
                else if (!alreadyHasVerb)
                {
                    builder.Append(firstPerson ? " suis" : plural ? " sont" : " est");
                }
            }

            string avec = !verbMode ? "avec" : (firstPerson ? "ai" : (plural ? "ont" : "a"));

            for (var i = 0; i < sorted.Length; i++)
            {
                var filter = sorted[i];

                if (!noSpace) builder.Append(' ');
                builder.Append(filter switch
                {
                    CardTypeFilter f => $"de type {CardTypeName(f.Kind)}",
                    ArchetypeFilter f => Archetype(f, in ctx),
                    AdjacentFilter => RegularNoun("adjacent", flags),
                    WoundedFilter => RegularNoun("blessé", flags),
                    AttrFilter f =>
                        (f.Attr, f.Op) switch
                        {
                            (ScriptableAttribute.Cost, FilterOp.Equal) => $"de coût {f.Value}",
                            (ScriptableAttribute.Cost, FilterOp.Lower) => $"de coût {f.Value} ou moins",
                            (ScriptableAttribute.Cost, FilterOp.Greater) => $"de coût {f.Value} ou plus",
                            (ScriptableAttribute.Health, FilterOp.Equal) => $"{avec} exactement {f.Value} PV",
                            (ScriptableAttribute.Health, FilterOp.Lower) => $"{avec} moins de {f.Value} PV",
                            (ScriptableAttribute.Health, FilterOp.Greater) => $"{avec} plus de {f.Value} PV",
                            (ScriptableAttribute.Attack, FilterOp.Equal) => $"{avec} exactement {f.Value} ATQ",
                            (ScriptableAttribute.Attack, FilterOp.Lower) => $"{avec} moins de {f.Value} ATQ",
                            (ScriptableAttribute.Attack, FilterOp.Greater) => $"{avec} plus de {f.Value} ATQ",
                            _ => $"avec {f.Attr} {FilterOpSymbol(f.Op)} {f.Value}",
                        },
                    _ => "particulier"
                });

                if (i != sorted.Length - 1
                    && filter is not (AdjacentFilter or WoundedFilter or ArchetypeFilter))
                {
                    builder.Append(" et");
                }

                noSpace = false;
            }

            return builder.ToString();

            static int Position(Filter filter)
            {
                return filter switch
                {
                    ArchetypeFilter => -3,
                    WoundedFilter => -2,
                    AdjacentFilter => -1,
                    _ => 0
                };
            }

            static string Archetype(ArchetypeFilter f, ref readonly NodeContext ctx)
            {
                string canonical = f.Archetype;
                if (ctx.ArchetypeMap is not null)
                {
                    ctx.ArchetypeMap.TryGetValue(f.NormalizedArchetype, out var replacement);
                    if (replacement is not null)
                    {
                        canonical = replacement;
                    }
                }
                return canonical;
            }
        }

        private static string TargetName(Target target, ref readonly NodeContext ctx, out LangFlags flags)
        {
            static (string, LangFlags) QueryStr(QueryTarget q, ref readonly NodeContext ctx)
            {
                LangFlags prepFlags;
                const string rand = " (au hasard)";
                string FN(string s, LangFlags f, ref readonly NodeContext ctx) => FilterizeNoun(s.TrimEnd(), f, q.Filters, in ctx);
                string expression;
                if (q is { Team: GameTeam.Any, Filters: [], N: <= 0 })
                {
                    (expression, prepFlags) = q.Kind switch
                    {
                        EntityType.Unit => (FN("toutes les unités", Feminine | Plural, in ctx), Plural | Indefinite),
                        EntityType.Card => ($"{FN("cartes", Feminine | Plural, in ctx)} des deux joueurs", Plural | Feminine),
                        _ => ("qqch", None)
                    };
                }
                else
                {
                    (expression, prepFlags) = (q.Kind, q.N) switch
                    {
                        (EntityType.Unit, <= 0)
                            => (FN(QualifiedUnit(q.Team, true, out var f), f, in ctx), f),
                        (EntityType.Unit, 1)
                            => (FN($"{QualifiedUnitArtInd(q.Team, false, out var f)}", f, in ctx) + rand, Indefinite),
                        (EntityType.Unit, > 1)
                            => (FN($"{q.N} {QualifiedUnit(q.Team, true, out var f)}", f, in ctx) + rand, Indefinite),
                        (EntityType.Card, <= 0)
                            => ($"{FN("cartes", Feminine | Plural, in ctx)} {HandTeam(q.Team)}", Plural | Feminine),
                        (EntityType.Card, 1)
                            => ($"une {FN("carte", Feminine, in ctx)} {HandTeam(q.Team)}" + rand, Indefinite),
                        (EntityType.Card, > 1)
                            => ($"{q.N} {FN("cartes", Feminine | Plural, in ctx)} {HandTeam(q.Team)}" + rand, Indefinite),
                        _ => ("qqch", None)
                    };
                }

                return (expression, prepFlags);
            }

            string n;
            (n, flags) = target switch
            {
                MeTarget => ("moi-même", Indefinite),
                CoreTarget t => t.Enemy switch
                {
                    true => ("noyau ennemi", None),
                    false => ("mon noyau", Indefinite),
                },
                SourceTarget => ctx.RootEvent switch
                {
                    PostUnitAttackEvent or PostUnitHurtEvent or PostUnitEliminatedEvent or PostUnitKillEvent
                        => ("attaquant", Elision),
                    PostUnitHealEvent => ("soigneur", None),
                    _ => ("initiateur", Elision)
                },
                TargetTarget => ctx.RootEvent switch
                {
                    PostUnitAttackEvent or PostUnitHurtEvent or PostUnitEliminatedEvent or PostUnitKillEvent
                        => ("victime", Feminine),
                    PostUnitHealEvent => ("soigné", None),
                    PostCardMoveEvent => ("carte", Feminine),
                    _ => ("cible", Feminine)
                },
                NearbyAllyTarget t => t.Direction switch
                {
                    UnitDirection.Left => ("allié à ma gauche", Feminine | Elision),
                    UnitDirection.Right => ("allié à ma droite", Feminine | Elision),
                    UnitDirection.Up => ("allié devant moi", Feminine | Elision),
                    UnitDirection.Down => ("allié derrière moi", Feminine | Elision),
                    _ => ("allié quelque part", Feminine | Elision),
                },
                QueryTarget q => QueryStr(q, in ctx),
                _ => ("à je sais pas qui", None)
            };

            return n;
        }

        private static string TargetNamePrepDe(Target target, ref readonly NodeContext ctx, out LangFlags flags)
        {
            string n = TargetName(target, in ctx, out flags);
            return SpecPrepDe(n, flags);
        }

        private static string TargetNamePrepA(Target target, ref readonly NodeContext ctx, out LangFlags flags)
        {
            string n = TargetName(target, in ctx, out flags);
            return SpecPrepA(n, flags);
        }

        private static string TargetNameDefinite(Target target, ref readonly NodeContext ctx, out LangFlags flags)
        {
            string n = TargetName(target, in ctx, out flags);
            return SpecArticleDefinite(n, flags);
        }

        private static string CardTypeName(CardType kind)
        {
            return kind switch
            {
                CardType.Unit => "Unité",
                CardType.Spell => "Sort",
                _ => ""
            };
        }

        private static string FilterOpSymbol(FilterOp op)
        {
            return op switch
            {
                FilterOp.Greater => ">",
                FilterOp.Lower => "<",
                FilterOp.Equal => "=",
                _ => "?"
            };
        }

        private static string AttributeNameShort(ScriptableAttribute attr)
        {
            return attr switch
            {
                ScriptableAttribute.Attack => "ATQ",
                ScriptableAttribute.Cost => "coût en énergie",
                ScriptableAttribute.Health => "PV",
                _ => "?"
            };
        }

        private static string QualifiedUnit(GameTeam team, bool plural, out LangFlags flags)
        {
            string ret;
            LangFlags baseFlags = plural ? Plural : None;
            (ret, var bonusFlags) = team switch
            {
                GameTeam.Self => ("moi", None),
                GameTeam.Enemy => (plural ? "ennemis" : "ennemi", Elision),
                GameTeam.Ally => (plural ? "alliés" : "allié", Elision),
                GameTeam.Any => (plural ? "unités" : "unité", Elision | Feminine),
                _ => ("?", None)
            };
            flags = baseFlags | bonusFlags;
            return ret;
        }

        private static string QualifiedUnitArtInd(GameTeam team, bool plural, out LangFlags f)
        {
            return SpecArticleIndefinite(QualifiedUnit(team, plural, out f), f);
        }

        private static string HandTeam(GameTeam team)
        {
            return team switch
            {
                GameTeam.Enemy => "dans la main ennemie",
                GameTeam.Ally => "dans votre main",
                GameTeam.Any => "des deux joueurs",
                _ => "?"
            };
        }

        private static string SpecPrepDe(string expression, LangFlags flags)
        {
            if (flags.HasFlag(Indefinite))
            {
                return "de";
            }

            bool plural = flags.HasFlag(Plural);
            bool feminine = flags.HasFlag(Feminine);
            bool elision = flags.HasFlag(Elision);

            return (plural, feminine, elision) switch
            {
                (false, false, _) => $"du {expression}",
                (false, true, false) => $"de la {expression}",
                (false, true, true) => $"de l'{expression}",
                (true, _, _) => $"des {expression}"
            };
        }

        private static string SpecPrepA(string expression, LangFlags flags)
        {
            if (flags.HasFlag(Indefinite))
            {
                return $"à {expression}";
            }

            bool plural = flags.HasFlag(Plural);
            bool feminine = flags.HasFlag(Feminine);
            bool elision = flags.HasFlag(Elision);

            return (plural, feminine, elision) switch
            {
                (false, false, _) => $"au {expression}",
                (false, true, false) => $"à la {expression}",
                (false, true, true) => $"à l'{expression}",
                (true, _, _) => $"aux {expression}"
            };
        }

        private static string SpecArticleDefinite(string expression, LangFlags flags)
        {
            if (flags.HasFlag(Indefinite))
            {
                return expression;
            }

            bool plural = flags.HasFlag(Plural);
            bool feminine = flags.HasFlag(Feminine);
            bool elision = flags.HasFlag(Elision);

            return (plural, feminine, elision) switch
            {
                (false, _, true) => $"l'{expression}",
                (true, _, _) => $"les {expression}",
                (false, true, false) => $"la {expression}",
                (false, false, false) => $"le {expression}"
            };
        }

        private static string SpecArticleIndefinite(string expression, LangFlags flags)
        {
            if (flags.HasFlag(Indefinite))
            {
                return expression;
            }

            bool plural = flags.HasFlag(Plural);
            bool feminine = flags.HasFlag(Feminine);

            return (plural, feminine) switch
            {
                (true, _) => $"des {expression}",
                (false, true) => $"une {expression}",
                (false, false) => $"un {expression}"
            };
        }

        public static string EventName(CardEvent ev)
        {
            return ev.ToString();
        }

        public static string ActionName(CardAction act)
        {
            return act.ToString();
        }

        public static string RegularNoun(string noun, LangFlags flags)
        {
            return (flags & (Plural | Feminine))switch
            {
                None => noun,
                Plural => $"{noun}s",
                Feminine => $"{noun}e",
                Plural | Feminine => $"{noun}es",
                _ => "?"
            };
        }

        private ref struct NodeContext(CardEvent ev)
        {
            public readonly CardEvent RootEvent = ev;
            public Dictionary<string, string>? ArchetypeMap = null;
            public CardAction? Condition = null;
        }

        [Flags]
        public enum LangFlags : byte
        {
            None = 0,

            // Singular: first bit off
            Plural = 1,

            // Masculine: second bit off
            Feminine = 2,

            // i.e. not a noun, something uncountable
            Indefinite = 4,

            // la -> l' (vowel)
            Elision = 8
        }
    }
}