using System.Collections.Immutable;
using System.Globalization;
using System.Text;
using CardLab.API;

namespace CardLab.Game;

public static partial class CardModule
{
    public record ValidationSummary(bool DefinitionValid, ImmutableArray<string> Errors);

    public record UsageSummary(int CreditsAvailable, int CreditsUsed)
    {
        public bool Balanced => CreditsUsed <= CreditsAvailable && CreditsUsed >= 0;
    }

    public static string SanitizeString(string str)
    {
        return str.Trim();
    }

    public static string CapitalizeArchetype(string str)
    {
        str = SanitizeString(str);
        var builder = new StringBuilder(str);

        bool upper = true;
        for (int i = 0; i < builder.Length; i++)
        {
            var c = builder[i];
            if (char.IsLetter(c))
            {
                if (upper)
                {
                    builder[i] = char.ToUpper(c);
                }
                else
                {
                    builder[i] = char.ToLower(c);
                }

                upper = false;
            }
            else
            {
                upper |= char.IsWhiteSpace(c) || c == '-';
            }
        }

        return builder.ToString();
    }

    // From https://stackoverflow.com/a/67569854/5816295
    public static string NormalizeArchetype(string str)
    {
        var normalizedString = str.Normalize(NormalizationForm.FormD);
        var stringBuilder = new StringBuilder();

        foreach (var c in normalizedString.EnumerateRunes())
        {
            var unicodeCategory = Rune.GetUnicodeCategory(c);
            if (unicodeCategory is
                UnicodeCategory.LowercaseLetter 
                or UnicodeCategory.UppercaseLetter
                or UnicodeCategory.DashPunctuation
                or UnicodeCategory.OpenPunctuation
                or UnicodeCategory.SpaceSeparator)
            {
                stringBuilder.Append(Rune.ToLowerInvariant(c));
            }
        }

        return stringBuilder.ToString().Normalize(NormalizationForm.FormC);
    }

    public static ValidationSummary ValidateDefinition(CardDefinition cardDef, out bool preventsBalanceCalc)
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

        if (cardDef.Archetype is not null)
        {
            if (cardDef.Archetype.Length > 24)
            {
                errors.Add("L'archétype est trop long (plus de 24 caractères).");
            }
        }

        // todo: validate script

        return new ValidationSummary(errors.Count == 0, errors.ToImmutable());
    }

    public static string GenerateCardDescription(CardDefinition def) => LangFR.GenerateCardDescription(def);
}