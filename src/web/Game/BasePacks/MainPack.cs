using System.Collections.Immutable;
using CardLab.Game.AssetPacking;
using CardLab.Game.BasePacks;
using CardLab.Game.Duels;
using CardLab.Game.Duels.Scripting;

namespace CardLab.Game.BasePacks;

public static class MainPack
{
    public const int PackVersion = 1;

    public const string Name = "Main Pack";

    public static readonly Guid PackId = new("CA28E343-F4AF-49A8-AAB0-8EE764C54CA3");

    public const int TutorialCard1Id = 1;
    public const int TutorialCard2Id = 100;
    public const int TutorialCard3Id = 2;
    public const int TutorialCard4Id = 3;
    public const int TutorialCard5Id = 4;

    private static Scripts? _scripts = null;

    public static Scripts InitScripts()
    {
        if (_scripts is null)
            _scripts = new Scripts();
        return _scripts;
    }
        
    public static (CardDefinition def, uint id, string? img)[] GetCards(string assetsDir)
    {
        _scripts = InitScripts();
        return
        [
            (new CardDefinition
            {
                Name = "Soldat paumé",
                Description = "",
                Attack = 2,
                Health = 1,
                Cost = 1,
            }, TutorialCard1Id, Path.Combine(assetsDir, "Main/soldat.png")),
            (new CardDefinition
            {
                Name = "Être volant non identifié",
                Description = "À l'apparition, vous piochez un sort aléatoire de coût 3 ou moins",
                Attack = 2,
                Health = 2,
                Cost = 2,
                Script = new CardScript
                {
                    Handlers =
                    [
                        new CardEventHandler
                        {
                            Event = new PostSpawnEvent(),
                            Actions =
                            [
                                new DrawCardAction(1,
                                [
                                    new CardTypeFilter(CardType.Spell),
                                    new AttrFilter(ScriptableAttribute.Cost, FilterOp.Lower, 3)
                                ])
                            ]
                        }
                    ]
                }
            }, TutorialCard2Id, Path.Combine(assetsDir, "Main/evni.png")),
            (new CardDefinition
            {
                Name = "Cube infernal",
                Archetype = "3Démoniaque",
                NormalizedArchetype = "3demoniaque",
                Description = "Déploie une pyramide infernale devant moi (ou derrière moi).",
                Attack = 1,
                Health = 4,
                Cost = 3,
                Script = new CardScript { SpecialId = _scripts.CubeInfernal }
            }, TutorialCard3Id, Path.Combine(assetsDir, "Main/3demoniaque-cube.png")),
            (new CardDefinition
            {
                Name = "Cylindre infernal",
                Archetype = "3Démoniaque",
                NormalizedArchetype = "3demoniaque",
                Description = "Quand un allié 3Démoniaque attaque, inflige 1 dégât à un ennemi au hasard.",
                Attack = 2,
                Health = 2,
                Cost = 4,
                Script = new CardScript
                {
                    Handlers =
                    [
                        new CardEventHandler
                        {
                            Event = new PostUnitAttackEvent(GameTeam.Ally, true),
                            Actions =
                            [
                                new SingleConditionalAction(ConditionalTarget.Source,
                                    [new ArchetypeFilter("3demoniaque")], [
                                        new HurtAction(1, new QueryTarget(EntityType.Unit, GameTeam.Enemy, [], 1))
                                    ])
                            ]
                        }
                    ]
                }
            }, TutorialCard4Id, Path.Combine(assetsDir, "Main/3demoniaque-cyl.png")),
            (new CardDefinition
            {
                Name = "Pyramide infernale",
                Archetype = "3Démoniaque",
                NormalizedArchetype = "3demoniaque",
                Description = "Lorsque je suis éliminé, +1 ATQ aux alliés 3Démoniaque.",
                Attack = 4,
                Health = 2,
                Cost = 5,
                Script = new CardScript { SpecialId = _scripts.PyramideInfernale }
            }, TutorialCard5Id, Path.Combine(assetsDir, "Main/3demoniaque-tri.png")),
            (new CardDefinition
            {
                Name = "Annihiliation",
                Description = "Tue TOUTES les unités.",
                Cost = 7,
                Requirement = CardRequirement.None,
                Type = CardType.Spell,
                Script = new CardScript { SpecialId = _scripts.Annihiliation }
            }, 5, null),
            (new CardDefinition
            {
                Name = "Casse du siècle",
                Description =
                    "Vole une carte de la main adverse. Si c’est une unité, double son attaque et réduit de moitié ses PV.",
                Cost = 6,
                Requirement = CardRequirement.SingleEntity,
                Type = CardType.Spell,
                Script = new CardScript { SpecialId = _scripts.CasseDuSiecle }
            }, 6, Path.Combine(assetsDir, "Main/casse.png")),
            (new CardDefinition
            {
                Name = "Sacrifice occulte",
                Description =
                    "Élimine une unité alliée. Déploie aléatoirement deux unités du même archétype. (Uniquement possible si l’unité a un archétype.)",
                Cost = 4,
                Requirement = CardRequirement.SingleEntity,
                Type = CardType.Spell,
                Script = new CardScript { SpecialId = _scripts.SacrificeOcculte }
            }, 7, Path.Combine(assetsDir, "Main/sacrifice.png")),
            (new CardDefinition
            {
                Name = "Épée démoniaque",
                Description = "Donne +2 ATQ à toutes vos unités.",
                Cost = 3,
                Requirement = CardRequirement.None,
                Type = CardType.Spell,
                Script = new CardScript { SpecialId = _scripts.EpeeDemoniaque }
            }, 8, Path.Combine(assetsDir, "Main/epee-demoniaque.png")),
            (new CardDefinition
            {
                Name = "Pichenette",
                Description = "Inflige 2 dégâts à un ennemi.",
                Cost = 1,
                Requirement = CardRequirement.SingleEntity,
                Type = CardType.Spell,
                Script = new CardScript { SpecialId = _scripts.Pichenette }
            }, 101, Path.Combine(assetsDir, "Main/pichenette.png")),
            (new CardDefinition
            {
                Name = "Boîte de Pandore",
                Description = "Vous piochez 3 cartes. Défausse 1 carte au hasard.",
                Cost = 4,
                Requirement = CardRequirement.None,
                Type = CardType.Spell,
                Script = new CardScript { SpecialId = _scripts.RecyclageAstucieux }
            }, 9, null),
            (new CardDefinition
            {
                Name = "Contrôle mental",
                Description =
                    "-1 ATQ à un ennemi pendant ce tour ; ensuite, elle attaque un autre ennemi au hasard.",
                Cost = 4,
                Requirement = CardRequirement.SingleEntity,
                Type = CardType.Spell,
                Script = new CardScript { SpecialId = _scripts.ControleMental }
            }, 10, null),
            (new CardDefinition
            {
                Name = "Soif de carnage",
                Description =
                    "Pour chaque unité ennemie présente sur le terrain, donne +1 ATQ et +1 PV à l’allié choisi.",
                Cost = 4,
                Requirement = CardRequirement.SingleEntity,
                Type = CardType.Spell,
                Script = new CardScript { SpecialId = _scripts.SoifDeCarnage }
            }, 11, Path.Combine(assetsDir, "Main/soif.png")),
            (new CardDefinition
            {
                Name = "Petit tour au fourneau",
                Description = "Défausse deux cartes unité de votre main." +
                              " Après deux de vos tours, elles reviennent dans votre main avec +3 ATQ et +3 PV.",
                Cost = 3,
                Requirement = CardRequirement.None,
                Type = CardType.Spell,
                Script = new CardScript { SpecialId = _scripts.PetitTourAuFourneau }
            }, 12, Path.Combine(assetsDir, "Main/fourneau.png")),
            (new CardDefinition
            {
                Name = "Missile téléguidé",
                Description = "Inflige 5 dégâts à un ennemi.",
                Cost = 3,
                Requirement = CardRequirement.SingleEntity,
                Type = CardType.Spell,
                Script = new CardScript { SpecialId = _scripts.MissileTeleguide }
            }, 13, null),
            (new CardDefinition
            {
                Name = "Pacte du diable",
                Description = "Chaque joueur défausse une carte.",
                Cost = 2,
                Requirement = CardRequirement.None,
                Type = CardType.Spell,
                Script = new CardScript { SpecialId = _scripts.PacteDuDiable }
            }, 14, Path.Combine(assetsDir, "Main/pacte.png")),
            (new CardDefinition
            {
                Name = "Réparation express",
                Description = "Soigne 3 PV à un allié et à ses alliés adjacents.",
                Cost = 2,
                Requirement = CardRequirement.SingleEntity,
                Type = CardType.Spell,
                Script = new CardScript { SpecialId = _scripts.ReparationExpress }
            }, 15, Path.Combine(assetsDir, "Main/reparation.png")),
            (new CardDefinition
            {
                Name = "Réaction en chaîne",
                Description =
                    "Inflige 2 dégâts à un ennemi aléatoire. Recommence avec 1 dégât en plus tant que l’ennemi dernièrement touché est éliminé",
                Cost = 3,
                Requirement = CardRequirement.None,
                Type = CardType.Spell,
                Script = new CardScript { SpecialId = _scripts.ReactionEnChaine }
            }, 16, null),
            (new CardDefinition
            {
                Name = "Plagiat",
                Description = "Choisissez une unité ennemie. Vous recevez une copie dans votre main, avec +1 ATQ.",
                Cost = 3,
                Requirement = CardRequirement.SingleEntity,
                Type = CardType.Spell,
                Script = new CardScript { SpecialId = _scripts.Plagiat }
            }, 17, Path.Combine(assetsDir, "Main/plagiat.png")),
            (new CardDefinition
            {
                Name = "Justice un peu agressive",
                Description = "Détruit l’unité ennemie avec le plus d’ATQ",
                Cost = 4,
                Requirement = CardRequirement.None,
                Type = CardType.Spell,
                Script = new CardScript { SpecialId = _scripts.JusticeUnPeuAgressive }
            }, 18, null),
            (new CardDefinition
            {
                Name = "Assaut apaisant",
                Description = "Inflige 3 dégâts à un ennemi choisi. Le surplus de dégâts soigne votre noyau.",
                Cost = 2,
                Requirement = CardRequirement.SingleEntity,
                Type = CardType.Spell,
                Script = new CardScript { SpecialId = _scripts.AssautApaisant }
            }, 19, null),
            (new CardDefinition
            {
                Name = "Roque",
                Description = "Inverse l’ATQ et les PV d’une unité choisie",
                Cost = 4,
                Requirement = CardRequirement.SingleEntity,
                Type = CardType.Spell,
                Script = new CardScript { SpecialId = _scripts.Roque }
            }, 20, null),
            (new CardDefinition
            {
                Name = "Chaos ultime",
                Description = "Ce tour-ci, donne 1 assaut supplémentaire à TOUTES vos unités alliées",
                Cost = 10,
                Requirement = CardRequirement.None,
                Type = CardType.Spell,
                Script = new CardScript { SpecialId = _scripts.ChaosUltime }
            }, 21, null),
            (new CardDefinition
            {
                Name = "Évasion fiscale",
                Cost = 4,
                Description = "Réduit de 1 le coût de toutes les cartes en main.",
                Script = new CardScript { SpecialId = _scripts.EvasionFiscale },
                Type = CardType.Spell,
                Requirement = CardRequirement.None
            }, 22, null),
        ];
    }


