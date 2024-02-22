using System.Text.Json.Serialization;

namespace CardLab.Game.Duels;

[JsonPolymorphic(TypeDiscriminatorPropertyName = "type")]
[JsonDerivedType(typeof(UnitDuelTarget), typeDiscriminator: "unit")]
[JsonDerivedType(typeof(CoreDuelTarget), typeDiscriminator: "core")]
public abstract record DuelTarget;

public sealed record UnitDuelTarget(int UnitId) : DuelTarget;
public sealed record CoreDuelTarget(PlayerIndex Player) : DuelTarget;

[JsonPolymorphic(TypeDiscriminatorPropertyName = "type")]
[JsonDerivedType(typeof(UnitDuelSource), typeDiscriminator: "unit")]
[JsonDerivedType(typeof(CoreDuelSource), typeDiscriminator: "core")]
[JsonDerivedType(typeof(CardDuelSource), typeDiscriminator: "card")]
public abstract record DuelSource;

public sealed record UnitDuelSource(int UnitId) : DuelSource;
public sealed record CoreDuelSource(PlayerIndex Player) : DuelSource;
public sealed record CardDuelSource(int CardId) : DuelSource;