using System.Collections.Immutable;
using CardLab.Game.AssetPacking;
using CardLab.Game.BasePacks;

namespace CardLab.Game.Duels;

public class GlobalDuelTest
{
    public GlobalDuelTest(BasePackRegistry basePacks, ILoggerFactory logFactory)
    {
        TestPack = basePacks.GetPack(BasePack1.PackId)!;
        TheDuel = new(new DuelSettings
        {
            MaxCoreHealth = 40,
            Packs = ImmutableArray.Create(basePacks.GetPack(BasePack1.PackId)!),
            Player1Deck = MakeBSDeck(TestPack, 32),
            Player2Deck = MakeBSDeck(TestPack, 32)
        }, logFactory.CreateLogger("CardLab.DuelTesting"));
    }

    public GamePack TestPack { get; }
    
    public Duel TheDuel { get; }
    
    private static ImmutableArray<QualCardRef> MakeBSDeck(GamePack pack, int n)
    {
        var builder = ImmutableArray.CreateBuilder<QualCardRef>();
        
        for (int i = 0; i < n; i++)
        {
            var card = pack.Cards[Random.Shared.Next(pack.Cards.Length)];
            
            builder.Add(new QualCardRef(pack.Id, card.Id));
        }

        return builder.ToImmutable();
    }
}