    // img is in the Assets folder

    public class EvasionFiscaleSpecialScript : DuelScript<DuelCard>
    {
        public EvasionFiscaleSpecialScript(Duel duel, IEntity entity) : base(duel, entity)
        {
        }

        public override bool CardCanPlay(DuelFragment frag, PlayerIndex player1,
            ImmutableArray<DuelArenaPosition> slots,
            ImmutableArray<int> entities)
        {
            var owner = Entity.GetOwner();
            if (owner is null)
            {
                return false;
            }

            var player = State.GetPlayer(owner.Value);
            var compatible = 0;
            foreach (var c in player.Hand)
            {
                if (c != Entity.Id && State.FindCard(c)!.Attribs.GetCost() > 0)
                {
                    compatible++;
                    if (compatible == 2)
                    {
                        return true;
                    }
                }
            }

            return false;
        }

        public override void CardOnPlay(DuelFragment frag, PlayerIndex player,
            ImmutableArray<DuelArenaPosition> slots,
            ImmutableArray<int> entities)
        {
            var ps = State.GetPlayer(player);
            var cards = ps.Hand.ToList();
            cards.Remove(Entity.Id);

            frag.ApplyFrag(new Duel.FragEffect(Entity.Id, EffectTint.Neutral, f =>
            {
                foreach (var card in cards)
                {
                    var cost = State.FindCard(card)!.Attribs.GetCost() - 1;
                    if (cost >= 0)
                    {
                        f.ApplyFrag(new Duel.FragAlteration(Entity.Id, card, true,
                            f2 => { f2.ApplyFrag(new Duel.FragSetAttribute(card, DuelBaseAttrs.Cost, cost)); }));
                    }
                }
            }));
        }
    }

