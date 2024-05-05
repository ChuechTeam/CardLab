#if DEBUG
namespace CardLab.Game.BasePacks;

// This is class is used for development only. Check the TestPack.Local.cstemplate file to
// add your own test cards.
public static partial class TestPack
{
    // This is a little hack so we're sure that each time we compile the pack, the version is different
    public static readonly uint PackVersion = (uint)DateTimeOffset.UtcNow.ToUnixTimeSeconds();

    public const string Name = "Development Test Pack";

    public static readonly Guid PackId = new("45CBB455-9FBC-4BCF-BAD2-166CDED97EA2");

    // img is in the Assets folder
    public static (CardDefinition def, uint id, string? img)[] GetCards(string assetsDir)
    {
        (CardDefinition, uint, string?)[] cards = [];
        GetCards(ref cards, assetsDir);
        if (cards.Length == 0)
        {
            cards =
            [
                (new CardDefinition
                {
                    Name = "Test pack empty!",
                    Cost = 1,
                    Archetype = "Oh no!",
                    Description = "The test pack has no cards. Add some by creating a TestPack.Local.cs file,"
                                  + " and implement the GetCards partial function with your own cards."
                                  + " Use the TestPack.Local.cstemplate file to get started!"
                }, 1, null)
            ];
        }
        return cards;
    }

    static partial void GetCards(ref (CardDefinition def, uint id, string? img)[] cards, string assetsDir);
}
#endif