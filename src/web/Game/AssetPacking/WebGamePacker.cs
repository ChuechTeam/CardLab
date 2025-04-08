using System.Collections.Immutable;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Options;

namespace CardLab.Game.AssetPacking;

// Compiles a game pack and makes it available for download.
public sealed class WebGamePacker(IWebHostEnvironment webEnv, GamePackCompileQueue queue,
    IOptions<GamePackingOptions> options)
{
    // The directory where packs are stored, always ends with the trailing dir sep.
    private readonly string _packsDir = 
        Path.TrimEndingDirectorySeparator(options.Value.ResolveStoragePath(webEnv))
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

        var defUrlPart = $"{options.Value.RouteUri}/{defName}";
        var resUrlPart = $"{options.Value.RouteUri}/{resName}";

        return new PublishedPack(pack, defUrlPart, resUrlPart);
    }

    public record struct PublishedPack(GamePack Pack, string DefUrlFilePath, string ResUrlFilePath);
}

public sealed class GamePackingOptions
{
    public const string Section = "GamePacking";

    /// <summary>
    /// The URL providing the packs available for download. Must not start nor end with a slash!
    /// </summary>
    public string RouteUri { get; set; } = "userPacks";
    
    /// <summary>
    /// The filesystem path where the packs are stored.
    /// The current directory (.) is set to be ASP.NET's content root.
    /// </summary>
    public string StoragePath { get; set; } = "./userPacks";

    /// <summary>
    /// Returns the full path of <see cref="StoragePath"/>, with the current directory set correctly
    /// to the content root.
    /// </summary>
    /// <param name="env">The web host environment</param>
    /// <returns>The fully resolved path</returns>
    public string ResolveStoragePath(IWebHostEnvironment env)
    {
        return Path.GetFullPath(StoragePath, env.ContentRootPath);
    }
}