using System.Collections.Immutable;
using Microsoft.AspNetCore.OutputCaching;

namespace CardLab.Game.Duels.Scripting;

public static partial class SpecialDuelScripts
{
    private static class ScriptsInit
    {
        internal static List<Func<Duel, IEntity, DuelScript?>> Scripts = [];
    } 
    public static List<Func<Duel, IEntity, DuelScript?>> Scripts => ScriptsInit.Scripts;

    private static int AddScript(Func<Duel, IEntity, DuelScript?> scriptFunc)
    {
        Scripts.Add(scriptFunc);
        return Scripts.Count - 1;
    }
}
