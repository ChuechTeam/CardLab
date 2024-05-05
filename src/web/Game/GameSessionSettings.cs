namespace CardLab.Game;

public record GameSessionSettings
{
    public const string Section = "DefaultSessionSettings";
    
    public int CardsPerPlayer { get; set; } = 2;

    public GameSessionRules.DeckSettings Deck { get; set; } = new()
    {
        SpellProportion = 0.2,
        ArchetypeSequenceLength = 4,
        UserCardCopies = 1
    };

    public GameSessionRules.CostSettings Cost { get; set; } = new()
    {
        LowWeights = [25, 40, 50, 40, 35],
        HighWeights = [50, 40, 30, 20, 10]
    };
}