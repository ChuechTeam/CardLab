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
    public sealed class FragUseCard(int cardId, PlayerIndex player) : DuelFragment2<bool>
    {
        protected override bool Verify(ref bool resultOnErr)
        {
            var playerSt = State.GetPlayer(player);
            if (!playerSt.Hand.Contains(cardId))
            {
                return false;
            }

            var card = State.FindCard(cardId)!;
            if (playerSt.Energy < card.Cost)
            {
                return false;
            }

            return true;
        }

        protected override bool Run()
        {
            // todo: better validation.
            var playerSt = State.GetPlayer(player);
            var card = State.FindCard(cardId)!;

            ApplyDelta(new UpdateEnergyDelta
            {
                Player = player,
                NewEnergy = playerSt.Energy - card.Cost,
                NewMaxEnergy = playerSt.MaxEnergy
            });

            ApplyDelta(new RevealCardsDelta
            {
                Changes = [(cardId, new PlayerPair<bool>(true))]
            });

            ApplyDelta(new MoveCardsDelta
            {
                Changes = [new(cardId, DuelCardLocation.Discarded, null)],
                Context = MoveCardsDelta.Reason.Played
            });

            return true;
        }
    }

    public sealed class FragPlaceUnit(PlayerIndex player, DuelUnit unit, DuelGridVec placementPos) : DuelFragment2<bool>
    {
        protected override bool Verify(ref bool resultOnErr)
        {
            if (!placementPos.Valid(Duel))
            {
                return false;
            }

            if (State.GetPlayer(player).Units[placementPos.ToIndex(Duel)] != null)
            {
                // todo: give options to choose randomly or not place the unit.
                return false;
            }

            return true;
        }

        protected override bool Run()
        {
            var res = ApplyDelta(new PlaceUnitDelta
            {
                Player = player,
                Position = placementPos,
                Unit = unit
            });

            return res.Succeeded;
        }
    }

    // Switch turn does not draw cards.
    public sealed class FragSwitchTurn(PlayerIndex player) : DuelFragment2<Unit>
    {
        protected override Unit Run()
        {
            var state = State;
            var nextTurn = state.Turn + 1;
            var energy = Math.Min(Duel.Settings.MaxEnergy, state.GetPlayer(player).MaxEnergy + 1);

            ApplyDelta(new SwitchTurnDelta
            {
                NewTurn = nextTurn,
                WhoPlays = player
            });

            ApplyDelta(new UpdateEnergyDelta
            {
                Player = player,
                NewEnergy = energy,
                NewMaxEnergy = energy
            });

            // Refresh all units inaction turns and action count
            var units = state.GetPlayer(player).ExistingUnits.ToList();
            if (units.Any())
            {
                var changes = units
                    .Select(x => state.Units[x])
                    .Select(x => new UpdateBoardAttribsDelta.AttribChange(x.Id,
                        x.Attribs with
                        {
                            InactionTurns = Math.Max(0, x.Attribs.InactionTurns - 1),
                            ActionsLeft = x.Attribs.ActionsPerTurn
                        }))
                    .ToImmutableArray();

                ApplyDelta(new UpdateBoardAttribsDelta
                {
                    Attribs = changes
                });
            }

            return default;
        }
    }

    public sealed class FragDrawDeckCards(PlayerIndex player, int num) : DuelFragment2<bool>
    {
        public override ScopeDelta? Scope => new CardDrawScopeDelta(player);

        protected override bool Verify(ref bool resultOnErr)
        {
            var ps = State.GetPlayer(player);
            if (ps.Deck.Count < num)
            {
                return false;
            }

            return true;
        }

        protected override bool Run()
        {
            var ps = State.GetPlayer(player);
            
            var moves = ImmutableArray.CreateBuilder<MoveCardsDelta.Move>(num);
            var reveals = ImmutableArray.CreateBuilder<(int, PlayerPair<bool>)>(num);
            var handEnum = player == PlayerIndex.P1 ? DuelCardLocation.HandP1 : DuelCardLocation.HandP2;

            for (int i = 0; i < num; i++)
            {
                var id = ps.Deck[ps.Deck.Count - i - 1];
                moves.Add(new MoveCardsDelta.Move(id, handEnum, 0));

                var reveal = State.Cards[id].Revealed;
                reveal[player] = true;
                reveals.Add((id, reveal));
            }

            ApplyDelta(new RevealCardsDelta
            {
                Changes = reveals.ToImmutable()
            });

            ApplyDelta(new MoveCardsDelta
            {
                Changes = moves.ToImmutable()
            });

            return true;
        }
    }

    // Attacks a unit. Disallows for friendly fire unless stated otherwise.
    public sealed class FragAttackUnit(int unitId, DuelTarget target, bool friendlyFire = false) : DuelFragment2<bool>
    {
        public override ScopeDelta? Scope { get; } = new UnitAttackScopeDelta(unitId, target);

        protected override bool Verify(ref bool resultOnErr)
        {
            var atkUnit = State.FindUnit(unitId);
            if (atkUnit is null)
            {
                return false;
            }

            var attack = atkUnit.Attribs.Attack;
            if (attack == 0)
            {
                return false;
            }

            if (target is UnitDuelTarget { UnitId: var u } && u == unitId)
            {
                return false;
            }

            if (!friendlyFire)
            {
                switch (target)
                {
                    case UnitDuelTarget { UnitId: var u2 } when State.Units[u2].Owner == atkUnit.Owner:
                    case CoreDuelTarget { Player: var p } when atkUnit.Owner == p:
                        return false;
                }
            }

            return true;
        }

        protected override bool Run()
        {
            var atkUnit = State.FindUnit(unitId)!;
            var attack = atkUnit.Attribs.Attack;

            var success = Duel.PartHurtEntity(this, new UnitDuelSource(atkUnit.Id), target, attack);
            if (success)
            {
                if (target is UnitDuelTarget { UnitId: var defUnitId })
                {
                    var defU = State.Units[defUnitId];
                    if (defU.Attribs.Attack > 0)
                    {
                        Duel.PartHurtEntity(this, new UnitDuelSource(defUnitId), new UnitDuelTarget(atkUnit.Id),
                            defU.Attribs.Attack);
                    }
                }

                return true;
            }
            else
            {
                return false;
            }
        }
    }

    public sealed class FragUnitConsumeAction(int unitId) : DuelFragment2<bool>
    {
        protected override bool Verify(ref bool resultOnErr)
        {
            var unit = State.FindUnit(unitId);

            if (unit is null || unit.Attribs.ActionsLeft <= 0)
            {
                return false;
            }

            return true;
        }

        protected override bool Run()
        {
            var unit = State.FindUnit(unitId)!;
            
            var change = new UpdateBoardAttribsDelta.AttribChange(unitId, unit.Attribs with
            {
                ActionsLeft = unit.Attribs.ActionsLeft - 1
            });

            var res = ApplyDelta(new UpdateBoardAttribsDelta
            {
                Attribs = ImmutableArray.Create(change)
            });

            return res.Succeeded;
        }
    }

    // returns the number of units killed.
    // also used to finish off units that have 0 health.
    public sealed class FragKillUnits(ImmutableArray<int> unitIds, DuelSource? source, bool guessSource = true)
        : DuelFragment2<int>
    {
        public override ScopeDelta? Scope { get; } = new DeathScopeDelta();

        protected override int Run()
        {
            var existing = ImmutableArray.CreateBuilder<int>(unitIds.Length);

            foreach (var id in unitIds)
            {
                if (State.Units.TryGetValue(id, out var unit))
                {
                    existing.Add(id);

                    var src = source ?? (guessSource ? unit.LastDamageSource : null);
                    Duel.HandlePostDeath(this, src, unit);
                }
            }

            ApplyDelta(new RemoveUnitDelta
            {
                RemovedIds = existing.ToImmutable()
            });

            return existing.Count;
        }
    }

    public sealed class FragSwitchToPlay : DuelFragment2<bool>
    {
        protected override bool Verify(ref bool resultOnErr)
            => State.Status is DuelStatus.AwaitingConnection or DuelStatus.ChoosingCards;

        protected override bool Run()
        {
            ApplyDelta(new SwitchStatusDelta { Status = DuelStatus.Playing });
            return true;
        }
    }

    // Pretty much the core of any game action.
    public T ApplyFrag2<T>(DuelMutation mut, IDuelFragment2<T> frag)
    {
        HandlePreFragment(mut, frag);
        if (frag.Scope is { } sc)
        {
            mut.Apply(sc with { State = ScopeDelta.ScopeState.Start }).ThrowIfFailed();
        }

        var ret = frag.Run(this, mut);
        
        KillZeroHealthUnits(mut);
        HandlePostFragment(mut, frag, ret);
        foreach (var action in frag.GetQueuedActions())
        {
            mut.ApplyAct(action);
        }

        if (frag.Scope is { } sc2)
        {
            mut.Apply(sc2 with { State = ScopeDelta.ScopeState.End }).ThrowIfFailed();
        }

        return ret;
    }

    private void KillZeroHealthUnits(DuelMutation mut)
    {
        var toKill = State.Units.Values
            .Where(x => x.Attribs.CurHealth <= 0)
            .Select(x => x.Id)
            .ToImmutableArray();
        
        if (toKill.Length > 0)
        {
            mut.ApplyFrag(new FragKillUnits(toKill, null));
        }
    }
}

