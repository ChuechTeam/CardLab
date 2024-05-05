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

    // Deletes all labdef/labres files in the basePacks folder
    public void ClearPacks()
    {
        var packsDir = Path.Combine(webEnv.WebRootPath, WebRootSubDir);
        int n = 0;
        foreach (var file in Directory.EnumerateFiles(packsDir))
        {
            var ext = Path.GetExtension(file);
            if (ext is $".{GamePack.PackDefFileExt}" or $".{GamePack.PackResFileExt}")
            {
                try
                {
                    File.Delete(file);
                    n++;
                }
                catch (Exception e)
                {
                    logger.LogWarning(e, "Failed to delete file {File} while clearing packs", file);
                }
            }
        }
        logger.LogInformation("Removed all pack files in {PacksDir} ({N} files)", packsDir, n);
    }
    
    public async Task FindPacks()
    {
        var packsDir = Path.Combine(webEnv.WebRootPath, WebRootSubDir);
        var found = new Dictionary<string, (string? def, string? res)>();

        if (Directory.Exists(packsDir))
        {
            foreach (var file in Directory.EnumerateFiles(packsDir))
            {
                var ext = Path.GetExtension(file);
                bool isRes = ext == "." + GamePack.PackResFileExt;
                bool isDef = ext == "." + GamePack.PackDefFileExt;

                if (isRes || isDef)
                {
                    var name = Path.GetFileNameWithoutExtension(file);
                    if (!found.TryGetValue(name, out var value))
                    {
                        value = (def: null, res: null);
                        found[name] = value;
                    }

                    if (isRes)
                    {
                        found[name] = value with { res = file };
                    }
                    else
                    {
                        found[name] = value with { def = file };
                    }
                }
            }
        }

        foreach (var (name, (defFile, resFile)) in found)
        {
            if (defFile is null)
            {
                logger.LogWarning("Found resource file {ResFile} without definition file", resFile);
                continue;
            }

            if (resFile is null)
            {
                logger.LogWarning("Found definition file {DefFile} without resource file", defFile);
                continue;
            }

            await using var def = File.OpenRead(defFile);
            var pack = await JsonSerializer.DeserializeAsync<GamePack>(def, jsonOptions.Value.JsonSerializerOptions);

            if (pack is null)
            {
                logger.LogWarning("Invalid pack definition file {DefFile}", defFile);
                continue;
            }

            var defRel = WebRootSubDir + "/" + name + "." + GamePack.PackDefFileExt;
            var resRel = WebRootSubDir + "/" + name + "." + GamePack.PackResFileExt;
            if (!_loadedPacks.TryAdd(pack.Id, new LoadedPack(pack, defRel, resRel)))
            {
                logger.LogWarning("Duplicate pack ID: {Id}", pack.Id);
            }
            else
            {
                logger.LogInformation("Loaded pack {Id} ({Name}) from base packs folder", pack.Id, pack.Name);
            }
        }
    }

    public GamePack? GetPack(Guid id)
    {
        return _loadedPacks.GetValueOrDefault(id).Pack;
    }

    public (string defUrl, string resUrl)? GetPackUrls(HttpContext context, Guid id)
    {
        var pack = _loadedPacks.GetValueOrDefault(id);
        var suffix = "?v=" + pack.Pack.Version;

        var b = $"{context.Request.Scheme}://{context.Request.Host}";
        return ($"{b}/{pack.DefFileRelative}{suffix}", $"{b}/{pack.ResFileRelative}{suffix}");
    }
}