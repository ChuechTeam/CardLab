using System.Collections.Immutable;

namespace CardLab.Game;

public record GameSessionSettings
{
    public const string Section = "DefaultSessionSettings";
    
    public int CardsPerPlayer { get; set; } = 2;
    
    public double DeckSpellProportion { get; set; } = 0.25;
    
    public int DeckArchetypeSequenceLength { get; set; } = 4;
    
    public int DeckUserCardCopies { get; set; } = 1;

    // Seconds before a disconnected user is considered "away"
    public int DisconnectionTimeout { get; set; } = 15; // Seconds     

    public int[] CostLowWeights { get; set; } = [];
    public int[] CostHighWeights { get; set; } = [];
}