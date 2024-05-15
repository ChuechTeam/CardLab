using System.Collections.Immutable;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;
using CardLab.Game.AssetPacking;

namespace CardLab.Game.Duels;

// Fragments represent an atomic change to the game state.
// Events can be triggered before and after a fragment is run.
// Events triggered during an event queue other fragments to run after it.

public sealed partial class Duel
{
    public sealed class FragUseCard(int cardId, PlayerIndex player) : DuelFragment
    {
        public PlayerIndex Player { get; set; } = player;

        public static bool CanUseInHand(Duel duel, int cardId, PlayerIndex player)
        {
            var playerSt = duel.State.GetPlayer(player);
            var card = duel.State.FindCard(cardId)!;
            return playerSt.Attribs.GetEnergy() >= card.Attribs.GetCost();
        }

        protected override bool Verify()
        {
            var playerSt = State.GetPlayer(Player);
            if (!playerSt.Hand.Contains(cardId))
            {
                return false;
            }

            var card = State.FindCard(cardId)!;
            if (playerSt.Attribs.GetEnergy() < card.Attribs.GetCost())
            {
                return false;
            }

            return true;
        }

        protected override bool Run()
        {
            // todo: better validation.
            var playerSt = State.GetPlayer(Player);
            var card = State.FindCard(cardId)!;

            ApplyFrag(new FragSetAttribute(playerSt.Id, DuelBaseAttrs.Energy,
                playerSt.Attribs[DuelBaseAttrs.Energy] - card.Attribs[DuelBaseAttrs.Cost]));

            ApplyDelta(new RevealCardsDelta
            {
                Changes = [(cardId, new PlayerPair<bool>(true))]
            });

            ApplyFrag(new FragMoveCard(cardId, DuelCardLocation.Discarded, 0));

            return true;
        }
    }

    public sealed class FragSpawnUnit(
        PlayerIndex player,
        int cardId,
        DuelArenaPosition placementPos,
        DuelCard? virtualCard = null) : DuelFragment
    {
        public Action<DuelUnit>? Configure { get; init; } = null;

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

            if (placementPos.Player != player)
            {
                return false;
            }

            if (virtualCard is null && State.FindCard(cardId) is null)
            {
                return false;
            }

            var card = (State.FindCard(cardId) ?? virtualCard)!;
            if (card.Type != CardType.Unit)
            {
                return false;
            }

            return true;
        }

