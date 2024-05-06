using System.Collections.Immutable;
using Microsoft.AspNetCore.OutputCaching;

namespace CardLab.Game.Duels.Scripting;

public static partial class SpecialDuelScripts
{
    public static Dictionary<Guid, List<Func<Duel, IEntity, DuelScript?>>> Scripts = new();

    public static int AddScript(Guid guid, Func<Duel, IEntity, DuelScript?> scriptFunc)
    {
        List<Func<Duel, IEntity, DuelScript?>> list = new();
        if (!Scripts.TryGetValue(guid, out list))
        {
            Scripts[guid] = list = new List<Func<Duel, IEntity, DuelScript?>>();
        }
        list.Add(scriptFunc);
        return list.Count - 1;
    }
    
    public static DuelScript? MakeScript(Guid guid, int index, Duel duel, IEntity entity)
    {
        if (Scripts.TryGetValue(guid, out var list))
        {
            if (index < list.Count)
            {
                return list[index](duel, entity);
            }
        }
        return null;
    }
}
