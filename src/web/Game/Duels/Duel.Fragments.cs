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

            if (unitId == targetId)
            {
                return false;
            }

            var attack = attacker.Attribs[Attributes.Attack];
            if (attack == 0)
            {
                return false;
            }

            var defender = State.FindEntity(targetId);
            if (defender is not DuelUnit && defender is not DuelPlayerState)
            {
                return false;
            }

            if (!friendlyFire &&
                (defender is DuelUnit u && u.Owner == attacker.Owner
                 || defender is DuelPlayerState p && p.Index == attacker.Owner))
            {
                return false;
            }

            if (defender is DuelPlayerState p2)
            {
                if (p2.ExistingUnits.Any())
                {
                    return false;
                }
            }
            else if (defender is DuelUnit u2)
            {
                // Make sure that there isn't any unit in front of the target.
                var player = State.GetPlayer(u2.Position.Player);
                var (defX, defY) = u2.Position.Vec;

                for (int y = defY + 1; y < Duel.Settings.UnitsY; y++)
                {
                    if (player.Units[new DuelGridVec(defX, y).ToIndex(Duel)] != null)
                    {
                        return false;
                    }
                }
            }

            return true;
        }

        protected override bool Run()
        {
            var attacker = State.FindUnit(unitId)!;
            var myAttack = attacker.Attribs[Attributes.Attack];

            var result = ApplyFrag(new FragHurtEntity(unitId, targetId, myAttack));
            if (result != DuelFragmentResult.Success)
            {
                return false;
            }

            if (State.FindEntity(targetId) is DuelUnit target)
            {
                // Check if we can apply excess damage.
                var hp = target.Attribs[Attributes.Health];
                if (hp < 0)
                {
                    var excessDmg = -hp;

                    // Deal damage to the unit/player behind.
                    var defPlayer = State.GetPlayer(target.Position.Player);
                    var (defX, defY) = target.Position.Vec;

                    int excessTargetId = -1;
                    for (int y = defY - 1; y >= 0; y--)
                    {
                        var uid = defPlayer.Units[new DuelGridVec(defX, y).ToIndex(Duel)];
                        if (uid is { } valid)
                        {
                            excessTargetId = valid;
                            break;
                        }
                    }

                    if (excessTargetId == -1)
                    {
                        excessTargetId = defPlayer.Id;
                    }

                    ApplyFrag(new FragHurtEntity(unitId, excessTargetId, excessDmg, DuelTags.ExcessDamage));
                }
                
                // Make the defender attack us back.
                var theirAttack = target.Attribs[Attributes.Attack];
                if (theirAttack > 0)
                {
                    ApplyFrag(new FragHurtEntity(targetId, unitId, theirAttack));
                }
            }

            return true;
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

    public sealed class FragDestroyUnit(int unitId, int? sourceId, bool guessSource)
        : DuelFragment
    {
        public override ScopeDelta? Scope { get; } = new DeathScopeDelta();

        protected override bool Run()
        {
            if (State.Units.TryGetValue(unitId, out var unit))
            {
                var srcId = sourceId ?? (guessSource ? unit.LastDamageSourceId : null);
                Duel.HandlePostDeath(this, State.FindEntity(srcId ?? -1), unit);

                ApplyDelta(new RemoveUnitDelta
                {
                    RemovedId = unitId
                });

                return true;
            }

            return false;
        }
    }

    public sealed class FragSwitchToPlay : DuelFragment
    {
        public override DuelStatus RequiredStatus { get; set; } = DuelStatus.AwaitingConnection;

        protected override bool Run()
        {
            ApplyDelta(new SwitchStatusDelta { Status = DuelStatus.Playing });
            return true;
        }
    }
    
    public sealed class FragSwitchToEnd(PlayerIndex? winner) : DuelFragment
    {
        public override DuelStatus RequiredStatus { get; set; } = DuelStatus.Playing;

        protected override bool Run()
        {
            ApplyDelta(new SwitchStatusDelta { Status = DuelStatus.Ended, Winner = winner });
            return true;
        }
    }

    public sealed class FragHurtEntity(int sourceId, int targetId, int damage, params string[] tags) : DuelFragment
    {
        public override ScopeDelta? Scope { get; } = new DamageScopeDelta(sourceId, targetId, damage)
        {
            Tags = ImmutableArray.Create(tags)
        };

        public override bool Flatten { get; set; } = true;

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
        public override bool Flatten { get; set; } = true;

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
                value = Math.Min(value, attribs[Attributes.MaxHealth]);
            }
            else if (def == Attributes.Energy)
            {
                value = Math.Min(value, Duel.Settings.MaxEnergy);
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
        // This event handler can run other fragments directly, in respect to the parent's flattening settings.
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
            // todo: optimize this to not run that when health doesn't change??
            KillZeroHealthUnits(frag);
            CheckGameWin(frag);
            HandlePostFragment(mut, frag, result);
        }

        if (frag.Scope != null)
        {
            mut.Apply(new ScopeEndDelta(result != DuelFragmentResult.Success));
        }

        // If we aren't a flattened node (meaning we have our own queue of fragments),
        // then run them. Else, the parent fragment will do this.
        if (!frag.Flatten)
        {
            foreach (var action in frag.QueuedFragments)
            {
                mut.ApplyFrag(action);
            }
        }

        return result;
    }

    private void KillZeroHealthUnits(DuelFragment frag)
    {
        var toKill = State.Units.Values
            .Where(x => x.Attribs[Attributes.Health] <= 0 && !x.DeathPending)
            .Select(x => x.Id);

        foreach (var id in toKill)
        {
            State.Units[id].DeathPending = true;
            frag.EnqueueFragment(new FragDestroyUnit(id, null, true));
        }
    }
    
    private void CheckGameWin(DuelFragment frag)
    {
        var p1 = State.GetPlayer(PlayerIndex.P1);
        var p2 = State.GetPlayer(PlayerIndex.P2);
        
        var (h1, h2) = (p1.Attribs[Attributes.CoreHealth], p2.Attribs[Attributes.CoreHealth]);

        if (h1 <= 0 && h2 <= 0)
        {
            frag.EnqueueFragment(new FragSwitchToEnd(null));
        }
        else if (h1 <= 0)
        {
            frag.EnqueueFragment(new FragSwitchToEnd(PlayerIndex.P2));
        }
        else if (h2 <= 0)
        {
            frag.EnqueueFragment(new FragSwitchToEnd(PlayerIndex.P1));
        }
    }
}