        protected override bool Run()
        {
            var card = (State.FindCard(cardId) ?? virtualCard)!;
            var unit = Duel.MakeUnit(card, player);
            var res = ApplyDelta(new PlaceUnitDelta
            {
                Player = player,
                Position = placementPos,
                Unit = unit
            });
            Configure?.Invoke(unit);
            if (unit.Script != null)
            {
                State.ActiveScripts.Add(unit.Script);
                unit.Script.Active = true;
                unit.Script?.PostSpawn(this);
            }

            return res.Succeeded;
        }
    }

    // Switch turn does not draw cards.
    public sealed class FragSwitchTurn(PlayerIndex player) : DuelFragment
    {
        public PlayerIndex Player { get; } = player;

        protected override bool Run()
        {
            var state = State;
            var nextTurn = state.Turn + 1;
            var energy = Math.Min(Duel.Settings.MaxEnergy, state.GetPlayer(Player).Attribs.GetMaxEnergy() + 1);

            ApplyDelta(new SwitchTurnDelta
            {
                NewTurn = nextTurn,
                WhoPlays = Player
            });

            NotifyScriptableEntities();

            var pid = DuelIdentifiers.Create(DuelEntityType.Player, (int)Player);
            ApplyFrag(new FragSetAttribute(pid, DuelBaseAttrs.MaxEnergy, energy));
            ApplyFrag(new FragSetAttribute(pid, DuelBaseAttrs.Energy, energy));
            ApplyFrag(new FragSetAttribute(pid, DuelBaseAttrs.CardsPlayedThisTurn, 0));

            // Refresh all units inaction turns and action count
            foreach (var id in state.GetPlayer(Player).ExistingUnits)
            {
                var u = State.FindUnit(id)!;

                var apt = u.Attribs.GetActionsPerTurn();
                ApplyFrag(new FragSetAttribute(u.Id, DuelBaseAttrs.ActionsLeft, apt));

                var it = u.Attribs.GetInactionTurns();
                if (it > 0)
                {
                    ApplyFrag(new FragSetAttribute(u.Id, DuelBaseAttrs.InactionTurns, it - 1));
                }
            }

            // Decrement turns remaining from all temporary modifiers
            var expiredMods = new List<int>();
            foreach (var k in State.Modifiers.Keys)
            {
                ref var mod = ref CollectionsMarshal.GetValueRefOrNullRef(state.Modifiers, k);
                mod.TurnsRemaining--;

                // Sounds weird to not check before,
                // but non-temporary modifiers already have a duration of -1, so decrementing the amount
                // of turns remaining won't expire them. It avoids us to do nested branches.
                if (mod.TurnsRemaining == 0)
                {
                    expiredMods.Add(k);
                }
            }

            if (expiredMods.Count != 0)
            {
                ApplyFrag(new FragRemoveModifiers(expiredMods));
            }

            Mutation.StartTurnTimer(Duel.Settings.SecondsPerTurn);
            return true;
        }

        private void NotifyScriptableEntities()
        {
            foreach (var script in State.ActiveScripts)
            {
                script.PostTurnChange(this, State.WhoseTurn, State.WhoseTurn, State.Turn);
            }
        }
    }

    public sealed class FragDrawCards(PlayerIndex player, int deckNum, int? specificCardId = null) : DuelFragment
    {
        public PlayerIndex Player { get; } = player;
        public int DeckNum { get; } = deckNum;
        public int? SpecificCardId { get; } = specificCardId;

        public int SuccessfulNum { get; private set; } = 0;
        public int? LastDrawnCardId { get; private set; } = null;

        public override ScopeDelta Scope => new CardDrawScopeDelta(Player);

        protected override bool Verify()
        {
            if (DeckNum == 0)
            {
                if (SpecificCardId is not { } id
                    || State.FindCard(id) is not { } card
                    || card.Location != PlayerDeckLoc(Player))
                {
                    return false;
                }
            }

            return true;
        }

        protected override bool Run()
        {
            var ps = State.GetPlayer(Player);
            var playerHand = Player == PlayerIndex.P1 ? DuelCardLocation.HandP1 : DuelCardLocation.HandP2;
            int i = 0;
            for (; i < DeckNum; i++)
            {
                // The deck can change if we have events that trigger when we draw a card.
                if (ps.Deck.Count == 0)
                {
                    ApplyDelta(new ShowMessageDelta("Aucun carte restante dans le deck ! Le joueur subit des dégats.",
                        2000, 1500));
                    ApplyFrag(new FragHurtEntity(null, ps.Id, 2, "deck_empty"));
                    break;
                }

                var cardId = ps.Deck[^1];
                var success = TryMovingToHand(ps, cardId, playerHand);

                if (success)
                {
                    SuccessfulNum++;
                    LastDrawnCardId = cardId;
                }
            }

            if (SpecificCardId is not null)
            {
                if (TryMovingToHand(ps, SpecificCardId.Value, playerHand))
                {
                    SuccessfulNum++;
                    LastDrawnCardId = SpecificCardId;
                }
            }

            return SuccessfulNum > 0;
        }

        private bool TryMovingToHand(DuelPlayerState ps, int cardId, DuelCardLocation playerHand)
        {
            bool success;
            if (ps.Hand.Count < Duel.Settings.MaxCardsInHand)
            {
                success = ApplyFrag(new FragMoveCard(cardId, playerHand, 0)) == DuelFragmentResult.Success;
            }
            else
            {
                ApplyFrag(new FragMoveCard(cardId, DuelCardLocation.Discarded, 0));
                success = true; // might be weird to say this is a success, but technically, the card moved.
            }

            return success;
        }
    }

    public sealed class FragMoveCard(
        int cardId,
        DuelCardLocation newLocation,
        int? index = null,
        bool bothReveal = false) : DuelFragment
    {
        public int CardId { get; } = cardId;
        public DuelCardLocation NewLocation { get; } = newLocation;
        public int? Index { get; } = index;
        public bool BothReveal { get; } = bothReveal;

        public DuelCardLocation PrevLocation { get; private set; } = DuelCardLocation.Temp;

        protected override bool Verify()
        {
            return State.FindCard(CardId) != null;
        }

        protected override bool Run()
        {
            var card = State.FindCard(CardId)!;
            PrevLocation = card.Location;
            if (card.Location == NewLocation)
            {
                return true;
            }

            var revealed = card.Revealed;
            if (BothReveal)
            {
                revealed = new PlayerPair<bool>(true);
            }
            else
            {
                switch (NewLocation)
                {
                    case DuelCardLocation.HandP1:
                        revealed.P1 = true;
                        break;
                    case DuelCardLocation.HandP2:
                        revealed.P2 = true;
                        break;
                    case DuelCardLocation.Discarded:
                        revealed.P1 = true;
                        revealed.P2 = true;
                        break;
                }
            }

            if (revealed != card.Revealed)
            {
                ApplyDelta(new RevealCardsDelta
                {
                    Changes = [(CardId, revealed)]
                });
            }


            ApplyDelta(new MoveCardsDelta
            {
                Changes = [new MoveCardsDelta.Move(CardId, card.Location, NewLocation, Index)]
            });

            // By default, all cards are in the deck, thus their script are disactivated.
            // We'll activate or deactivate them when necessary.
            if (card.Script != null)
            {
                var activated = NewLocation is DuelCardLocation.HandP1 or DuelCardLocation.HandP2;

                if (activated && !card.Script.Active)
                {
                    card.Script.Active = true;
                    State.ActiveScripts.Add(card.Script);
                }
                else if (!activated && card.Script.Active)
                {
                    card.Script.Active = false;
                    State.ActiveScripts.Remove(card.Script);
                }

                // Right now we're calling it even if the script is going from deactivated to deactivated...
                // Shouldn't matter that much.
                card.Script.CardPostMove(this, card.Location, NewLocation);
            }

            return true;
        }
    }

    public sealed class FragCreateCard(
        QualCardRef cardRef,
        DuelCardLocation location,
        Action<DuelCard>? config = null,
        bool bothReveal = false)
        : DuelFragment
    {
        public QualCardRef CardRef { get; } = cardRef;
        public DuelCardLocation Location { get; } = location;

        public int? CreatedCardId { get; private set; } = null;

        protected override bool Verify()
        {
            return Duel.CardDatabase.ContainsKey(CardRef);
        }

        protected override bool Run()
        {
            var card = Duel.MakeCard(CardRef);
            config?.Invoke(card);

            ApplyDelta(new CreateCardsDelta
            {
                Cards = [card]
            });

            if (Location != DuelCardLocation.Temp)
            {
                // todo: inspect how we should better handle flattening here
                ApplyFrag(new FragMoveCard(card.Id, Location, null, bothReveal) { Flatten = true });
            }

            CreatedCardId = card.Id;
            return true;
        }
    }

    // Attacks a unit. Disallows for friendly fire unless stated otherwise.
    public sealed class FragAttackUnit(int unitId, int targetId, bool friendlyFire = false) : DuelFragment
    {
        public int UnitId { get; } = unitId;
        public int TargetId { get; } = targetId;
        public bool FriendlyFire { get; } = friendlyFire;

        public override ScopeDelta? Scope { get; protected set; } = new UnitAttackScopeDelta(unitId, targetId);

        public static bool AttackBlocked(Duel duel, int unitId, int targetId)
        {
            if (unitId == targetId)
            {
                return true;
            }
            
            var attacker = duel.State.FindUnit(unitId);
            if (attacker is null)
            {
                return true;
            }

            var defender = duel.State.FindEntity(targetId);
            
            bool attackingAlly = (defender is DuelUnit u && u.Owner == attacker.Owner
                                  || defender is DuelPlayerState p && p.Index == attacker.Owner);

            if (defender is DuelPlayerState p2)
            {
                if (p2.ExistingUnits.Any() && !attackingAlly)
                {
                    return true;
                }
                else
                {
                    return false;
                }
            }
            else if (defender is DuelUnit u2)
            {
                // Make sure that there isn't any unit in front of the target.
                // This doesn't apply to friendly fire where any unit can attack another

                if (!attackingAlly)
                {
                    var player = duel.State.GetPlayer(u2.Position.Player);
                    var (defX, defY) = u2.Position.Vec;

                    for (int y = defY + 1; y < duel.Settings.UnitsY; y++)
                    {
                        if (player.Units[new DuelGridVec(defX, y).ToIndex(duel)] != null)
                        {
                            return true;
                        }
                    }
                }

                //..And that the unit isn't dying soon.
                if (u2.DeathPending)
                {
                    return true;
                }

                return false;
            }
            else
            {
                return false;
            }
        }

        protected override bool Verify()
        {
            var attacker = State.FindUnit(UnitId);
            if (attacker is null || attacker.DeathPending)
            {
                return false;
            }

            if (UnitId == TargetId)
            {
                return false;
            }

            var attack = attacker.Attribs.GetAttack();
            if (attack == 0)
            {
                return false;
            }

            var defender = State.FindEntity(TargetId);
            if (defender is not DuelUnit && defender is not DuelPlayerState)
            {
                return false;
            }

            var attackingAlly = (defender is DuelUnit u && u.Owner == attacker.Owner
                                 || defender is DuelPlayerState p && p.Index == attacker.Owner);
            if (!FriendlyFire && attackingAlly)
            {
                return false;
            }

            return !AttackBlocked(Duel, attacker.Id, defender.Id);
        }

        protected override bool Run()
        {
            var attacker = State.FindUnit(UnitId)!;
            var myAttack = attacker.Attribs.GetAttack();
            ((UnitAttackScopeDelta)Scope!).Damage = myAttack;

            var result = ApplyFrag(new FragHurtEntity(UnitId, TargetId, myAttack));
            if (result != DuelFragmentResult.Success)
            {
                return false;
            }

            if (State.FindEntity(TargetId) is DuelUnit target)
            {
                // Check if we can apply excess damage. Only apply it when not doing friendly fire.
                var hp = target.Attribs.GetHealth();
                if (hp < 0 && target.Owner != attacker.Owner)
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

                    ApplyFrag(new FragHurtEntity(UnitId, excessTargetId, excessDmg, DuelTags.ExcessDamage));
                }

                // Make the defender attack us back.
                var theirAttack = target.Attribs.GetAttack();
                if (theirAttack > 0)
                {
                    ApplyFrag(new FragHurtEntity(TargetId, UnitId, theirAttack));
                }
            }

            attacker.Script?.UnitPostAttack(this, TargetId);

            return true;
        }
    }

    public sealed class FragUnitConsumeAction(int unitId) : DuelFragment
    {
        protected override bool Verify()
        {
            var unit = State.FindUnit(unitId);

            if (unit is null || unit.Attribs.GetActionsLeft() <= 0)
            {
                return false;
            }

            return true;
        }

        protected override bool Run()
        {
            var unit = State.FindUnit(unitId)!;
            var newActions = unit.Attribs.GetActionsLeft() - 1;
            ApplyFrag(new FragSetAttribute(unit.Id, DuelBaseAttrs.ActionsLeft, newActions));

            return true;
        }
    }

    public sealed class FragDestroyUnit(int unitId, int? sourceId)
        : DuelFragment
    {
        public int UnitId { get; } = unitId;
        public int? SourceId { get; } = sourceId;

        public override ScopeDelta? Scope { get; protected set; } = new DeathScopeDelta();

        protected override bool Run()
        {
            if (State.Units.TryGetValue(UnitId, out var unit))
            {
                ApplyDelta(new RemoveUnitDelta
                {
                    RemovedId = UnitId
                });

                if (unit.Script != null)
                {
                    unit.Script.Eliminate(this);
                    State.ActiveScripts.Remove(unit.Script);
                    unit.Script.Active = false;
                }

                return true;
            }

            return false;
        }
    }

    public sealed class FragShowMessage(string message, int duration, int pauseDuration) : DuelFragment
    {
        public string Message { get; } = message;
        public int Duration { get; } = duration;
        public int PauseDuration { get; } = pauseDuration;

        protected override bool Run()
        {
            ApplyDelta(new ShowMessageDelta(Message, Duration, PauseDuration));
            return true;
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
            Mutation.StopTurnTimer();
            Mutation.QueueEvent(new DuelEndedEvent(winner));
            return true;
        }
    }

    public sealed class FragHurtEntity(int? sourceId, int targetId, int damage, params string[] tags) : DuelFragment
    {
        public int? SourceId { get; } = sourceId;
        public int TargetId { get; set; } = targetId;
        public int Damage { get; set; } = damage;
        public string[] Tags { get; set; } = tags;

        public override ScopeDelta? Scope { get; protected set; } = new DamageScopeDelta(sourceId, targetId, damage)
        {
            Tags = ImmutableArray.Create(tags)
        };

        public override bool Flatten { get; set; } = true;

        protected override bool Verify()
        {
            if (Damage < 0)
            {
                return false;
            }

            var entity = State.FindEntity(TargetId);
            switch (entity)
            {
                case DuelUnit unit:
                    if (unit.Attribs.GetHealth() <= 0)
                    {
                        return false;
                    }

                    break;
                case DuelPlayerState player:
                    if (player.Attribs.GetCoreHealth() <= 0)
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
            int? validSrcId = SourceId is { } i && State.FindEntity(i) != null ? i : null;
            var target = State.FindEntity(TargetId);
            switch (target)
            {
                case DuelUnit unit:
                {
                    if (unit.Attribs.GetHealth() <= 0)
                    {
                        return false;
                    }


                    var newHp = unit.Attribs.GetHealth() - Damage;
                    ApplyFrag(new FragSetAttribute(unit.Id, DuelBaseAttrs.Health, newHp));
                    unit.LastDamageSourceId = validSrcId; // update the damage source for death event.
                    unit.Script?.UnitPostTakeDamage(this, Damage, validSrcId);

                    break;
                }
                case DuelPlayerState player:
                {
                    var coreHp = player.Attribs.GetCoreHealth();
                    if (coreHp <= 0)
                    {
                        return false;
                    }

                    ApplyFrag(new FragSetAttribute(player.Id, DuelBaseAttrs.CoreHealth, coreHp - Damage));
                    break;
                }
                default:
                    return false;
            }

            if (SourceId is { } i2 && State.FindEntity(i2) is DuelUnit attacker)
            {
                attacker.Script?.UnitPostDealDamage(this, Damage, TargetId);
            }

            return true;
        }
    }

    public sealed class FragHealEntity(int? sourceId, int targetId, int value, params string[] tags) : DuelFragment
    {
        public int? SourceId { get; } = sourceId;
        public int TargetId { get; set; } = targetId;
        public int Value { get; set; } = value;
        public string[] Tags { get; set; } = tags;

        public int AppliedValue { get; private set; } = 0;

        public override ScopeDelta? Scope { get; protected set; } = new HealScopeDelta(sourceId, targetId, value)
        {
            Tags = ImmutableArray.Create(tags)
        };

        public override bool Flatten { get; set; } = true;

        protected override bool Verify()
        {
            if (Value < 0)
            {
                return false;
            }

            var entity = State.FindEntity(TargetId);
            switch (entity)
            {
                case DuelUnit unit:
                    if (unit.Attribs.GetHealth() <= 0)
                    {
                        return false;
                    }

                    break;
                case DuelPlayerState player:
                    if (player.Attribs.GetCoreHealth() <= 0)
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
            int? validSrcId = SourceId is { } i && State.FindEntity(i) != null ? i : null;
            var target = State.FindEntity(TargetId);
            switch (target)
            {
                case DuelUnit unit:
                {
                    AppliedValue = Math.Clamp(Value, 0, unit.Attribs.GetMaxHealth() - unit.Attribs.GetHealth());

                    if (AppliedValue != 0)
                    {
                        var newHp = unit.Attribs.GetHealth() + AppliedValue;
                        ApplyFrag(new FragSetAttribute(unit.Id, DuelBaseAttrs.Health, newHp));
                    }

                    unit.Script?.UnitPostReceiveHeal(this, AppliedValue, validSrcId);

                    break;
                }
                case DuelPlayerState player:
                {
                    var coreHp = player.Attribs.GetCoreHealth();
                    AppliedValue = Math.Clamp(Value, 0, Duel.Settings.MaxCoreHealth - coreHp);

                    if (AppliedValue != 0)
                    {
                        ApplyFrag(new FragSetAttribute(player.Id, DuelBaseAttrs.CoreHealth, coreHp + AppliedValue));
                    }

                    break;
                }
                default:
                    return false;
            }

            if (SourceId is { } i2 && State.FindEntity(i2) is DuelUnit attacker)
            {
                attacker.Script?.UnitPostGiveHeal(this, AppliedValue, TargetId);
            }

            return true;
        }
    }

    public sealed class FragUnitTrigger(
        int unitId,
        Action<FragUnitTrigger> action,
        Func<FragUnitTrigger,
            bool>? verifier = null) : DuelFragment
    {
        public int UnitId { get; } = unitId;

        public override ScopeDelta? Scope { get; protected set; } = new UnitTriggerScopeDelta(unitId);

        protected override bool Verify()
        {
            return State.FindUnit(UnitId, true) != null && (verifier?.Invoke(this) ?? true);
        }

        protected override bool Run()
        {
            action(this);
            return true;
        }
    }

    public sealed class FragAlteration(int sourceId, int targetId, bool positive, Action<FragAlteration> action)
        : DuelFragment
    {
        public int? SourceId { get; } = sourceId;
        public int TargetId { get; } = targetId;
        public bool Positive { get; } = positive;

        public override bool Flatten { get; set; } = true;

        public FragAlteration(int sourceId, int targetId, bool positive, List<DuelFragment> fragments) : this(sourceId,
            targetId, positive, f =>
            {
                foreach (var frag in fragments)
                {
                    f.ApplyFrag(frag);
                }
            })
        {
        }

        public override ScopeDelta? Scope { get; protected set; } =
            new AlterationScopeDelta(sourceId, targetId, positive);

        protected override bool Verify()
        {
            return State.FindEntity(TargetId) != null;
        }

        protected override bool Run()
        {
            action(this);
            return true;
        }
    }

    public sealed class FragEffect : DuelFragment
    {
        private readonly Action<FragEffect> _action;
        private readonly EffectScopeDelta _scope;

        public FragEffect(int sourceId, EffectTint tint, Action<FragEffect> action)
        {
            _action = action;
            SourceId = sourceId;
            Targets = new List<int>();
            Scope = _scope = new EffectScopeDelta(sourceId, Targets, tint);
        }

        public FragEffect(int sourceId, EffectTint tint, List<DuelFragment> fragments) : this(sourceId, tint, f =>
        {
            foreach (var frag in fragments)
            {
                f.ApplyFrag(frag);
            }
        })
        {
        }

        // Might be inexistant (eliminated entity)
        public int SourceId { get; }
        public List<int> Targets { get; }
        public bool AutoDetectTargets { get; set; } = true;
        public bool PostponeSideEffects { get; set; } = true;

        public bool DisableTargeting
        {
            get => _scope.DisableTargeting;
            set => _scope.DisableTargeting = value;
        }

        public int StartDelay
        {
            get => _scope.StartDelay;
            set => _scope.StartDelay = value;
        }

        public int EndDelay
        {
            get => _scope.EndDelay;
            set => _scope.EndDelay = value;
        }

        protected override bool Run()
        {
            _action(this);
            return true;
        }

        public new DuelFragmentResult ApplyFrag(DuelFragment frag)
        {
            // Fragments in effect don't incur any side effects.
            if (PostponeSideEffects)
            {
                frag.Flatten = true;
            }

            var res = base.ApplyFrag(frag);
            if (res == DuelFragmentResult.Success && AutoDetectTargets)
            {
                switch (frag)
                {
                    case FragHurtEntity he:
                        AddTarget(he.TargetId);
                        break;
                    case FragHealEntity he2:
                        AddTarget(he2.TargetId);
                        break;
                    case FragAddModifiers am:
                        am.AffectedEntities.ForEach(AddTarget);
                        break;
                    case FragRemoveModifiers rm:
                        rm.AffectedEntities.ForEach(AddTarget);
                        break;
                    case FragDestroyUnit du:
                        AddTarget(du.UnitId);
                        break;
                    case FragSetAttribute sa:
                        AddTarget(sa.EntityId);
                        break;
                    case FragMoveCard mc:
                        AddTarget(mc.CardId);
                        break;
                    case FragAlteration alt:
                        AddTarget(alt.TargetId);
                        break;
                }
            }

            return res;
        }

        public void AddTarget(int t)
        {
            if (!Targets.Contains(t))
            {
                Targets.Add(t);
            }
        }
    }

    public sealed class FragSetAttribute(int id, DuelAttributeId attrId, int value)
        : DuelFragment
    {
        public override bool Flatten { get; set; } = true;
        public int EntityId { get; } = id;
        public DuelAttributeId AttrId { get; } = attrId;
        public int Value { get; } = value;

        protected override bool Verify()
        {
            return State.FindEntity(EntityId) != null;
        }

        protected override bool Run()
        {
            var entity = State.FindEntity(EntityId)!;

            entity.Attribs.ClearPrevVals();
            Duel.AttribSet(entity, AttrId, Value);
            Duel.AttribFinalizeUpdate(this, entity);

            return true;
        }
    }

    public sealed class FragAddModifiers(params DuelModifier[] modifiers) : DuelFragment
    {
        public override bool Flatten { get; set; } = true;

        public List<int> AffectedEntities { get; } = new();

        public List<int> CreatedIds { get; } = new();

        protected override bool Run()
        {
            // note: this isn't optimized for the case where we have multiple entities in one fragment.
            List<DuelAttributeId> attrsToUpdate = new(1);
            List<IEntity> entitiesToUpdate = new(1);
            for (var i = 0; i < modifiers.Length; i++)
            {
                ref var mod = ref modifiers[i];

                var target = State.FindEntity(mod.TargetId);
                if (target is null)
                {
                    continue;
                }

                mod.Id = Duel._modIdSeq++;
                if (mod.SourceId is { } srcId)
                {
                    mod.SourceCard = State.FindEntity(srcId) switch
                    {
                        DuelCard card => card.BaseDefRef,
                        DuelUnit unit => unit.OriginRef,
                        _ => null
                    };
                }

                // Modifiers aren't added through deltas right now
                State.Modifiers.Add(mod.Id, mod);
                target.Modifiers.Add(mod.Id);
                CreatedIds.Add(mod.Id);

                if (!entitiesToUpdate.Contains(target))
                {
                    entitiesToUpdate.Add(target);
                }

                if (!attrsToUpdate.Contains(mod.Attribute))
                {
                    attrsToUpdate.Add(mod.Attribute);
                }
            }

            if (entitiesToUpdate.Count == 0)
            {
                return false;
            }

            foreach (var entity in entitiesToUpdate)
            {
                entity.Attribs.ClearPrevVals();
                foreach (var attr in attrsToUpdate)
                {
                    Duel.AttribSet(entity, attr, null);
                }

                AffectedEntities.Add(entity.Id);
            }

            foreach (var entity in entitiesToUpdate)
            {
                Duel.AttribFinalizeUpdate(this, entity);
            }

            return true;
        }
    }

    public sealed class FragRemoveModifiers(IEnumerable<int> modifiers) : DuelFragment
    {
        public override bool Flatten { get; set; } = true;
        public List<int> AffectedEntities { get; private set; } = new();

        protected override bool Run()
        {
            // note: this isn't optimized for the case where we have multiple entities in one fragment.
            // (though, this time, it should)
            List<DuelAttributeId> attrsToUpdate = new(1);
            List<IEntity> entitiesToUpdate = new(1);
            foreach (var modId in modifiers)
            {
                ref DuelModifier mod = ref CollectionsMarshal.GetValueRefOrNullRef(State.Modifiers, modId);
                if (Unsafe.IsNullRef(ref mod))
                {
                    continue;
                }

                var target = State.FindEntity(mod.TargetId);
                if (target is null)
                {
                    continue;
                }

                // Modifiers aren't removed through deltas right now
                State.Modifiers.Remove(mod.Id);
                target.Modifiers.Remove(mod.Id);

                if (!entitiesToUpdate.Contains(target))
                {
                    entitiesToUpdate.Add(target);
                }

                if (!attrsToUpdate.Contains(mod.Attribute))
                {
                    attrsToUpdate.Add(mod.Attribute);
                }
            }

            if (entitiesToUpdate.Count == 0)
            {
                return false;
            }

            foreach (var entity in entitiesToUpdate)
            {
                entity.Attribs.ClearPrevVals();
                foreach (var attr in attrsToUpdate)
                {
                    Duel.AttribSet(entity, attr, null);
                }

                AffectedEntities.Add(entity.Id);
            }

            foreach (var entity in entitiesToUpdate)
            {
                Duel.AttribFinalizeUpdate(this, entity);
            }

            return true;
        }
    }

    private int AttribClamp(DuelAttributeSetV2 set, DuelAttributeId aid, int val, IEntity entity)
    {
        switch (aid)
        {
            case DuelBaseAttrs.Health:
                return entity is DuelCard ? Math.Max(1, val) : Math.Min(val, set[DuelBaseAttrs.MaxHealth]);
            case DuelBaseAttrs.Energy:
                return Math.Clamp(val, 0, set[DuelBaseAttrs.MaxEnergy]);
            case DuelBaseAttrs.CoreHealth:
                return Math.Min(val, Settings.MaxCoreHealth);
            case DuelBaseAttrs.Cost:
            case DuelBaseAttrs.ActionsLeft:
            case DuelBaseAttrs.Attack:
            case DuelBaseAttrs.MaxEnergy:
            case DuelBaseAttrs.MaxHealth:
            case DuelBaseAttrs.ActionsPerTurn:
                return Math.Max(val, 0);
            default:
                return val;
        }
    }

    private void AttribAdjustMaxOnChange(DuelAttributeSetV2 attribs, DuelAttributeId changed)
    {
        switch (changed.Value)
        {
            case DuelBaseAttrs.MaxHealth:
                if (attribs[DuelBaseAttrs.Health] > attribs[DuelBaseAttrs.MaxHealth])
                {
                    attribs[DuelBaseAttrs.Health] = attribs[DuelBaseAttrs.MaxHealth];
                }

                break;
            case DuelBaseAttrs.MaxEnergy:
                if (attribs[DuelBaseAttrs.Energy] > attribs[DuelBaseAttrs.MaxHealth])
                {
                    attribs[DuelBaseAttrs.Energy] = attribs[DuelBaseAttrs.MaxHealth];
                }

                break;
        }
    }

    // Just updates modifiers when newBase is null
    private (int baseVal, int actualVal) AttribSet(IEntity entity, DuelAttributeId attrId, int? newBase)
    {
        var attribs = entity.Attribs;
        var newerBase = newBase is { } nb ? AttribClamp(attribs, attrId, nb, entity) : attribs.Get(attrId).baseVal;
        var newActual = AttribClamp(attribs, attrId,
            AttribApplyModifiers(attrId, newerBase, entity.Modifiers), entity);

        attribs.Set(attrId, (newerBase, newActual));

        // Reapply max/min bounds.
        AttribAdjustMaxOnChange(attribs, attrId);

        return (newerBase, newActual);
    }

    private void AttribFinalizeUpdate(DuelFragment frag, IEntity entity)
    {
        var attribs = entity.Attribs;

        // Check what attributes changed and notify the client.
        foreach (var (key, (_, prevActual)) in attribs.PrevVals)
        {
            if (prevActual != attribs[key])
            {
                frag.Mutation.RegisterAttrUpdate(entity, key);
            }
        }

        // Raise any event.
        foreach (var (key, (prevBase, prevActual)) in attribs.PrevVals)
        {
            var (nowBase, nowActual) = attribs.Get(key);
            if (prevActual != nowActual)
            {
                HandlePostAttributeChange(frag, entity, key, prevActual, nowActual);
            }

            if (prevBase != nowBase)
            {
                HandlePostAttributeBaseChange(frag, entity, key, prevBase, nowBase);
            }
        }

        attribs.ClearPrevVals();
    }

    private int AttribApplyModifiers(DuelAttributeId attribute, int baseVal, List<int> modifiers)
    {
        var actualVal = baseVal;
        foreach (var m in modifiers)
        {
            var mod = State.Modifiers[m];
            if (mod.Attribute != attribute)
            {
                continue;
            }

            switch (mod.Op)
            {
                case DuelModifierOperation.Add:
                    actualVal += mod.Value;
                    break;
                case DuelModifierOperation.Multiply:
                    actualVal *= mod.Value;
                    break;
                case DuelModifierOperation.Set:
                    actualVal = mod.Value;
                    break;
                default:
                    throw new ArgumentOutOfRangeException();
            }
        }

        return actualVal;
    }

    // Pretty much the core of any game action.
    public DuelFragmentResult ApplyFrag(DuelMutation mut, DuelFragment frag)
    {
        if (!mut.TryGiveFragId(out frag.Id))
        {
            Logger.LogError("Out of fragment ids while running {Fragment}!", frag);
            return DuelFragmentResult.VerifyFailed;
        }

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

        // Trigger any events before this fragment runs.
        // This event handler can run other fragments directly, in respect to the parent's flattening settings.
        var stuffHappened = HandlePreFragment(frag);

        if (stuffHappened)
        {
            // Some events triggered during preparation, notify the client if we want to.
            if (frag.Scope is not null)
            {
                mut.Apply(new ScopePreparationEndDelta());
            }
        }

        DuelFragmentResult result;
        try
        {
            result = frag.Run(this, mut, skipVerify: !stuffHappened);
        }
        catch (Exception e)
        {
            Logger.LogError(e, "Fragment {Fragment} failed with exception", frag.GetType());
            result = DuelFragmentResult.RunFailed;
        }

        // The fragment is considered "done" when it's run function has been called.
        // If it failed during run, most likely that some events modified the game state in a way
        // that made the fragment invalid.
        // ...But stuff might still have happened!
        if (result is DuelFragmentResult.Success or DuelFragmentResult.RunFailed)
        {
            HandlePostFragment(frag, result);
        }

        if (frag.Scope is not null)
        {
            mut.Apply(new ScopeEndDelta(result != DuelFragmentResult.Success));
        }

        // If we aren't a flattened node (meaning we have our own queue of fragments),
        // then run them. Else, the parent fragment will do this.
        if (!frag.Flatten)
        {
            foreach (var action in frag.QueuedFragments)
            {
                if (frag.Parent is { } parent)
                {
                    parent.ApplyFrag(action);
                }
                else
                {
                    mut.ApplyFrag(action);
                }
            }
        }

        return result;
    }

    private void CheckUnitDeath(DuelFragment frag, IEntity entity)
    {
        if (entity is DuelUnit u && u.Attribs.GetHealth() <= 0 && !u.DeathPending)
        {
            State.Units[u.Id].DeathPending = true;
            frag.EnqueueFragment(new FragDestroyUnit(u.Id, u.LastDamageSourceId));
        }
    }

    private void CheckGameWin(DuelFragment frag)
    {
        var p1 = State.GetPlayer(PlayerIndex.P1);
        var p2 = State.GetPlayer(PlayerIndex.P2);

        var (h1, h2) = (p1.Attribs.GetCoreHealth(), p2.Attribs.GetCoreHealth());

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

    public static DuelCardLocation PlayerDeckLoc(PlayerIndex idx)
    {
        return idx switch
        {
            PlayerIndex.P1 => DuelCardLocation.DeckP1,
            PlayerIndex.P2 => DuelCardLocation.DeckP2,
            _ => throw new ArgumentOutOfRangeException(nameof(idx), idx, null)
        };
    }

    public static DuelCardLocation PlayerHandLoc(PlayerIndex idx)
    {
        return idx switch
        {
            PlayerIndex.P1 => DuelCardLocation.HandP1,
            PlayerIndex.P2 => DuelCardLocation.HandP2,
            _ => throw new ArgumentOutOfRangeException(nameof(idx), idx, null)
        };
    }
}

public abstract class DuelFragment
{
    public ushort Id = 0; // Set by ApplyFrag (it's a field because it's looks much more simple for out syntax)

    // Can be set to the parent's queue when Flatten = true
    public Queue<DuelFragment> QueuedFragments { get; private set; } = new();

    // When true, this fragment and all child fragments will be "flattened":
    // all triggers (and children triggers too) will queue fragments to the parent fragment.
    // A flattened fragment cannot be the root of a fragment tree.
    public virtual bool Flatten { get; set; } = false;

    public virtual DuelStatus RequiredStatus { get; set; } = DuelStatus.Playing;

    public DuelFragment? Parent { get; private set; } = null;
    public DuelFragment? TriggeredBy { get; private set; } = null;

    public Duel Duel { get; private set; } = null!;
    public DuelState State => Duel.State;
    public DuelMutation Mutation { get; private set; } = null!;

    public virtual ScopeDelta? Scope { get; protected set; } = null;

    public void EnqueueFragment(DuelFragment frag)
    {
        frag.TriggeredBy = this;
        QueuedFragments.Enqueue(frag);
    }

    public DuelFragmentResult Run(Duel duel, DuelMutation mutation, bool skipVerify)
    {
        Duel = duel;
        Mutation = mutation;

        if (!skipVerify && !Verify())
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

        return Duel.ApplyFrag(Mutation, frag);
    }
}

public enum DuelFragmentResult
{
    Success,
    VerifyFailed,
    RunFailed
}