    public class RecyclageAstucieuxSpecialScript(Duel duel, IEntity entity) : DuelScript<DuelCard>(duel, entity)
    {
        public override bool CardCanPlay(DuelFragment frag, PlayerIndex player,
            ImmutableArray<DuelArenaPosition> slots,
            ImmutableArray<int> entities)
        {
            return true;
        }

        public override void CardOnPlay(DuelFragment frag, PlayerIndex player,
            ImmutableArray<DuelArenaPosition> slots,
            ImmutableArray<int> entities)
        {
            var ps = State.GetPlayer(player);
            frag.ApplyFrag(new Duel.FragEffect(Entity.Id, EffectTint.Neutral, f =>
            {
                f.ApplyFrag(new Duel.FragDrawCards(player, 3));

                var cards = ps.Hand.ToList();
                if (cards.Count == 0)
                {
                    return;
                }

                var card = cards[Duel.Rand.Next(cards.Count)];
                f.ApplyFrag(new Duel.FragMoveCard(card, DuelCardLocation.Discarded));
            }) { DisableTargeting = true, StartDelay = 500, EndDelay = 200, PostponeSideEffects = false });
        }
    }

    public class PyramideInfernaleScript(Duel duel, DuelUnit entity) : DuelScript<DuelUnit>(duel, entity)
    {
        public override void PostEliminated(DuelFragment frag)
        {
            var units = State.Units.Values
                .Where(u => u.Owner == Entity.Owner && u.NormalizedArchetype == "3demoniaque")
                .ToList();

            if (units.Count > 0)
            {
                var fragments = units.Select(u =>
                        (DuelFragment)new Duel.FragAlteration(Entity.Id, u.Id, true,
                            f =>
                            {
                                f.ApplyFrag(new Duel.FragSetAttribute(u.Id, DuelBaseAttrs.Attack,
                                    u.Attribs.GetAttack() + 1));
                            }))
                    .ToList();

                frag.EnqueueFragment(new Duel.FragUnitTrigger(Entity.Id, p =>
                {
                    p.ApplyFrag(new Duel.FragEffect(Entity.Id, EffectTint.Neutral,
                        fragments
                    ));
                }));
            }
        }
    }

    public class CubeInfernalScript(Duel duel, DuelUnit entity) : DuelScript<DuelUnit>(duel, entity)
    {
        public override void PostSpawn(DuelFragment frag)
        {
            base.PostSpawn(frag);

            var vec = Entity.Position.Vec;
            var up = vec with { Y = vec.Y + 1 };
            var down = vec with { Y = vec.Y - 1 };

            foreach (var dir in new[] { up, down })
            {
                DuelArenaPosition pos = Entity.Position with { Vec = dir };
                if (pos.Vec.Valid(Duel) &&
                    State.GetPlayer(Entity.Position.Player).Units[pos.Vec.ToIndex(Duel)] == null)
                {
                    frag.EnqueueFragment(new Duel.FragUnitTrigger(Entity.Id, f =>
                    {
                        f.ApplyFrag(new Duel.FragSpawnUnit(Entity.Owner, -1,
                            pos, Duel.MakeCard(new QualCardRef(PackId, TutorialCard5Id), true)));
                    }));
                    break;
                }
            }
        }
    }

    public class AnnihiliationScript(Duel duel, DuelCard entity) : DuelScript<DuelCard>(duel, entity)
    {
        public override bool CardCanPlay(DuelFragment frag, PlayerIndex player,
            ImmutableArray<DuelArenaPosition> slots,
            ImmutableArray<int> entities)
        {
            return State.Units.Values.Any(x => !x.Eliminated);
        }

