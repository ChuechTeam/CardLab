using System.Collections.Immutable;
using System.Runtime.CompilerServices;
using NuGet.Packaging;

namespace CardLab.Game.Duels;

// Fragments are atomic changes to the game state that can be run within Actions. 
// Actions can run before and after the Fragment completes, using Events.
// During the Fragment execution, Events can occur and trigger Actions. Those Actions
// are queued and run after the Fragment completes.

public sealed partial class Duel
{
    private DuelFragmentFunc FragPlayCard(int cardId, PlayerIndex player)
    {
        return new DuelFragmentFunc(new PlayCardFragKind(cardId), MakeFrag);

        DuelFragment MakeFrag(DuelFragment frag)
        {
            // todo: move validation to a separate function so we can do validation for user actions 
            var playerSt = frag.Mutation.State.GetPlayer(player);
            var card = playerSt.Hand.FirstOrDefault(c => c.Id == cardId);
            if (card is null)
            {
                return frag with { Result = new DuelFragmentResult { Success = false } };
            }

            var cost = ResolveCardRef(card.BaseDefRef).Cost;
            if (playerSt.Energy < cost)
            {
                return frag with { Result = new DuelFragmentResult { Success = false } };
            }

            frag = FragDeltaOpt(frag, new UpdateEnergyDelta
            {
                Player = player,
                NewEnergy = playerSt.Energy - cost,
                NewMaxEnergy = playerSt.MaxEnergy
            });

            frag = FragDeltaOpt(frag, new RemoveCardsDelta
            {
                CardIds = ImmutableArray.Create(cardId),
                Player = player,
                Reason = RemoveCardsDelta.RemReason.Played
            });

            return frag;
        }
    }

    private DuelFragmentFunc FragPlaceUnit(PlayerIndex player, DuelUnit unit, int placementIdx)
    {
        var kind = new PlaceUnitFragKind(unit);
        return new DuelFragmentFunc(kind, MakeFrag);

        DuelFragment MakeFrag(DuelFragment frag)
        {
            var state = frag.Mutation.State;
            if (placementIdx > state.GetPlayer(player).Units.Length)
            {
                placementIdx = state.GetPlayer(player).Units.Length;
            }

            return FragDeltaOpt(frag, new PlaceUnitDelta
            {
                Player = player,
                Position = placementIdx,
                Unit = unit
            });
        }
    }

    // Switch turn does not draw cards.
    private DuelFragmentFunc FragSwitchTurn(PlayerIndex player)
    {
        return new DuelFragmentFunc(new SwitchTurnFragKind(player), Frag);

        DuelFragment Frag(DuelFragment frag)
        {
            var state = frag.Mutation.State;
            var nextTurn = state.Turn + 1;
            var energy = Math.Min(Settings.MaxEnergy, state.GetPlayer(player).MaxEnergy + 1);

            frag = FragDeltaOpt(frag, new SwitchTurnDelta
            {
                NewTurn = nextTurn,
                WhoPlays = player,
                NewEnergy = energy
            });

            // Refresh all units inaction turns and action count
            state = frag.Mutation.State;
            var changes = state.GetPlayer(player).Units
                .Select(x => state.Units[x])
                .Select(x => new UpdateBoardAttribsDelta.AttribChange(x.Id,
                    x.Attribs with
                    {
                        InactionTurns = Math.Max(0, x.Attribs.InactionTurns - 1),
                        ActionsLeft = x.Attribs.ActionsPerTurn
                    }))
                .ToImmutableArray();

            frag = FragDeltaOpt(frag, new UpdateBoardAttribsDelta
            {
                Attribs = changes
            });

            return frag;
        }
    }

    private DuelFragmentFunc FragDrawDeckCards(PlayerIndex player, int num)
    {
        var kind = new DrawDeckCardsFragKind(player, num);
        return new DuelFragmentFunc(kind, Frag);

        DuelFragment Frag(DuelFragment frag)
        {
            return FragDeltaOpt(frag, new DrawDeckCardsDelta
            {
                Num = PlayerPair.ForPlayer(player, num)
            });
        }
    }

    private DuelFragmentFunc FragAttackUnit(int unitId, DuelTarget target)
    {
        return new DuelFragmentFunc(new AttackUnitFragKind(unitId, target), Frag);

        DuelFragment Frag(DuelFragment frag)
        {
            var state = frag.Mutation.State;
            var atkUnit = state.Units.GetValueOrDefault(unitId);

            if (atkUnit is null)
            {
                return frag.Failed();
            }

            var attack = atkUnit.Attribs.Attack;
            if (attack == 0)
            {
                return frag.Failed();
            }

            frag = PartHurtEntity(frag, new UnitDuelSource(atkUnit.Id), target, attack, out var success);
            if (success)
            {
                if (target is UnitDuelTarget { UnitId: var defUnitId })
                {
                    var defU = frag.Mutation.State.Units[defUnitId];
                    if (defU.Attribs.Attack > 0)
                    {
                        frag = PartHurtEntity(frag, new UnitDuelSource(defUnitId), new UnitDuelTarget(atkUnit.Id),
                            defU.Attribs.Attack, out _);
                    }
                }

                return frag;
            }
            else
            {
                return frag.Failed();
            }
        }
    }

