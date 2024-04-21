import {GameScene} from "src/duel/game/GameScene.ts";
import {LocalDuelArenaPosition, LocalDuelCard, LocalDuelUnit, UnknownLocalDuelCard} from "src/duel/control/state.ts";
import {Card, CardControlMode, CardVisualData} from "src/duel/game/Card.ts";
import {DuelController} from "src/duel/control/controller.ts";
import {Unit, UnitVisualData} from "src/duel/game/Unit.ts";
import {AttrCompMode, AttrState, attrStateCompare} from "src/duel/game/AttrState.ts";

// Creates all the avatars of the game, i.e., the visual representations of the cards and units.
// Note that the player is represented as the core.
export class GameAvatars {
    constructor(public scene: GameScene, public controller: DuelController) {
    }

    get cards() {
        return this.scene.cards;
    }

    get units() {
        return this.scene.units;
    }

    get cores() {
        return this.scene.cores;
    }

    findEntity(entityId: number) {
        return this.scene.findEntity(entityId)
    }

    findCard(cardId: DuelCardId) {
        return this.scene.cards.get(cardId)
    }

    spawnCard(card: LocalDuelCard): Card {
        const avatar = new Card(this.scene, this.makeCardVisualData(card), this.getCardControlMode(card));
        avatar.updatePropositions(this.controller.propositions.card.get(card.id));
        this.scene.spawnCard(card.id, avatar);
        return avatar;
    }

    getCardControlMode(c: number | LocalDuelCard): CardControlMode {
        const cardState = typeof c === "object" ? c : this.controller.state.cards.get(c);
        const player = this.controller.playerIndex;

        if (cardState === undefined || cardState instanceof UnknownLocalDuelCard) {
            return CardControlMode.NONE;
        } else if (cardState.location === "handP1" && player === 0
            || cardState.location === "handP2" && player === 1) {
            return CardControlMode.MY_HAND;
        } else if (cardState.location === "handP1" && player === 1
            || cardState.location === "handP2" && player === 0) {
            return CardControlMode.ADV_HAND;
        } else {
            return CardControlMode.NONE;
        }
    }

    findUnit(unitId: DuelUnitId) {
        return this.scene.units.get(unitId)
    }

    spawnUnit(unit: LocalDuelUnit): Unit {
        const slotW = this.scene.myUnitSlotGrid.slotWidth;
        const slotH = this.scene.myUnitSlotGrid.slotHeight;

        const avatar = new Unit(this.scene, this.makeUnitVisualData(unit), slotW, slotH);
        this.scene.spawnUnit(unit.id, avatar);
        return avatar;
    }

    findSlot(pos: LocalDuelArenaPosition) {
        const grid = this.scene.unitSlotGrids[pos.player];
        return grid.slotAt(pos.vec.x, pos.vec.y);
    }

    makeUnitVisualData(unit: LocalDuelUnit): UnitVisualData {
        const card = unit.originRef
        const def = this.scene.game.registry.findCard(card)!.definition;
        return {
            image: this.scene.game.assets.getCardTextureOrFallback(unit.originRef)!,
            attack: unit.attribs.attack,
            attackState: attrStateCompare(AttrCompMode.MORE_IS_BETTER, def.attack, unit.attribs.attack),
            health: unit.attribs.health,
            healthState: unitHealthAttrState(unit.attribs.health, unit.attribs.maxHealth, def.health),
            associatedCardData: this.makeCardVisualDataFromAsset(card)
        }
    }

    makeCardVisualData(card: LocalDuelCard): CardVisualData {
        if (card.type === 'unknown') {
            return {
                type: "faceDown",
            }
        } else {
            const asset = this.scene.game.registry.findCard(card.defAssetRef)!;
            const img = this.scene.game.assets.getCardTextureOrFallback(card.defAssetRef)!;

            const common = {
                name: asset.definition.name,
                image: img,
                description: asset.definition.description,
                cost: card.attribs.cost,
                costState: attrStateCompare(AttrCompMode.LESS_IS_BETTER, asset.definition.cost, card.attribs.cost),
                author: asset.definition.author
            }

            if (card.isOfType("unit")) {
                return {
                    type: "unit",
                    ...common,
                    attack: card.attribs.attack,
                    attackState: attrStateCompare(AttrCompMode.MORE_IS_BETTER, asset.definition.attack, card.attribs.attack),
                    health: card.attribs.health,
                    healthState: attrStateCompare(AttrCompMode.MORE_IS_BETTER, asset.definition.health, card.attribs.health),
                    archetype: asset.definition.archetype
                }
            } else {
                return {
                    type: "spell",
                    ...common,
                }
            }
        }
    }

    makeCardVisualDataFromAsset(asset: CardAssetRef): CardVisualData {
        const assetDef = this.scene.game.registry.findCard(asset)!;
        const img = this.scene.game.assets.getCardTextureOrFallback(asset)!;

        return {
            type: assetDef.definition.type,
            name: assetDef.definition.name,
            image: img,
            description: assetDef.definition.description,
            author: assetDef.definition.author,
            cost: assetDef.definition.cost,
            costState: AttrState.NEUTRAL,
            attack: assetDef.definition.attack,
            attackState: AttrState.NEUTRAL,
            health: assetDef.definition.health,
            healthState: AttrState.NEUTRAL,
            archetype: assetDef.definition.archetype
        }
    }
}

export function unitHealthAttrState(health: number, maxHealth: number, cardHealth: number) {
    if (health < maxHealth) {
        return AttrState.NERFED;
    } else if (health <= cardHealth) {
        return AttrState.NEUTRAL;
    } else {
        return AttrState.BUFFED;
    }
}