using System.Collections.Immutable;
using System.Text.Json.Serialization;

namespace CardLab.Game.Duels;

// All the deltas are here!

// Deltas are (nearly) the *ONLY* way to modify the state of a duel after its creation.
// The game client can receive deltas and apply them to their local state, at
// the pace they want, in order to play relevant animations for each step of a
// mutation.
// There's an exception for attributes as it's tricky to apply changes due to modifiers
// using deltas.

// Deltas are designed to be one-to-one with in-game animations, but there might
// be some exceptions (too complex stuff for instance).
// In these cases, scopes are there!

[JsonPolymorphic(TypeDiscriminatorPropertyName = "type")]
[JsonDerivedType(typeof(CreateCardsDelta), "createCards")]
[JsonDerivedType(typeof(RevealCardsDelta), "revealCards")]
[JsonDerivedType(typeof(MoveCardsDelta), "moveCards")]
[JsonDerivedType(typeof(SwitchTurnDelta), "switchTurn")]
[JsonDerivedType(typeof(SwitchStatusDelta), "switchStatus")]
[JsonDerivedType(typeof(PlaceUnitDelta), "placeUnit")]
[JsonDerivedType(typeof(RemoveUnitDelta), "removeUnit")]
[JsonDerivedType(typeof(UpdateEntityAttribsDelta), "updateEntityAttribs")]
// Scopes
[JsonDerivedType(typeof(UnitAttackScopeDelta), "unitAttackScope")]
[JsonDerivedType(typeof(UnitTriggerScopeDelta), "unitTriggerScope")]
[JsonDerivedType(typeof(CardPlayScopeDelta), "cardPlayScope")]
[JsonDerivedType(typeof(CardDrawScopeDelta), "cardDrawScope")]
[JsonDerivedType(typeof(DeathScopeDelta), "deathScope")]
[JsonDerivedType(typeof(ScopePreparationEndDelta), "scopePreparationEnd")]
[JsonDerivedType(typeof(ScopeEndDelta), "scopeEnd")]
public abstract record DuelStateDelta
{
    public abstract Result<Unit> Apply(Duel duel, DuelState state);
}

public sealed record SwitchStatusDelta : DuelStateDelta
{
    public required DuelStatus Status { get; init; }

    public override Result<Unit> Apply(Duel duel, DuelState state)
    {
        state.Status = Status;
        return Result.Success();
    }
}

public sealed record SwitchTurnDelta : DuelStateDelta
{
    public required int NewTurn { get; init; }
    public required PlayerIndex WhoPlays { get; init; }

    public override Result<Unit> Apply(Duel duel, DuelState state)
    {
        state.Turn = NewTurn;
        state.WhoseTurn = WhoPlays;

        return Result.Success();
    }
}

public sealed record PlaceUnitDelta : DuelStateDelta
{
    public required PlayerIndex Player { get; init; }
    [JsonIgnore] public required DuelUnit Unit { get; init; }
    public required DuelGridVec Position { get; init; }

    // set in apply for the client
    [JsonPropertyName("unit")] public DuelUnit SnapshotUnit { get; set; } = null!;

    public override Result<Unit> Apply(Duel duel, DuelState state)
    {
        SnapshotUnit = Unit.Snapshot();

        // todo: validate position somehow
        if (!Position.Valid(duel))
        {
            return Result.Fail("invalid position");
        }

        var playerSt = state.GetPlayer(Player);
        var index = Position.ToIndex(duel);
        if (playerSt.Units[index] != null)
        {
            return Result.Fail("position already occupied");
        }

        state.Units.Add(Unit.Id, Unit);
        playerSt.Units[index] = Unit.Id;
        Unit.Position = Position;

        return Result.Success();
    }
}

public sealed record RemoveUnitDelta : DuelStateDelta
{
    public required ImmutableArray<int> RemovedIds { get; init; }

    public override Result<Unit> Apply(Duel duel, DuelState state)
    {
        // todo: validation?
        foreach (var removedId in RemovedIds)
        {
            if (state.FindUnit(removedId) is { } unit)
            {
                state.Units.Remove(removedId);

                var i = Array.IndexOf(state.Player1.Units, removedId);
                if (i != -1)
                {
                    state.Player1.Units[i] = null;
                }

                i = Array.IndexOf(state.Player2.Units, removedId);
                if (i != -1)
                {
                    state.Player2.Units[i] = null;
                }

                unit.Eliminated = true;
            }
        }

        return Result.Success();
    }
}

public sealed record UpdateEntityAttribsDelta : DuelStateDelta
{
    public required int EntityId { get; init; }
    public required Dictionary<string, object> Attribs { get; init; }
    
    public override Result<Unit> Apply(Duel duel, DuelState state)
    {
        // Changes are done in DuelMutation
        return Result.Success();
    }
}

// Create cards that are revealed by neither player.
public sealed record CreateCardsDelta : DuelStateDelta
{
    [JsonIgnore] public required IEnumerable<DuelCard> Cards { get; init; }

    // set in apply for the client
    public List<int> CardIds { get; set; } = new();