public abstract class DuelFragment
{
    // Can be set to the parent's queue when Flatten = true
    public Queue<DuelFragment> QueuedFragments { get; private set; } = new();

    // When true, this fragment and all child fragments will be "flattened":
    // all triggers (and children triggers too) will queue fragments to the parent fragment.
    // A flattened fragment cannot be the root of a fragment tree.
    public virtual bool Flatten { get; set; } = false;
    
    public virtual DuelStatus RequiredStatus { get; set; } = DuelStatus.Playing;

    public DuelFragment? Parent { get; private set; } = null;

    public Duel Duel { get; private set; } = null!;
    public DuelState State => Duel.State;
    public DuelAttributes Attributes => Duel.Attributes;
    public DuelMutation Mutation { get; private set; } = null!;

    public virtual ScopeDelta? Scope { get; } = null;

    public void EnqueueFragment(DuelFragment frag)
    {
        QueuedFragments.Enqueue(frag);
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

        return State.Status == RequiredStatus && Verify();
    }

    protected abstract bool Run();

    protected virtual bool Verify() => true;

    public Result<Unit> ApplyDelta(DuelStateDelta delta)
    {
        return Mutation.Apply(delta);
    }

    public DuelFragmentResult ApplyFrag(DuelFragment frag)
    {
        if (frag.Flatten || Flatten)
        {
            frag.Flatten = true;
            frag.QueuedFragments = this.QueuedFragments;
        }

        frag.Parent = this;

        return Duel.ApplyFrag2(Mutation, frag);
    }
}

public enum DuelFragmentResult
{
    Success,
    VerifyFailed,
    RunFailed
}