public interface IDuelFragment2
{
    public ScopeDelta? Scope { get; }
    public void EnqueueAction(DuelAction act);

    public ImmutableArray<DuelAction> GetQueuedActions();
}

public interface IDuelFragment2<out T> : IDuelFragment2
{
    public T Run(Duel duel, DuelMutation mutation);
}

public abstract class DuelFragment2<T> : IDuelFragment2<T>
{
    public Queue<DuelAction> QueuedActions { get; } = new();

    public Duel Duel { get; private set; } = null!;
    public DuelState State => Duel.State;
    public DuelMutation Mutation { get; private set; } = null!;

    public virtual ScopeDelta? Scope { get; } = null;

    public void EnqueueAction(DuelAction act)
    {
        QueuedActions.Enqueue(act);
    }

    public ImmutableArray<DuelAction> GetQueuedActions()
        => QueuedActions.ToImmutableArray();

    public T Run(Duel duel, DuelMutation mutation)
    {
        Duel = duel;
        Mutation = mutation;
        
        // not very safe... but i don't want to overcomplicate it
        T? result = default;
        if (Verify(ref result))
        {
            result = Run();
        }

        return result!;
    }
    
    public bool Verify(Duel duel)
    {
        Duel = duel;
        
        T? result = default;
        return Verify(ref result);
    }

    protected abstract T Run();

    protected virtual bool Verify(ref T? resultOnErr) => true;

    public Result<Unit> ApplyDelta(DuelStateDelta delta)
    {
        return Mutation.Apply(delta);
    }
}