        public override void CardOnPlay(DuelFragment frag, PlayerIndex player,
            ImmutableArray<DuelArenaPosition> slots,
            ImmutableArray<int> entities)
        {
            frag.ApplyFrag(new Duel.FragEffect(Entity.Id, EffectTint.Negative, f =>
            {
                foreach (var unit in State.Units.Values)
                {
                    f.ApplyFrag(new Duel.FragDestroyUnit(unit.Id, null));
                }
            }));
        }
    }

    public class CasseDuSiecleScript(Duel duel, DuelCard entity) : DuelScript<DuelCard>(duel, entity)
    {
        public override bool CardCanPlay(DuelFragment frag, PlayerIndex player,
            ImmutableArray<DuelArenaPosition> slots,
            ImmutableArray<int> entities)
        {
            bool v = entities.Length == 1
                     && State.FindCard(entities[0]) is { } card
                     && card.GetOwner() != player
                     && card.Location is DuelCardLocation.HandP1 or DuelCardLocation.HandP2;
            return v;
        }

        public override void CardOnPlay(DuelFragment frag, PlayerIndex player,
            ImmutableArray<DuelArenaPosition> slots,
            ImmutableArray<int> entities)
        {
            //var target = State.FindUnit(entities[0])!;
            // Vole une carte de la main adverse. Si c’est une unité, double son attaque et réduit de moitié ses PV.
            var card = State.FindCard(entities[0])!;
            var myHand = player == PlayerIndex.P1 ? DuelCardLocation.HandP1 : DuelCardLocation.HandP2;
            frag.ApplyFrag(new Duel.FragEffect(Entity.Id, EffectTint.Neutral,
                [new Duel.FragMoveCard(card.Id, myHand)]));

            if (card.Type == CardType.Unit)
            {
                frag.ApplyFrag(new Duel.FragEffect(Entity.Id, EffectTint.Neutral, [
                    new Duel.FragAlteration(Entity.Id, card.Id, true, [
                        new Duel.FragSetAttribute(card.Id, DuelBaseAttrs.Attack,
                            card.Attribs.GetAttack() * 2),
                        new Duel.FragSetAttribute(card.Id, DuelBaseAttrs.Health,
                            card.Attribs.GetHealth() / 2)
                    ])
                ]));
            }
        }
    }

    public class SacrificeOcculteScript(Duel duel, DuelCard entity) : DuelScript<DuelCard>(duel, entity)
    {
        public override bool CardCanPlay(DuelFragment frag, PlayerIndex player,
            ImmutableArray<DuelArenaPosition> slots,
            ImmutableArray<int> entities)
        {
            return entities.Length == 1
                   && State.FindUnit(entities[0]) is { } unit
                   && unit.Owner == player
                   && unit.NormalizedArchetype is not null;
        }

        public override void CardOnPlay(DuelFragment frag, PlayerIndex player,
            ImmutableArray<DuelArenaPosition> slots,
            ImmutableArray<int> entities)
        {
            var unit = State.FindUnit(entities[0])!;
            var archetype = unit.NormalizedArchetype!;

            var pool = Duel.CardDatabase
                .Where(x => x.Value.NormalizedArchetype == archetype)
                .ToList();
            if (pool.Count == 0)
            {
                return;
            }

            var pickedUnit1 = pool[Duel.Rand.Next(pool.Count)];
            var pickedUnit2 = pool.FirstOrDefault(x => x.Key != pickedUnit1.Key);
            if (pickedUnit2.Key == default)
            {
                return;
            }

            frag.ApplyFrag(new Duel.FragEffect(Entity.Id, EffectTint.Neutral,
                f => { f.ApplyFrag(new Duel.FragDestroyUnit(unit.Id, null)); }));

            var ps = State.GetPlayer(player);
            var positions = new List<DuelArenaPosition>();
            for (var i = 0; i < ps.Units.Length; i++)
            {
                if (ps.Units[i] is null)
                {
                    positions.Add(new DuelArenaPosition(player, DuelGridVec.FromIndex(Duel, i)));
                }
            }

            if (positions.Count >= 1)
            {
                var idx = Duel.Rand.Next(positions.Count);
                var pos1 = positions[idx];
                positions.RemoveAt(idx);
                frag.ApplyFrag(new Duel.FragSpawnUnit(player, -1, pos1,
                    Duel.MakeCard(pickedUnit1.Key, true)));
            }

            if (positions.Count >= 1)
            {
                var idx = Duel.Rand.Next(positions.Count);
                var pos2 = positions[idx];
                frag.ApplyFrag(new Duel.FragSpawnUnit(player, -1, pos2,
                    Duel.MakeCard(pickedUnit2.Key, true)));
            }
        }
    }

    public class EpeeDemoniaqueScript(Duel duel, DuelCard entity) : DuelScript<DuelCard>(duel, entity)
    {
        public override bool CardCanPlay(DuelFragment frag, PlayerIndex player,
            ImmutableArray<DuelArenaPosition> slots, ImmutableArray<int> entities)
        {
            return State.GetPlayer(player).ExistingUnits.Any();
        }

        public override void CardOnPlay(DuelFragment frag, PlayerIndex player,
            ImmutableArray<DuelArenaPosition> slots,
            ImmutableArray<int> entities)
        {
            var units = State.AliveUnits
                .Where(u => u.Owner == player)
                .ToList();

            if (units.Count > 0)
            {
                var fragments = units.Select(u =>
                        (DuelFragment)new Duel.FragAlteration(Entity.Id, u.Id, true,
                            f =>
                            {
                                f.ApplyFrag(new Duel.FragSetAttribute(u.Id, DuelBaseAttrs.Attack,
                                    u.Attribs.GetAttack() + 2));
                            }))
                    .ToList();

                frag.ApplyFrag(new Duel.FragEffect(Entity.Id, EffectTint.Neutral,
                    fragments
                ));
            }
        }
    }

