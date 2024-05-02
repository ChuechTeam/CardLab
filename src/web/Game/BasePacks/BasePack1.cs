using System.Collections.Immutable;
using CardLab.Game.AssetPacking;
using CardLab.Game.Duels.Scripting;

namespace CardLab.Game.BasePacks;

public static class BasePack1
{
    public const int PackVersion = 5;

    public const string Name = "Base Pack 1";

    public static readonly Guid PackId = new("45CBB455-9FBC-4BCF-BAD2-166CDED97EA2");

    // img is in the Assets folder
    public static (CardDefinition def, uint id, string? img)[] GetCards(string assetsDir) =>
    [
        (new CardDefinition
        {
            Name = "Test",
            Attack = 1,
            Health = 1,
            Cost = 1,
            Description = "Rien de spécial",
            Archetype = "Bof bof",
            NormalizedArchetype = "bof bof",
            Script = new CardScript
            {
                Handlers =
                [
                    new CardEventHandler
                    {
                        Event = new PostSpawnEvent(),
                        Actions =
                        [
                            new DrawCardAction(1, [new AdjacentFilter()]),
                            new HurtAction(3, new CoreTarget(true))
                        ]
                    }
                ]
            }
        }, 1, Path.Combine(assetsDir, "Pack1/test.png")),
        (new CardDefinition
        {
            Name = "EVIL Stéphane Plaza",
            Attack = 3,
            Health = 8,
            Cost = 2,
            Description = "À l'apparition, inflige 1 dégât au noyau ennemi. Méchant Stéphane !!",
            Author = "M6",
            Archetype = "Présentateur",
            NormalizedArchetype = "Presentateur",
            Script = new CardScript { SpecialId = SpecialDuelScripts.Test2 },
        }, 2, Path.Combine(assetsDir, "Pack1/plaza.png")),
        (new CardDefinition
        {
            Name = "Encore plus de test",
            Cost = 2,
            Description = "Du vol !!",
            Script = new CardScript { SpecialId = SpecialDuelScripts.Test },
            Type = CardType.Spell,
            Requirement = CardRequirement.SingleEntity
        }, 102, Path.Combine(assetsDir, "Pack1/test.png")),
        (new CardDefinition
        {
            Name = "Évasion fiscale",
            Cost = 4,
            Description = "Réduit de 1 le coût de toutes les cartes en main.",
            Script = new CardScript { SpecialId = SpecialDuelScripts.EvasionFiscale },
            Type = CardType.Spell,
            Requirement = CardRequirement.None
        }, 4, Path.Combine(assetsDir, "Pack1/evasion.png")),
        (new CardDefinition
        {
            Name = "Recyclage astucieux",
            Cost = 3,
            Description = "Défausse 1 carte au hasard. Vous piochez 3 cartes.",
            Script = new CardScript { SpecialId = SpecialDuelScripts.RecyclageAstucieux },
            Type = CardType.Spell,
            Requirement = CardRequirement.None
        }, 5, Path.Combine(assetsDir, "Pack1/recyclage.png")),
    ];
}