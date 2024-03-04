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
    IOptions<JsonOptions> jsonOptions)
{
    public const string WebRootSubDir = "basePacks";

    private readonly record struct LoadedPack(GamePack Pack, string DefFileRelative, string ResFileRelative);

    private readonly Dictionary<Guid, LoadedPack> _loadedPacks = new();

    public async Task CompilePack(Guid id, string name, uint version,
        IList<(CardDefinition def, uint id, string? img)> cards,
        string fileName)
    {
        logger.LogInformation("Compiling pack {Id} ({Name}) with {Count} cards", id, name, cards.Count);

        var stopwatch = Stopwatch.StartNew();

        var defFileRel = Path.Combine(WebRootSubDir, $"{fileName}.{GamePack.PackDefFileExt}");
        var resFileRel = Path.Combine(WebRootSubDir, $"{fileName}.{GamePack.PackResFileExt}");
        var defFile = Path.Combine(webEnv.WebRootPath, defFileRel);
        var resFile = Path.Combine(webEnv.WebRootPath, resFileRel);

        if (_loadedPacks.ContainsKey(id))
        {
            throw new InvalidOperationException($"Pack with id {id} (name={name}) already exists");
        }

        if (Path.GetDirectoryName(defFile) is { } defDir)
        {
            Directory.CreateDirectory(defDir);
        }

        if (Path.GetDirectoryName(resFile) is { } resDir)
        {
            Directory.CreateDirectory(resDir);
        }

        var cardAssets = ImmutableArray.CreateBuilder<CardAsset>(cards.Count);
        uint size;
        await using (var resWrite = new ResourceWriter(File.OpenWrite(resFile)))
        {
            foreach (var (def, cardId, img) in cards)
            {
                var imgRes = img != null ? await resWrite.AddResourceAsync(img) : ResourceRef.Empty;
                cardAssets.Add(new CardAsset(cardId, imgRes, def));
            }

            size = resWrite.Size;
        }

        var pack = new GamePack(Cards: cardAssets.ToImmutable())
        {
            Id = id,
            Name = name,
            ResourceFileSize = size,
            Version = version
        };

        await using (var defStream = File.Create(defFile))
        {
            await JsonSerializer.SerializeAsync(defStream, pack, jsonOptions.Value.JsonSerializerOptions);
        }

        // some kind of windows hack
        _loadedPacks[id] = new LoadedPack(pack, defFileRel.Replace('\\', '/'), resFileRel.Replace('\\', '/'));

        stopwatch.Stop();
        logger.LogInformation("Pack {Id} ({Name}) compiled in {Time}ms, resource file size is {Size}",
            id, name, stopwatch.ElapsedMilliseconds, size);
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