    public class SingleDamageScript(Duel duel, DuelCard entity, int dmg) : DuelScript<DuelCard>(duel, entity)
    {
        public override bool CardCanPlay(DuelFragment frag, PlayerIndex player,
            ImmutableArray<DuelArenaPosition> slots, ImmutableArray<int> entities)
        {
            return entities.Length == 1
                   && State.FindUnit(entities[0]) is { } unit
                   && unit.Owner != player;
        }

        public override void CardOnPlay(DuelFragment frag, PlayerIndex player,
            ImmutableArray<DuelArenaPosition> slots, ImmutableArray<int> entities)
        {
            frag.ApplyFrag(new Duel.FragEffect(Entity.Id, EffectTint.Negative,
                f => { f.ApplyFrag(new Duel.FragHurtEntity(Entity.Id, entities[0], dmg)); }));
        }
    }

    public class ControleMentalScript(Duel duel, DuelCard entity) : DuelScript<DuelCard>(duel, entity)
    {
        public override bool CardCanPlay(DuelFragment frag, PlayerIndex player,
            ImmutableArray<DuelArenaPosition> slots, ImmutableArray<int> entities)
        {
            return entities.Length == 1
                   && State.FindUnit(entities[0]) is { } unit
                   && unit.Owner != player;
        }

        public override void CardOnPlay(DuelFragment frag, PlayerIndex player,
            ImmutableArray<DuelArenaPosition> slots, ImmutableArray<int> entities)
        {
            var unit = State.FindUnit(entities[0])!;
            frag.ApplyFrag(new Duel.FragEffect(Entity.Id, EffectTint.Neutral, f =>
            {
                f.ApplyFrag(new Duel.FragAlteration(Entity.Id, unit.Id, false, f2 =>
                {
                    f2.ApplyFrag(new Duel.FragAddModifiers(new DuelModifier
                    {
                        Attribute = DuelBaseAttrs.Attack,
                        Op = DuelModifierOperation.Add,
                        TargetId = unit.Id,
                        Value = -1,
                        TurnsRemaining = 1
                    }));
                }));
            }));

            var enemies = State.GetPlayer(1 - player).ExistingUnits
                .Where(u => u != unit.Id)
                .ToList();

            if (enemies.Count != 0)
            {
                var target = enemies[Duel.Rand.Next(enemies.Count)];
                frag.ApplyFrag(new Duel.FragAttackUnit(unit.Id, target, true));
            }
        }
    }

    public class SoifDeCarnageScript(Duel duel, DuelCard entity) : DuelScript<DuelCard>(duel, entity)
    {
        public override bool CardCanPlay(DuelFragment frag, PlayerIndex player,
            ImmutableArray<DuelArenaPosition> slots, ImmutableArray<int> entities)
        {
            return entities.Length == 1
                   && State.FindUnit(entities[0]) is { } unit
                   && unit.Owner == player;
        }

        public override void CardOnPlay(DuelFragment frag, PlayerIndex player,
            ImmutableArray<DuelArenaPosition> slots, ImmutableArray<int> entities)
        {
            var unit = State.FindUnit(entities[0])!;
            var enemies = State.AliveUnits
                .Where(u => u.Owner != player)
                .ToList();
            if (enemies.Count == 0)
            {
                return;
            }

            var count = enemies.Count;

            frag.ApplyFrag(new Duel.FragEffect(Entity.Id, EffectTint.Neutral, f =>
            {
                f.ApplyFrag(new Duel.FragAlteration(Entity.Id, unit.Id, true, f2 =>
                {
                    f2.ApplyFrag(new Duel.FragSetAttribute(
                        unit.Id, DuelBaseAttrs.Attack, unit.Attribs.GetAttack() + count
                    ));
                    f2.ApplyFrag(new Duel.FragSetAttribute(
                        unit.Id, DuelBaseAttrs.MaxHealth, unit.Attribs.GetMaxHealth() + count
                    ));
                    f2.ApplyFrag(new Duel.FragSetAttribute(
                        unit.Id, DuelBaseAttrs.Health, unit.Attribs.GetHealth() + count
                    ));
                }));
            }));
        }
    }

    public class PetitTourAuFourneauScript(Duel duel, DuelCard entity) : DuelScript<DuelCard>(duel, entity)
    {
        private DuelFragmentListenerHandle _turnListen = default;

        public override bool CardCanPlay(DuelFragment frag, PlayerIndex player,
            ImmutableArray<DuelArenaPosition> slots, ImmutableArray<int> entities)
        {
            return Cards(player).Count >= 2;
        }

        private List<int> Cards(PlayerIndex p)
        {
            var hand = State.GetPlayer(p).Hand;

            return hand.Where(x => State.FindCard(x)!.Type == CardType.Unit).ToList();
        }

