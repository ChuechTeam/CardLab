using System.Collections.Immutable;
using System.Runtime.CompilerServices;
using NuGet.Packaging;

namespace CardLab.Game.Duels;

// Fragments represent an atomic change to the game state.
// Events can be triggered before and after a fragment is run.
// Events triggered during an event queue other fragments to run after it.

public sealed partial class Duel
{
    public sealed class FragUseCard(int cardId, PlayerIndex player) : DuelFragment
    {
        protected override bool Verify()
        {
            var playerSt = State.GetPlayer(player);
            if (!playerSt.Hand.Contains(cardId))
            {
                return false;
            }

            var card = State.FindCard(cardId)!;
            if (playerSt.Attribs[Attributes.Energy] < card.Attribs[Duel.Attributes.Cost])
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

            ApplyFrag(new FragSetAttribute(playerSt.Id, Attributes.Energy,
                playerSt.Attribs[Attributes.Energy] - card.Attribs[Attributes.Cost]));

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

    public sealed class FragSpawnUnit(PlayerIndex player, int cardId, DuelArenaPosition placementPos) : DuelFragment
    {
        protected override bool Verify()
        {
            if (!placementPos.Vec.Valid(Duel))
            {
                return false;
            }

            if (State.GetPlayer(placementPos.Player).Units[placementPos.Vec.ToIndex(Duel)] != null)
            {
                // todo: give options to choose randomly or not place the unit.
                return false;
            }

            if (State.FindCard(cardId) is not UnitDuelCard)
            {
                return false;
            }

            return true;
        }

        protected override bool Run()
        {
            var card = (UnitDuelCard)State.FindCard(cardId)!;
            var res = ApplyDelta(new PlaceUnitDelta
            {
                Player = player,
                Position = placementPos,
                Unit = Duel.MakeUnit(card, player)
            });

            return res.Succeeded;
        }
    }

    // Switch turn does not draw cards.
    public sealed class FragSwitchTurn(PlayerIndex player) : DuelFragment
    {
        protected override bool Run()
        {
            var state = State;
            var nextTurn = state.Turn + 1;
            var energy = Math.Min(Duel.Settings.MaxEnergy, state.GetPlayer(player).Attribs[Attributes.MaxEnergy] + 1);

            ApplyDelta(new SwitchTurnDelta
            {
                NewTurn = nextTurn,
                WhoPlays = player
            });

            var pid = DuelIdentifiers.Create(DuelEntityType.Player, (int)player);
            ApplyFrag(new FragSetAttribute(pid, Attributes.Energy, energy));
            ApplyFrag(new FragSetAttribute(pid, Attributes.MaxEnergy, energy));

            // Refresh all units inaction turns and action count
            foreach (var id in state.GetPlayer(player).ExistingUnits)
            {
                var u = State.FindUnit(id)!;

                // We don't use FragSetAttribute here just because events aren't needed here.
                var apt = u.Attribs[Attributes.ActionsPerTurn];
                Mutation.SetAttributeBaseValue(u, Attributes.ActionsLeft, apt, out _);

                var it = u.Attribs[Attributes.InactionTurns];
                if (it > 0)
                {
                    Mutation.SetAttributeBaseValue(u, Attributes.InactionTurns, apt, out _);
                }
            }

            return true;
        }
    }

    public sealed class FragDrawDeckCards(PlayerIndex player, int num) : DuelFragment
    {
        public override ScopeDelta? Scope => new CardDrawScopeDelta(player);

        protected override bool Verify()
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
    public sealed class FragAttackUnit(int unitId, int targetId, bool friendlyFire = false) : DuelFragment
    {
        public override ScopeDelta? Scope { get; } = new UnitAttackScopeDelta(unitId, targetId);

        protected override bool Verify()
        {
            var attacker = State.FindUnit(unitId);
            if (attacker is null)
            {
                return false;
            }

            var defender = State.FindEntity(targetId);
            if (defender is null or not DuelUnit or DuelPlayerState)
            {
                return false;
            }

            if (unitId == targetId)
            {
                return false;
            }

            var attack = attacker.Attribs[Attributes.Attack];
            if (attack == 0)
            {
                return false;
            }

            if (!friendlyFire &&
                (defender is DuelUnit u && u.Owner == attacker.Owner
                 || defender is DuelPlayerState p && p.Index == attacker.Owner))
            {
                return false;
            }

            return true;
        }

        protected override bool Run()
        {
            var attacker = State.FindUnit(unitId)!;
            var attack = attacker.Attribs[Attributes.Attack];

            var result = ApplyFrag(new FragHurtEntity(unitId, targetId, attack));
            if (result == DuelFragmentResult.Success)
            {
                if (DuelIdentifiers.TryExtractType(targetId, out var type) && type is DuelEntityType.Unit)
                {
                    ApplyFrag(new FragHurtEntity(unitId, targetId, attack));
                }

                return true;
            }
            else
            {
                return false;
            }
        }
    }

    public sealed class FragUnitConsumeAction(int unitId) : DuelFragment
    {
        protected override bool Verify()
        {
            var unit = State.FindUnit(unitId);

            if (unit is null || unit.Attribs[Attributes.ActionsLeft] <= 0)
            {
                return false;
            }

            return true;
        }

        protected override bool Run()
        {
            var unit = State.FindUnit(unitId)!;
            var newActions = unit.Attribs[Attributes.ActionsLeft] - 1;
            Mutation.SetAttributeBaseValue(unit, Attributes.ActionsLeft, newActions, out _);

            return true;
        }
    }

    // todo: return the number of units killed?
    public sealed class FragKillUnits(ImmutableArray<int> unitIds, int? sourceId, bool guessSource = true)
        : DuelFragment
    {
        public override ScopeDelta? Scope { get; } = new DeathScopeDelta();

        protected override bool Run()
        {
            var existing = ImmutableArray.CreateBuilder<int>(unitIds.Length);

            foreach (var id in unitIds)
            {
                if (State.Units.TryGetValue(id, out var unit))
                {
                    existing.Add(id);

                    var srcId = sourceId ?? (guessSource ? unit.LastDamageSourceId : null);
                    Duel.HandlePostDeath(this, State.FindEntity(srcId ?? -1), unit);
                }
            }

            ApplyDelta(new RemoveUnitDelta
            {
                RemovedIds = existing.ToImmutable()
            });

            return existing.Count > 0;
        }
    }

    public sealed class FragSwitchToPlay : DuelFragment
    {
        protected override bool Verify()
            => State.Status is DuelStatus.AwaitingConnection;

        protected override bool Run()
        {
            ApplyDelta(new SwitchStatusDelta { Status = DuelStatus.Playing });
            return true;
        }
    }

    public sealed class FragHurtEntity(int sourceId, int targetId, int damage) : DuelFragment
    {
        public override bool UseParentQueue { get; set; } = true;

        protected override bool Verify()
        {
            if (damage < 0)
            {
                return false;
            }

            var source = State.FindEntity(sourceId);
            if (source is null)
            {
                return false;
            }

            var entity = State.FindEntity(targetId);
            switch (entity)
            {
                case DuelUnit unit:
                    if (unit.Attribs[Attributes.Health] <= 0)
                    {
                        return false;
                    }

                    break;
                case DuelPlayerState player:
                    if (player.Attribs[Attributes.CoreHealth] <= 0)
                    {
                        return false;
                    }

                    break;
                default:
                    return false;
            }

            return true;
        }

        protected override bool Run()
        {
            var source = State.FindEntity(sourceId)!;
            var entity = State.FindEntity(targetId);
            switch (entity)
            {
                case DuelUnit unit:
                {
                    if (unit.Attribs[Attributes.Health] <= 0)
                    {
                        return false;
                    }


                    var newHp = unit.Attribs[Attributes.Health] - damage;
                    ApplyFrag(new FragSetAttribute(unit.Id, Attributes.Health, newHp));
                    unit.LastDamageSourceId = source.Id; // update the damage source for death event.

                    break;
                }
                case DuelPlayerState player:
                {
                    var coreHp = player.Attribs[Attributes.CoreHealth];
                    if (coreHp <= 0)
                    {
                        return false;
                    }

                    ApplyFrag(new FragSetAttribute(player.Id, Attributes.CoreHealth, coreHp - damage));
                    break;
                }
                default:
                    return false;
            }

            Duel.HandlePostHurt(this, source, entity, damage);
            return true;
        }
    }

    // The main fragment for changing any attribute of an entity.
    public sealed class FragSetAttribute(int id, DuelAttributeDefinition def, int value, bool create = false)
        : DuelFragment
    {
        public override bool UseParentQueue { get; set; } = true;

        protected override bool Verify()
        {
            return State.FindEntity(id) is { } entity && (create || entity.Attribs.Registered(def));
        }

        protected override bool Run()
        {
            var entity = State.FindEntity(id)!;
            var attribs = entity.Attribs;

            if (create)
            {
                attribs.Register(def);
            }

            // Some special rules for certain attributes.
            if (def == Attributes.Health)
            {
                value = Math.Clamp(value, 0, attribs[Attributes.MaxHealth]);
            }
            else if (def == Attributes.Energy)
            {
                value = Math.Clamp(value, 0, Duel.Settings.MaxEnergy);
            }

            var oldValue = attribs[def];
            Mutation.SetAttributeBaseValue(entity, def, value, out var newValue);
            if (oldValue != newValue)
            {
                // Reapply max/min bounds.

                if (def == Attributes.MaxHealth && attribs[Attributes.Health] > newValue)
                {
                    var prevHp = attribs[Attributes.Health];
                    Mutation.SetAttributeBaseValue(entity, Attributes.Health, newValue, out _);
                    Duel.HandlePostAttributeChange(this, entity, def, prevHp, newValue);
                }
                else
                {
                    if (def == Attributes.MaxEnergy && attribs[Attributes.Energy] > newValue)
                    {
                        var prevEnergy = attribs[Attributes.Energy];
                        Mutation.SetAttributeBaseValue(entity, Attributes.Energy, prevEnergy, out _);
                        Duel.HandlePostAttributeChange(this, entity, def, prevEnergy, newValue);
                    }
                }

                Duel.HandlePostAttributeChange(this, entity, def, oldValue, newValue);
            }

            return true;
        }
    }

    // Pretty much the core of any game action.
    public DuelFragmentResult ApplyFrag2(DuelMutation mut, DuelFragment frag)
    {
        // Check if we can run the fragment beforehand.
        if (!frag.Verify(this))
        {
            return DuelFragmentResult.VerifyFailed;
        }

        // Apply the scope if it exists.
        if (frag.Scope is { } sc)
        {
            mut.Apply(sc);
        }

        var deltaNum = mut.Deltas.Count;

        // Trigger any events before this fragment runs.
        // This event handler can run other fragments directly, with the parent set to the current fragment.
        HandlePreFragment(mut, frag);

        if (mut.Deltas.Count > deltaNum)
        {
            // Some events triggered during preparation, notify the client if we want to.
            if (frag.Scope != null)
            {
                mut.Apply(new ScopePreparationEndDelta());
            }
        }

        var result = frag.Run(this, mut);

        // The fragment is considered "done" when it's run function has been called.
        // If it failed during run, most likely that some events modified the game state in a way
        // that made the fragment invalid.
        // ...But stuff might still have happened!
        if (result is DuelFragmentResult.Success or DuelFragmentResult.RunFailed)
        {
            // Right now we don't differentiate between a failed-during-run result and successful result.
            KillZeroHealthUnits(mut);
            HandlePostFragment(mut, frag);
        }

        if (frag.Scope != null)
        {
            mut.Apply(new ScopeEndDelta(result != DuelFragmentResult.Success));
        }

        // Run all queued fragments as children of the parent fragment.
        foreach (var action in frag.QueuedFragments)
        {
            action.Parent = frag.Parent;
            mut.ApplyFrag(action);
        }

        return result;
    }

    private void KillZeroHealthUnits(DuelMutation mut)
    {
        var toKill = State.Units.Values
            .Where(x => x.Attribs[Attributes.Health] <= 0 && !x.DeathPending)
            .Select(x => x.Id)
            .ToImmutableArray();

        if (toKill.Length > 0)
        {
            foreach (var id in toKill)
            {
                State.Units[id].DeathPending = true;
            }

            mut.ApplyFrag(new FragKillUnits(toKill, null));
        }
    }
}

public abstract class DuelFragment
{
    public DuelFragment? Parent { get; set; } = null;
    public Queue<DuelFragment> QueuedFragments { get; } = new();

    // Should be true for fragments that shouldn't be considered 
    // as independent actions, but rather as part of a parent fragment.
    public virtual bool UseParentQueue { get; set; } = false;

    public Duel Duel { get; private set; } = null!;
    public DuelState State => Duel.State;
    public DuelAttributes Attributes => Duel.Attributes;
    public DuelMutation Mutation { get; private set; } = null!;

    public virtual ScopeDelta? Scope { get; } = null;

    public void EnqueueFragment(DuelFragment frag)
    {
        if (UseParentQueue && Parent is not null)
        {
            Parent.EnqueueFragment(frag);
        }
        else
        {
            QueuedFragments.Enqueue(frag);
        }
    }

    public DuelFragmentResult Run(Duel duel, DuelMutation mutation)
    {
        Duel = duel;
        Mutation = mutation;

        if (!Verify())
        {
            return DuelFragmentResult.VerifyFailed;
        }

        if (!Run())
        {
            return DuelFragmentResult.RunFailed;
        }

        return DuelFragmentResult.Success;
    }

    public bool Verify(Duel duel)
    {
        Duel = duel;

        return Verify();
    }

    protected abstract bool Run();

    protected virtual bool Verify() => true;

    public Result<Unit> ApplyDelta(DuelStateDelta delta)
    {
        return Mutation.Apply(delta);
    }

    public DuelFragmentResult ApplyFrag(DuelFragment frag, bool? useMyQueue = null)
    {
        frag.Parent = this;
        if (useMyQueue is { } umq)
        {
            frag.UseParentQueue = umq;
        }

        return Duel.ApplyFrag2(Mutation, frag);
    }
}

public enum DuelFragmentResult
{
    Success,
    VerifyFailed,
    RunFailed
}