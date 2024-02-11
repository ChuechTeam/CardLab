using System.Collections.Immutable;
using CardLab.API;

namespace CardLab.Game;

public class CardBalancer
{
    public record ValidationSummary(bool DefinitionValid, ImmutableArray<string> Errors);

    public record UsageSummary(int CreditsAvailable, int CreditsUsed, ImmutableArray<UsageEntry> Entries)
    {
        public bool Balanced => CreditsUsed <= CreditsAvailable;
    }

    public readonly record struct UsageEntry(string Name, int Credits, ImmutableArray<UsageEntry> SubEntries)
    {
        public UsageEntry(string Name, int Credits) : this(Name, Credits, ImmutableArray<UsageEntry>.Empty)
        {
        }
    }


    public ValidationSummary ValidateDefinition(CardDefinition cardDef, out bool preventsBalanceCalc)
    {
        var errors = ImmutableArray.CreateBuilder<string>();
        preventsBalanceCalc = false;

        // Later on, we might want to make all this stuff configurable via options.
        if (cardDef.Name.Length > 24)
        {
            errors.Add("Le nom est trop long (plus de 24 caractères).");
        }

        if (string.IsNullOrWhiteSpace(cardDef.Name))
        {
            errors.Add("Un nom est requis.");
        }

        if (cardDef.Cost is <= 0 or > 10)
        {
            errors.Add("Le coût doit être entre 1 et 10.");
            preventsBalanceCalc = true;
        }

        if (cardDef.Attack is < 0 or > 100)
        {
            errors.Add("L'attaque doit être entre 0 et 100.");
            preventsBalanceCalc = true;
        }

        if (cardDef.Health is < 1 or > 100)
        {
            errors.Add("La santé doit être entre 1 et 100.");
            preventsBalanceCalc = true;
        }

        if (cardDef.Lore.Length > 200)
        {
            errors.Add("La description est trop longue (plus de 200 caractères).");
        }
        
        // todo: validate script

        return new ValidationSummary(errors.Count == 0, errors.ToImmutable());
    }

    public UsageSummary CalculateCardBalance(CardDefinition cardDef)
    {
        var entries = ImmutableArray.CreateBuilder<UsageEntry>();
        entries.Add(new UsageEntry("LGTM", 0, ImmutableArray<UsageEntry>.Empty));
        return new UsageSummary(100, 0, entries.ToImmutable());
    }
}