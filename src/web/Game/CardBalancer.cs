using System.Collections.Immutable;
using System.Text;
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

        int creditsAvailable = cardDef.Cost * 5 * 2 + cardDef.Cost * 3;
        int creditsUsed = 0;

        void AddEntry(in UsageEntry entry)
        {
            entries.Add(entry);
            creditsUsed += entry.Credits;
        }

        AddEntry(new UsageEntry($"Attaque : {cardDef.Attack} points", cardDef.Attack * 5));
        AddEntry(new UsageEntry($"Santé : {cardDef.Health} points", cardDef.Health * 5));

        if (cardDef.Script is not null)
        {
            foreach (var evHandler in cardDef.Script.Handlers)
            {
                if (evHandler.Actions.Any())
                {
                    AddEntry(CalculateEventUsage(evHandler));
                }
            }
        }

        return new UsageSummary(creditsAvailable, creditsUsed, entries.ToImmutable());
    }

    private UsageEntry CalculateEventUsage(CardEventHandler handler)
    {
        var entries = ImmutableArray.CreateBuilder<UsageEntry>();
        int creditsUsed = 0;

        void AddEntry(in UsageEntry entry)
        {
            entries.Add(entry);
            creditsUsed += entry.Credits;
        }

        foreach (var act in handler.Actions)
        {
            AddEntry(new UsageEntry(ActionName(act), ActionCost(act)));
        }

        return new UsageEntry($"Déclencheur : « {EventName(handler.Event)} »", creditsUsed, entries.ToImmutable());
    }

    public string GenerateCardDescription(CardDefinition def)
    {
        var desc = new StringBuilder();

        static string SentenceStart(CardEvent ev)
        {
            return ev switch
            {
                CardEvent.WhenISpawn => "À l'apparition, ",
                _ => "Quand on ne sait quoi se produit, "
            };
        }

        static string ActionInSentence(CardAction act)
        {
            return act switch
            {
                DrawCardCardAction (var numCards) => numCards switch
                {
                    > 1 => $"piochez {numCards} cartes",
                    _ => "piochez une carte"
                },
                WinGameCardAction => "gagnez la partie",
                HurtAction (var dmg, var target) => dmg switch
                {
                    > 1 => $"inflige {dmg} dégâts {TargetNameWithPreposition(target)}",
                    _ => $"inflige 1 dégât {TargetNameWithPreposition(target)}"
                },
                _ => "faites un truc"
            };
        }

        var script = def.Script;
        if (script is not null)
        {
            foreach (var handler in script.Handlers)
            {
                desc.Append(SentenceStart(handler.Event));
                for (var i = 0; i < handler.Actions.Length; i++)
                {
                    var act = handler.Actions[i];
                    desc.Append(ActionInSentence(act));

                    // Peak programming right there
                    var dist = handler.Actions.Length - (i + 1);

                    var connector = dist switch
                    {
                        0 => ".",
                        1 => handler.Actions.Length switch
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

    private static string EventName(CardEvent ev)
    {
        return ev switch
        {
            CardEvent.WhenISpawn => "Lorsque la carte est jouée",
            _ => "ah bah je sais pas"
        };
    }

    private static string TargetNameWithPreposition(Target target)
    {
        return target switch
        {
            RandomEnemyTarget => "à un ennemi aléatoire",
            EnemyCoreTarget => "au noyau ennemi",
            MyCoreTarget => "à votre noyau",
            _ => "à je sais pas qui"
        };
    }

    private static string ActionName(CardAction act)
    {
        return act switch
        {
            DrawCardCardAction { NumCards: var n } => $"Piocher {n} carte(s)",
            WinGameCardAction => "Gagner la partie",
            HurtAction (var dmg, var target) => $"Infliger {dmg} dégâts {TargetNameWithPreposition(target)}",
            _ => "ah bah je sais pas"
        };
    }

    private static int ActionCost(CardAction act)
    {
        return act switch
        {
            WinGameCardAction => 200,
            DrawCardCardAction { NumCards: var n } => n * n * 5,
            HurtAction (var dmg, _) => dmg * 10,
            _ => 0
        };
    }
}