        public override void CardOnPlay(DuelFragment frag, PlayerIndex player,
            ImmutableArray<DuelArenaPosition> slots, ImmutableArray<int> entities)
        {
            var ps = State.GetPlayer(player);
            var cards = ps.Hand.ToList();
            if (cards.Count < 2)
            {
                return;
            }

            var card1 = cards[Duel.Rand.Next(cards.Count)];
            cards.Remove(card1);
            var card2 = cards[Duel.Rand.Next(cards.Count)];

            var card1St = State.FindCard(card1)!;
            var card1Attr = card1St.Attribs.Snapshot();

            var card2St = State.FindCard(card2)!;
            var card2Attr = card2St.Attribs.Snapshot();

            frag.ApplyFrag(new Duel.FragEffect(Entity.Id, EffectTint.Neutral, f =>
            {
                f.ApplyFrag(new Duel.FragMoveCard(card1, DuelCardLocation.Discarded));
                f.ApplyFrag(new Duel.FragMoveCard(card2, DuelCardLocation.Discarded));
            }) { DisableTargeting = true, StartDelay = 500, EndDelay = 200 });

            var turn = State.Turn + 4;
            var myHand = player == PlayerIndex.P1 ? DuelCardLocation.HandP1 : DuelCardLocation.HandP2;

            Duel.FragCreateCard MakeCreateCardFrag(DuelCard card, DuelAttributeSetV2 attribs)
            {
                return new Duel.FragCreateCard(
                    card.BaseDefRef,
                    myHand,
                    c =>
                    {
                        c.Attribs = attribs;
                        c.Attribs[DuelBaseAttrs.Attack] = c.Attribs.GetAttack() + 3;
                        c.Attribs[DuelBaseAttrs.Health] = c.Attribs.GetHealth() + 3;
                    }
                );
            }

            _turnListen = ListenFragment<Duel.FragSwitchTurn>(f =>
            {
                if (State.Turn == turn)
                {
                    Unlisten(_turnListen);

                    f.EnqueueFragment(new Duel.FragEffect(Entity.Id, EffectTint.Neutral, f2 =>
                    {
                        var name = player == PlayerIndex.P1 ? Duel.P1Name : Duel.P2Name;
                        f2.ApplyFrag(new Duel.FragShowMessage($"Les cartes de {name} sont cuites !!", 2000, 500));
                        f2.ApplyFrag(MakeCreateCardFrag(card1St, card1Attr));
                        f2.ApplyFrag(MakeCreateCardFrag(card2St, card2Attr));
                    }) { DisableTargeting = true });
                }
            }, true);
        }
    }

    public class ReparationExpressScript(Duel duel, DuelCard entity) : DuelScript<DuelCard>(duel, entity)
    {
        public override bool CardCanPlay(DuelFragment frag, PlayerIndex player,
            ImmutableArray<DuelArenaPosition> slots, ImmutableArray<int> entities)
        {
            return entities.Length == 1
                   && State.FindUnit(entities[0]) is { } unit
                   && unit.Owner == player;
        }

        public override void CardOnPlay(DuelFragment frag, PlayerIndex player,
            ImmutableArray<DuelArenaPosition> slots, ImmutableArray<int> entities)
        {
            var unit = State.FindUnit(entities[0])!;
            var neighbors = GetAdjacentUnits(player, unit.Position.Vec);

            frag.ApplyFrag(new Duel.FragEffect(Entity.Id, EffectTint.Positive, f =>
            {
                f.ApplyFrag(new Duel.FragHealEntity(Entity.Id, unit.Id, 3));
                foreach (var target in neighbors)
                {
                    f.ApplyFrag(new Duel.FragHealEntity(Entity.Id, target.Id, 3));
                }
            }));
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
    }

    public class PacteDuDiableScript(Duel duel, DuelCard entity) : DuelScript<DuelCard>(duel, entity)
    {
        public override bool CardCanPlay(DuelFragment frag, PlayerIndex player,
            ImmutableArray<DuelArenaPosition> slots, ImmutableArray<int> entities)
        {
            return State.Players[0].Hand.Count > 0 && State.Players[1].Hand.Count > 0;
        }

        public override void CardOnPlay(DuelFragment frag, PlayerIndex player,
            ImmutableArray<DuelArenaPosition> slots, ImmutableArray<int> entities)
        {
            var p1 = State.GetPlayer(PlayerIndex.P1);
            var p2 = State.GetPlayer(PlayerIndex.P2);

            var p1Hand = p1.Hand.ToList();
            var p2Hand = p2.Hand.ToList();

            var ps = State.GetPlayer(player);
            frag.ApplyFrag(new Duel.FragEffect(Entity.Id, EffectTint.Neutral, f =>
            {
                if (p1Hand.Count > 0)
                {
                    var card = p1Hand[Duel.Rand.Next(p1Hand.Count)];
                    frag.ApplyFrag(new Duel.FragMoveCard(card, DuelCardLocation.Discarded));
                }

                if (p2Hand.Count > 0)
                {
                    var card = p2Hand[Duel.Rand.Next(p2Hand.Count)];
                    frag.ApplyFrag(new Duel.FragMoveCard(card, DuelCardLocation.Discarded));
                }
            }) { DisableTargeting = true, StartDelay = 500, EndDelay = 200, PostponeSideEffects = false });
        }
    }

    public class PlagiatScript(Duel duel, DuelCard entity) : DuelScript<DuelCard>(duel, entity)
    {
        public override bool CardCanPlay(DuelFragment frag, PlayerIndex player,
            ImmutableArray<DuelArenaPosition> slots, ImmutableArray<int> entities)
        {
            return entities.Length == 1
                   && State.FindUnit(entities[0]) is { } unit
                   && unit.Owner != player;
        }

        public override void CardOnPlay(DuelFragment frag, PlayerIndex player,
            ImmutableArray<DuelArenaPosition> slots, ImmutableArray<int> entities)
        {
            var unit = State.FindUnit(entities[0])!;
            frag.ApplyFrag(new Duel.FragEffect(Entity.Id, EffectTint.Neutral, f =>
            {
                f.ApplyFrag(new Duel.FragCreateCard(unit.OriginRef,
                    player == PlayerIndex.P1 ? DuelCardLocation.HandP1 : DuelCardLocation.HandP2,
                    c => c.Attribs[DuelBaseAttrs.Attack] += 1,
                    true));
            }) { Targets = { unit.Id } });
        }
    }

