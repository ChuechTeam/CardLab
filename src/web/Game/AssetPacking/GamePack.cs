using System.Collections.Immutable;
using System.Text.Json.Serialization;

namespace CardLab.Game.AssetPacking;

// The definition part of a game pack.
public sealed record GamePack(ImmutableArray<CardAsset> Cards)
{
    public const string PackDefFileExt = "labdef";
    public const string PackResFileExt = "labres";

    public const string PackDefMime = "application/vnd.cardlab.packdef";
    public const string PackResMime = "application/vnd.cardlab.packres";

    public required Guid Id { get; init; }

    public required string Name { get; init; }

    public required uint ResourceFileSize { get; init; }

    public required uint Version { get; init; }

    public ImmutableArray<CardAsset> Cards { get; } = Cards;

    [JsonIgnore]
    public ImmutableDictionary<uint, CardAsset> CardMap { get; init; } = Cards.ToImmutableDictionary(c => c.Id);
}

public readonly record struct CardAsset(uint Id, ResourceRef Image, CardDefinition Definition);

// null PackId refers to the pack of the asset doing a reference.
public readonly record struct AssetRef(Guid? PackId, uint AssetId, AssetType Type);

// A fully qualified reference to a card.
public readonly record struct QualCardRef(Guid PackId, uint CardId);

// Size = 0 --> No resource
public readonly record struct ResourceRef(uint Loc, uint Size)
{
    public static readonly ResourceRef Empty = default;
}

public enum AssetType : byte
{
    Card
}