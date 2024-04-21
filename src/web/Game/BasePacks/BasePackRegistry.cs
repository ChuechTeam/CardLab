using System.Collections.Immutable;
using System.Diagnostics;
using System.Text.Json;
using CardLab.Game.AssetPacking;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

namespace CardLab.Game.BasePacks;

// Contains all base packs.
public sealed class BasePackRegistry(
    IWebHostEnvironment webEnv,
    ILogger<BasePackRegistry> logger,
    GamePackCompiler compiler,
    IOptions<JsonOptions> jsonOptions)
{
    public const string WebRootSubDir = "basePacks";

    private readonly record struct LoadedPack(GamePack Pack, string DefFileRelative, string ResFileRelative);

    private readonly Dictionary<Guid, LoadedPack> _loadedPacks = new();

    public async Task CompilePack(Guid id, string name, uint version,
        IList<(CardDefinition def, uint id, string? img)> cards,
        string fileName)
    {
        if (_loadedPacks.ContainsKey(id))
        {
            throw new InvalidOperationException($"Pack with id {id} (name={name}) already exists");
        }
        
        logger.LogInformation("Compiling base pack {Id} ({Name})", id, name);

        var defFileRel = Path.Combine(WebRootSubDir, $"{fileName}.{GamePack.PackDefFileExt}");
        var resFileRel = Path.Combine(WebRootSubDir, $"{fileName}.{GamePack.PackResFileExt}");
        var defFile = Path.Combine(webEnv.WebRootPath, defFileRel);
        var resFile = Path.Combine(webEnv.WebRootPath, resFileRel);

        var req = new GamePackCompileRequest
        {
            PackId = id,
            PackName = name,
            Version = version,
            OutDefPath = defFile,
            OutResPath = resFile,
            Cards = [..cards.Select(c => new GamePackCompileRequest.PackCard(c.id, c.def, c.img))],
            StripScriptsFromDefFile = false
        };

        var pack = await compiler.CompileAsync(req);

        // some kind of windows hack
        _loadedPacks[id] = new LoadedPack(pack, defFileRel.Replace('\\', '/'), resFileRel.Replace('\\', '/'));
    }

    // todo: method to add preexisting pack from filesystem

    public GamePack? GetPack(Guid id)
    {
        return _loadedPacks.GetValueOrDefault(id).Pack;
    }

    public (string defUrl, string resUrl)? GetPackUrls(HttpContext context, Guid id)
    {
        var pack = _loadedPacks.GetValueOrDefault(id);
        var suffix = "?v=" + pack.Pack.Version;

        var b = context.Request.Scheme + "://" + context.Request.Host;
        return (b + "/" + pack.DefFileRelative + suffix, b + "/" + pack.ResFileRelative + suffix);
    }
}