    public class ReactionEnChaineScript(Duel duel, DuelCard entity) : DuelScript<DuelCard>(duel, entity)
    {
        public override bool CardCanPlay(DuelFragment frag, PlayerIndex player,
            ImmutableArray<DuelArenaPosition> slots, ImmutableArray<int> entities)
        {
            return State.AliveUnits.Any(x => x.Owner != player);
        }

        public override void CardOnPlay(DuelFragment frag, PlayerIndex player,
            ImmutableArray<DuelArenaPosition> slots, ImmutableArray<int> entities)
        {
            var hit = new List<int>();

            while (NextTarget(hit, player, out int id))
            {
                var dmg = 2 + hit.Count - 1;
                frag.ApplyFrag(new Duel.FragEffect(Entity.Id, EffectTint.Negative,
                    f => { f.ApplyFrag(new Duel.FragHurtEntity(Entity.Id, id, dmg)); }));

                if (State.FindUnit(id) is not null)
                {
                    break;
                }
            }
        }

        private bool NextTarget(List<int> hit, PlayerIndex player, out int id)
        {
            var units = State.AliveUnits
                .Where(u => player != u.Owner && !hit.Contains(u.Id))
                .ToList();

            if (units.Count == 0)
            {
                id = -1;
                return false;
            }

            var target = units[Duel.Rand.Next(units.Count)];
            id = target.Id;
            hit.Add(id);
            return true;
        }
    }

    public class JusticeUnPeuAgressiveScript(Duel duel, DuelCard entity) : DuelScript<DuelCard>(duel, entity)
    {
        public override bool CardCanPlay(DuelFragment frag, PlayerIndex player,
            ImmutableArray<DuelArenaPosition> slots, ImmutableArray<int> entities)
        {
            return State.GetPlayer(1 - player).ExistingUnits.Any();
        }

        public override void CardOnPlay(DuelFragment frag, PlayerIndex player,
            ImmutableArray<DuelArenaPosition> slots, ImmutableArray<int> entities)
        {
            var units = State.AliveUnits
                .Where(u => u.Owner != player)
                .ToList();

            if (units.Count == 0)
            {
                return;
            }

            var target = units
                .OrderByDescending(u => u.Attribs.GetAttack())
                .First();

            frag.ApplyFrag(new Duel.FragEffect(Entity.Id, EffectTint.Negative,
                f => { f.ApplyFrag(new Duel.FragDestroyUnit(target.Id, null)); }));
        }
    }

    public class AssautApaisantScript(Duel duel, DuelCard entity) : DuelScript<DuelCard>(duel, entity)
    {
        public override bool CardCanPlay(DuelFragment frag, PlayerIndex player,
            ImmutableArray<DuelArenaPosition> slots, ImmutableArray<int> entities)
        {
            return entities.Length == 1
                   && State.FindUnit(entities[0]) is { } unit
                   && unit.Owner != player;
        }

        public override void CardOnPlay(DuelFragment frag, PlayerIndex player,
            ImmutableArray<DuelArenaPosition> slots, ImmutableArray<int> entities)
        {
            var unit = State.FindUnit(entities[0])!;
            frag.ApplyFrag(new Duel.FragEffect(Entity.Id, EffectTint.Negative,
                f => { f.ApplyFrag(new Duel.FragHurtEntity(Entity.Id, unit.Id, 3)); }));

            var overheal = -unit.Attribs.GetHealth();
            if (overheal > 0)
            {
                frag.ApplyFrag(new Duel.FragEffect(Entity.Id, EffectTint.Positive,
                    f =>
                    {
                        f.ApplyFrag(new Duel.FragHealEntity(Entity.Id, State.GetPlayer(player).Id, overheal));
                    }));
            }
        }
    }

    public class RoqueScript(Duel duel, DuelCard entity) : DuelScript<DuelCard>(duel, entity)
    {
        public override bool CardCanPlay(DuelFragment frag, PlayerIndex player,
            ImmutableArray<DuelArenaPosition> slots, ImmutableArray<int> entities)
        {
            return entities.Length == 1
                   && State.FindUnit(entities[0]) is not null;
        }

        public override void CardOnPlay(DuelFragment frag, PlayerIndex player,
            ImmutableArray<DuelArenaPosition> slots, ImmutableArray<int> entities)
        {
            var unit = State.FindUnit(entities[0])!;
            frag.ApplyFrag(new Duel.FragEffect(Entity.Id, EffectTint.Neutral, f =>
            {
                f.ApplyFrag(new Duel.FragAlteration(Entity.Id, unit.Id, unit.Owner == player,
                    f2 =>
                    {
                        var attack = unit.Attribs.GetAttack();
                        var health = unit.Attribs.GetHealth();
                        f2.ApplyFrag(new Duel.FragSetAttribute(unit.Id, DuelBaseAttrs.Attack, health));
                        f2.ApplyFrag(new Duel.FragSetAttribute(unit.Id, DuelBaseAttrs.MaxHealth, attack));
                        f2.ApplyFrag(new Duel.FragSetAttribute(unit.Id, DuelBaseAttrs.Health, attack));
                    }));
            }));
        }
    }

