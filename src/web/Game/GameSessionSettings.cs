using System.Collections.Immutable;

namespace CardLab.Game;

public record GameSessionSettings
{
    public const string Section = "DefaultSessionSettings";
    
    public int CardsPerPlayer { get; init; } = 2;
    
    public double DeckSpellProportion { get; init; } = 0.25;
    
    public int DeckArchetypeSequenceLength { get; init; } = 4;
    
    public int DeckUserCardCopies { get; init; } = 1;

    // Seconds before a disconnected user is considered "away"
    public int DisconnectionTimeout { get; init; } = 15; // Seconds     

    // Prevent players from customizing the card cost.
    // By default, cards have their costs distributed using the weights below.
    public bool EnforceCosts { get; init; } = true;

    // Enables the points-based balance system for cards.
    public bool EnableBalance { get; init; } = true;
    
    public int[] CostLowWeights { get; init; } = [];
    public int[] CostHighWeights { get; init; } = [];
}

public record UserGameSessionSettings
{
    public required int CardsPerPlayer { get; init; }
    
    public required double DeckSpellProportion { get; init; }

    public required int DeckArchetypeSequenceLength { get; init; }
    
    public required int DeckUserCardCopies { get; init; }
    
    public required bool EnforceCosts { get; init; }
    
    public required bool EnableBalance { get; init; } = true;

    public static UserGameSessionSettings Convert(GameSessionSettings settings)
    {
        return new UserGameSessionSettings
        {
            CardsPerPlayer = settings.CardsPerPlayer,
            DeckSpellProportion = settings.DeckSpellProportion,
            DeckArchetypeSequenceLength = settings.DeckArchetypeSequenceLength,
            DeckUserCardCopies = settings.DeckUserCardCopies,
            EnforceCosts = settings.EnforceCosts,
            EnableBalance = settings.EnableBalance
        }; 
    }

    public bool Validate(out List<string> errors)
    {
        errors = new List<string>();
        if (CardsPerPlayer is < 1 or > 10)
        {
            errors.Add("Le nombre de cartes à créer par joueur doit être compris entre 1 et 10.");
        }
        
        const double maxProp = GameSessionRules.MaxSpellProportion;
        if (DeckSpellProportion is < 0.0 or > maxProp)
        {
            errors.Add($"La proportion de sorts dans le deck doit être comprise entre 0% et {maxProp:P}.");
        }
        
        if (DeckArchetypeSequenceLength is < 1 or > 8)
        {
            errors.Add("La longueur de la séquence d'archétypes doit être comprise entre 1 et 8.");
        }

        if (DeckUserCardCopies is < 1 or > 10)
        {
            errors.Add("Le nombre de copies de chaque carte doit être compris entre 1 et 10.");   
        }
        
        return errors.Count == 0;
    }

    public GameSessionSettings Apply(GameSessionSettings src)
    {
        return src with
        {
            CardsPerPlayer = CardsPerPlayer,
            DeckSpellProportion = DeckSpellProportion,
            DeckArchetypeSequenceLength = DeckArchetypeSequenceLength,
            DeckUserCardCopies = DeckUserCardCopies,
            EnforceCosts = EnforceCosts,
            EnableBalance = EnableBalance
        };
    }
}