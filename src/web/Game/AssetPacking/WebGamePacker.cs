using System.Collections.Immutable;
using System.Text.Json.Serialization;

namespace CardLab.Game.AssetPacking;

// Compiles a game pack and makes it available for download.
public sealed class WebGamePacker(IWebHostEnvironment webEnv, GamePackCompileQueue queue)
{
    // same, used for StaticFileOptions
    public const string WebSubDir = "userPacks";
    public const string ContentRootSubDir = "userPacks";
    
    // The directory where packs are stored, always ends with the trailing dir sep.
    private readonly string _packsDir = 
        Path.TrimEndingDirectorySeparator(Path.Combine(webEnv.ContentRootPath, ContentRootSubDir))
        + Path.DirectorySeparatorChar;

    public async Task<PublishedPack> PackGame(Guid id,
        string name,
        uint version,
        ImmutableArray<GamePackCompileRequest.PackCard> cards)
    {
        var strGuid = id.ToString("D");
        var defName = $"{strGuid}.{GamePack.PackDefFileExt}";
        var resName = $"{strGuid}.{GamePack.PackResFileExt}";
        var defPath = $"{_packsDir}{defName}";
        var resPath = $"{_packsDir}{resName}";

        var pack = await queue.EnqueueAsync(new GamePackCompileRequest
        {
            PackId = id,
            PackName = name,
            Version = version,
            Cards = cards,
            OutDefPath = defPath,
            OutResPath = resPath,
            StripScriptsFromDefFile = true
        });

        var defUrlPart = $"{WebSubDir}/{defName}";
        var resUrlPart = $"{WebSubDir}/{resName}";

        return new PublishedPack(pack, defUrlPart, resUrlPart);
    }

    public record struct PublishedPack(GamePack Pack, string DefUrlFilePath, string ResUrlFilePath);
}