    public override Result<Unit> Apply(Duel duel, DuelState state)
    {
        foreach (var c in Cards)
        {
            state.Cards.Add(c.Id, c);
            CardIds.Add(c.Id);
        }

        return Result.Success();
    }
}

public sealed record RevealCardsDelta : DuelStateDelta
{
    [JsonIgnore] public ImmutableArray<(int cardId, PlayerPair<bool> newReveal)> Changes { get; init; }

    // set in apply for sanitizer
    [JsonIgnore] public List<(DuelCard card, PlayerPair<bool> prevReveal)> CardSnapshots { get; } = new();

    // Set by sanitizer
    public ImmutableArray<int> HiddenCards { get; set; } = ImmutableArray<int>.Empty;

    // must be snapshots!
    public ImmutableArray<DuelCard> RevealedCards { get; set; } = ImmutableArray<DuelCard>.Empty;

    public override Result<Unit> Apply(Duel duel, DuelState state)
    {
        foreach (var (cardId, newReveal) in Changes)
        {
            if (!state.Cards.ContainsKey(cardId))
            {
                return Result.Fail("");
            }
        }

        foreach (var (cardId, newReveal) in Changes)
        {
            var card = state.Cards[cardId];
            var prevRev = card.Revealed;
            card.Revealed = newReveal;
            CardSnapshots.Add((card.TakeSnapshot(), prevRev));
        }

        return Result.Success();
    }
}

public sealed record MoveCardsDelta : DuelStateDelta
{
    // null index = append or none
    public ImmutableArray<Move> Changes { get; init; }

    public Reason Context { get; init; } // Cosmetic

    public readonly record struct Move(int CardId, DuelCardLocation NewLocation, int? Index);

    public enum Reason
    {
        Played,
        Discarded,
        Drawn,
        Other
    }

    public override Result<Unit> Apply(Duel duel, DuelState state)
    {
        // check
        foreach (var (cardId, _, _) in Changes)
        {
            if (!state.Cards.ContainsKey(cardId))
            {
                return Result.Fail("");
            }
        }

        foreach (var (cardId, newLocation, index) in Changes)
        {
            // 1. remove from old list (if there's one)
            var card = state.Cards[cardId];
            switch (card.Location)
            {
                case DuelCardLocation.DeckP1:
                    state.Player1.Deck.Remove(cardId);
                    break;
                case DuelCardLocation.DeckP2:
                    state.Player2.Deck.Remove(cardId);
                    break;
                case DuelCardLocation.HandP1:
                    state.Player1.Hand.Remove(cardId);
                    break;
                case DuelCardLocation.HandP2:
                    state.Player2.Hand.Remove(cardId);
                    break;
                case DuelCardLocation.Discarded: // no list for them
                case DuelCardLocation.Temp:
                    break;
                default:
                    throw new ArgumentOutOfRangeException();
            }

            // 2. Set the new location
            card.Location = newLocation;

            // 3. Insert to list
            void InsertTo(List<int> cards)
            {
                if (index is { } i)
                {
                    cards.Insert(Math.Min(cards.Count, i), cardId);
                }
                else
                {
                    cards.Add(cardId);
                }
            }

            switch (card.Location)
            {
                case DuelCardLocation.DeckP1:
                    InsertTo(state.Player1.Deck);
                    break;
                case DuelCardLocation.DeckP2:
                    InsertTo(state.Player2.Deck);
                    break;
                case DuelCardLocation.HandP1:
                    InsertTo(state.Player1.Hand);
                    break;
                case DuelCardLocation.HandP2:
                    InsertTo(state.Player2.Hand);
                    break;
                case DuelCardLocation.Discarded: // no list for them
                case DuelCardLocation.Temp:
                    break;
                default:
                    throw new ArgumentOutOfRangeException();
            }
        }

        return Result.Success();
    }
}

// Scopes: used to know who did what
// Scopes are sent to the client in the following sequence (using json types):
// - fooScope | tells that the scope began
// - scopePreparationEnd | tells that the scope had some preparation tasks and they're done
// - scopeEnd | tells that the scope ended (with interrupted=true when preparation made the scope end early)

public abstract record ScopeDelta : DuelStateDelta
{
    // A dumb property for JS to detect scopes easily.
    public int IsScope { get; } = 1;

    public override Result<Unit> Apply(Duel duel, DuelState state)
    {
        return Result.Success();
    }
}

public sealed record UnitAttackScopeDelta(int UnitId, int TargetId) : ScopeDelta;

public sealed record UnitTriggerScopeDelta(int UnitId) : ScopeDelta;

public sealed record CardPlayScopeDelta(int CardId, PlayerIndex Player) : ScopeDelta;

public sealed record CardDrawScopeDelta(PlayerIndex Player) : ScopeDelta;

public sealed record DeathScopeDelta() : ScopeDelta;

public sealed record ScopePreparationEndDelta() : DuelStateDelta
{
    public override Result<Unit> Apply(Duel duel, DuelState state)
    {
        return Result.Success();
    }
}

public sealed record ScopeEndDelta(bool Interrupted = false) : DuelStateDelta
{
    public override Result<Unit> Apply(Duel duel, DuelState state)
    {
        return Result.Success();
    }
}