    private DuelFragmentFunc FragUnitConsumeAction(int unitId)
    {
        return new DuelFragmentFunc(new UnitConsumeActionFragKind(unitId), Frag);

        DuelFragment Frag(DuelFragment frag)
        {
            var state = frag.State;
            var unit = state.Units.GetValueOrDefault(unitId);

            if (unit is null || unit.Attribs.ActionsLeft <= 0)
            {
                return frag.Failed();
            }

            var change = new UpdateBoardAttribsDelta.AttribChange(unitId, unit.Attribs with
            {
                ActionsLeft = unit.Attribs.ActionsLeft - 1
            });

            frag = FragDeltaOpt(frag, new UpdateBoardAttribsDelta
            {
                Attribs = ImmutableArray.Create(change)
            }, out var success);
            
            if (success)
            {
                return frag;
            }
            else
            {
                return frag.Failed();
            }
        }
    }

    // Utilities for applying fragments
    private (DuelMutation mut, DuelFragmentResult res) ApplyFragEx(DuelMutation mut, DuelFragmentFunc func)
    {
        var scope = func.Kind.Scope;

        mut = HandlePreFragment(mut, func.Kind);
        if (scope is not null)
        {
            mut = mut.Apply(scope with { State = ScopeDelta.ScopeState.Start }).ThrowIfFailed();
        }

        var frag = func.Func(new DuelFragment(func.Kind, mut));
        mut = frag.Mutation;

        mut = HandlePostFragment(mut, func.Kind);
        if (scope is not null)
        {
            mut = mut.Apply(scope with { State = ScopeDelta.ScopeState.End }).ThrowIfFailed();
        }

        return (mut, frag.Result);
    }

    private DuelMutation ApplyFrag(DuelMutation mut, DuelFragmentFunc func)
    {
        return ApplyFragEx(mut, func).mut;
    }

    // Apply a delta to a fragment, and raise any events. 
    private Result<DuelFragment> FragDelta(DuelFragment frag, DuelStateDelta delta)
    {
        return frag.Apply(delta).Map(x =>
        {
            var actions = HandleDeltaApplied(x, delta);
            _logger.LogTrace("Applying delta {Delta} to fragment {Frag}, with actions: {Actions}",
                delta, x.Kind, string.Join(", ", actions.Select(a => a.Name)));
            return x.EnqueueActions(actions);
        });
    }

    private DuelFragment FragDeltaOpt(DuelFragment frag, DuelStateDelta delta, out bool success)
    {
        var res = FragDelta(frag, delta);
        if (res.SucceededWith(out var f))
        {
            success = true;
            return f;
        }
        else
        {
            success = false;
            return frag;
        }
    }

    private DuelFragment FragDeltaOpt(DuelFragment frag, DuelStateDelta delta)
    {
        return FragDeltaOpt(frag, delta, out _);
    }
}

public sealed record DuelFragment(DuelFragmentKind Kind, DuelMutation Mutation)
{
    public ImmutableQueue<DuelAction> QueuedActions { get; init; }
        = ImmutableQueue<DuelAction>.Empty;

    public DuelFragmentResult Result { get; init; } = new();

    public DuelState State => Mutation.State;

    public Result<DuelFragment> Apply(DuelStateDelta delta)
    {
        return Mutation.Apply(delta).Map(m => this with { Mutation = m });
    }

    public DuelFragment EnqueueActions(IEnumerable<DuelAction> act)
    {
        var queued = QueuedActions;
        foreach (var item in act)
        {
            queued = queued.Enqueue(item);
        }

        return this with { QueuedActions = queued };
    }

    public DuelFragment Failed()
    {
        return this with { Result = new DuelFragmentResult { Success = false } };
    }
}

public readonly record struct DuelFragmentFunc(DuelFragmentKind Kind, Func<DuelFragment, DuelFragment> Func);

public abstract record DuelFragmentKind
{
    public ScopeDelta? Scope { get; init; } = null;
}

public sealed record PlayCardFragKind(int CardId) : DuelFragmentKind;

public sealed record PlaceUnitFragKind(DuelUnit Unit) : DuelFragmentKind;

public sealed record SwitchTurnFragKind(PlayerIndex Who) : DuelFragmentKind;

public sealed record DrawDeckCardsFragKind(PlayerIndex Player, int Num) : DuelFragmentKind;

public sealed record AttackUnitFragKind(int UnitId, DuelTarget Target) : DuelFragmentKind;

public sealed record UnitConsumeActionFragKind(int UnitId) : DuelFragmentKind;

public sealed record CustomFragKind : DuelFragmentKind;

public record DuelFragmentResult
{
    public bool Success { get; init; } = true;
}