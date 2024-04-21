using System.Collections.Immutable;
using CardLab.Game.AssetPacking;
using CardLab.Game.BasePacks;

namespace CardLab.Game.Duels;

public class GlobalDuelTest
{
    private readonly BasePackRegistry _basePacks;
    private readonly ILoggerFactory _logFactory;

    public GlobalDuelTest(BasePackRegistry basePacks, ILoggerFactory logFactory)
    {
        _basePacks = basePacks;
        _logFactory = logFactory;
        TestPack = basePacks.GetPack(BasePack1.PackId)!;

        TheDuel = MakeNewDuel();
    }

    public GamePack TestPack { get; }

    public Duel TheDuel { get; private set; }

    public Duel MakeNewDuel()
    {
        return new(new DuelSettings
        {
            MaxCoreHealth = 40,
            Packs = ImmutableArray.Create(_basePacks.GetPack(BasePack1.PackId)!),
            Player1Deck = MakeBSDeck(TestPack, 32),
            Player2Deck = MakeBSDeck(TestPack, 32),
            SecondsPerTurn = 60,
        }, _logFactory, "p1", "p2");
    }

    public void Reset()
    {
        TheDuel.Dispose();
        TheDuel = MakeNewDuel();
    }

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