    public class ChaosUltimeScript(Duel duel, DuelCard entity) : DuelScript<DuelCard>(duel, entity)
    {
        public override bool CardCanPlay(DuelFragment frag, PlayerIndex player,
            ImmutableArray<DuelArenaPosition> slots, ImmutableArray<int> entities)
        {
            return State.AliveUnits.Any(x => x.Owner == player);
        }

        public override void CardOnPlay(DuelFragment frag, PlayerIndex player,
            ImmutableArray<DuelArenaPosition> slots, ImmutableArray<int> entities)
        {
            var units = State.AliveUnits
                .Where(x => x.Owner == player)
                .ToList();

            if (units.Count == 0)
            {
                return;
            }

            frag.ApplyFrag(new Duel.FragEffect(Entity.Id, EffectTint.Neutral,
                f =>
                {
                    foreach (var duelUnit in units)
                    {
                        f.ApplyFrag(new Duel.FragAlteration(Entity.Id, duelUnit.Id, true,
                            f2 =>
                            {
                                f2.ApplyFrag(new Duel.FragSetAttribute(duelUnit.Id,
                                    DuelBaseAttrs.ActionsLeft, duelUnit.Attribs.GetActionsLeft() + 1
                                ));
                            }));
                    }
                }));
        }
    }
}

public class Scripts
{
    public readonly int EvasionFiscale =
        SpecialDuelScripts.AddScript(MainPack.PackId, (a, b) => new MainPack.EvasionFiscaleSpecialScript(a, b));

    public readonly int RecyclageAstucieux =
        SpecialDuelScripts.AddScript(MainPack.PackId, (a, b) => new MainPack.RecyclageAstucieuxSpecialScript(a, b));

    public readonly int PyramideInfernale =
        SpecialDuelScripts.AddScript(MainPack.PackId,
            (a, b) => b is DuelUnit u ? new MainPack.PyramideInfernaleScript(a, u) : null);

    public readonly int CubeInfernal =
        SpecialDuelScripts.AddScript(MainPack.PackId,
            (a, b) => b is DuelUnit u ? new MainPack.CubeInfernalScript(a, u) : null);

    public readonly int Annihiliation
        = SpecialDuelScripts.AddScript(MainPack.PackId,
            (a, b) => b is DuelCard c ? new MainPack.AnnihiliationScript(a, c) : null);

    public readonly int CasseDuSiecle
        = SpecialDuelScripts.AddScript(MainPack.PackId,
            (a, b) => b is DuelCard c ? new MainPack.CasseDuSiecleScript(a, c) : null);

    public readonly int SacrificeOcculte
        = SpecialDuelScripts.AddScript(MainPack.PackId,
            (a, b) => b is DuelCard c ? new MainPack.SacrificeOcculteScript(a, c) : null);

    public readonly int EpeeDemoniaque
        = SpecialDuelScripts.AddScript(MainPack.PackId,
            (a, b) => b is DuelCard c ? new MainPack.EpeeDemoniaqueScript(a, c) : null);

    public readonly int Pichenette
        = SpecialDuelScripts.AddScript(MainPack.PackId,
            (a, b) => b is DuelCard c ? new MainPack.SingleDamageScript(a, c, 2) : null);

    public readonly int ControleMental
        = SpecialDuelScripts.AddScript(MainPack.PackId,
            (a, b) => b is DuelCard c ? new MainPack.ControleMentalScript(a, c) : null);

    public readonly int SoifDeCarnage
        = SpecialDuelScripts.AddScript(MainPack.PackId,
            (a, b) => b is DuelCard c ? new MainPack.SoifDeCarnageScript(a, c) : null);

    public readonly int PetitTourAuFourneau
        = SpecialDuelScripts.AddScript(MainPack.PackId,
            (a, b) => b is DuelCard c ? new MainPack.PetitTourAuFourneauScript(a, c) : null);

    public readonly int MissileTeleguide
        = SpecialDuelScripts.AddScript(MainPack.PackId,
            (a, b) => b is DuelCard c ? new MainPack.SingleDamageScript(a, c, 5) : null);

    public readonly int PacteDuDiable
        = SpecialDuelScripts.AddScript(MainPack.PackId,
            (a, b) => b is DuelCard c ? new MainPack.PacteDuDiableScript(a, c) : null);

    public readonly int ReparationExpress
        = SpecialDuelScripts.AddScript(MainPack.PackId,
            (a, b) => b is DuelCard c ? new MainPack.ReparationExpressScript(a, c) : null);

    public readonly int Plagiat
        = SpecialDuelScripts.AddScript(MainPack.PackId,
            (a, b) => b is DuelCard c ? new MainPack.PlagiatScript(a, c) : null);

    public readonly int ReactionEnChaine
        = SpecialDuelScripts.AddScript(MainPack.PackId,
            (a, b) => b is DuelCard c ? new MainPack.ReactionEnChaineScript(a, c) : null);

    public readonly int JusticeUnPeuAgressive
        = SpecialDuelScripts.AddScript(MainPack.PackId,
            (a, b) => b is DuelCard c ? new MainPack.JusticeUnPeuAgressiveScript(a, c) : null);

    public readonly int AssautApaisant
        = SpecialDuelScripts.AddScript(MainPack.PackId,
            (a, b) => b is DuelCard c ? new MainPack.AssautApaisantScript(a, c) : null);

    public readonly int Roque
        = SpecialDuelScripts.AddScript(MainPack.PackId,
            (a, b) => b is DuelCard c ? new MainPack.RoqueScript(a, c) : null);

    public readonly int ChaosUltime
        = SpecialDuelScripts.AddScript(MainPack.PackId,
            (a, b) => b is DuelCard c ? new MainPack.ChaosUltimeScript(a, c) : null);
}