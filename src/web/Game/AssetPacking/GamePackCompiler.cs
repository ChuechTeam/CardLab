using System.Collections.Immutable;
using System.Diagnostics;
using Microsoft.AspNetCore.Http.Json;
using Microsoft.Extensions.Options;
using System.Text.Json;

namespace CardLab.Game.AssetPacking;

public sealed class GamePackCompiler(ILogger<GamePackCompiler> logger, IOptions<JsonOptions> jsonOptions)
{
    public async Task<GamePack> CompileAsync(GamePackCompileRequest request, CancellationToken token=default)
    {
        var stopwatch = Stopwatch.StartNew();
        
        if (Path.GetDirectoryName(request.OutDefPath) is { } defDir)
        {
            Directory.CreateDirectory(defDir);
        }

        if (Path.GetDirectoryName(request.OutResPath) is { } resDir)
        {
            Directory.CreateDirectory(resDir);
        }

        var cardAssets = ImmutableArray.CreateBuilder<CardAsset>(request.Cards.Length);

        uint size;
        await using (var resWrite = new ResourceWriter(File.OpenWrite(request.OutResPath)))
        {
            foreach (var (cardId, def, img) in request.Cards)
            {
                var imageRes = ResourceRef.Empty;

                if (img != null)
                {
                    try
                    {
                        imageRes = await resWrite.AddResourceAsync(img, token);
                    }
                    catch (Exception ex)
                    {
                        if (request.IgnoreImageFailures)
                        {
                            logger.LogWarning(ex, "Failed to add image resource for card {Id}", cardId);
                        }
                        else
                        {
                            throw;
                        }
                    }
                }

                cardAssets.Add(new CardAsset(cardId, imageRes, def));
            }

            size = resWrite.Size;
        }

        GamePack MakePack(ImmutableArray<CardAsset> cards)
            => new(cards)
            {
                Id = request.PackId,
                Name = request.PackName,
                ResourceFileSize = size,
                Version = request.Version
            };

        var cardsFinal = cardAssets.ToImmutable();
        var pack = MakePack(cardsFinal);

        var jsonPack = request.StripScriptsFromDefFile
            ? MakePack(ImmutableArray.CreateRange(cardsFinal, RemoveScripts))
            : pack;

        await using (var defStream = File.Create(request.OutDefPath))
        {
            await JsonSerializer.SerializeAsync(defStream, jsonPack, jsonOptions.Value.SerializerOptions, token);
        }

        stopwatch.Stop();
        logger.LogInformation("Pack {Id} ({Name}) compiled in {Time}ms, resource file size is {Size}",
            pack.Id, pack.Name, stopwatch.ElapsedMilliseconds, size);
        
        return pack;
    }

    private static CardAsset RemoveScripts(CardAsset asset)
    {
        return asset with
        {
            Definition = asset.Definition with
            {
                Script = null
            }
        };
    }
}

public sealed record GamePackCompileRequest
{
    // all those parameters into required get init properties:

    public required Guid PackId { get; init; }
    public required string PackName { get; init; }
    public required uint Version { get; init; }
    public required ImmutableArray<PackCard> Cards { get; init; }
    public required string OutDefPath { get; init; }
    public required string OutResPath { get; init; }
    public bool StripScriptsFromDefFile { get; init; } = true;
    public bool IgnoreImageFailures { get; init; } = true;

    public readonly record struct PackCard(uint Id, CardDefinition Definition, string? ImagePath);
};