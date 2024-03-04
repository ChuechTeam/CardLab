using System.Collections.Immutable;
using CardLab.Game.AssetPacking;

namespace CardLab.Game.BasePacks;

public static class BasePack1
{
    public const int PackVersion = 2;

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
            Description = "Rien de spécial"
        }, 1, Path.Combine(assetsDir, "Pack1/test.png")),
        (new CardDefinition {
            Name = "EVIL Stéphane Plaza",
            Attack = 3,
            Health = 8,
            Cost = 9,
            Description = "À l'apparition, pose tout plein de meubles sur l'arène adverse. Ils explosent au bout d'un tour"
        }, 2, Path.Combine(assetsDir, "Pack1/plaza.png")),
    ];
}