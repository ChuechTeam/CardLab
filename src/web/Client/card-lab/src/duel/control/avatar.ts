import {GameScene} from "src/duel/game/GameScene.ts";
import {LocalDuelArenaPosition, LocalDuelCard, LocalDuelUnit} from "src/duel/control/state.ts";
import {Card, CardVisualData} from "src/duel/game/Card.ts";
import {DuelController} from "src/duel/control/controller.ts";
import {Unit, UnitVisualData} from "src/duel/game/Unit.ts";

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
        const avatar = new Card(this.scene, this.makeCardVisualData(card), card.type !== "unknown");
        avatar.updatePropositions(this.controller.propositions.card.get(card.id) ?? null);
        this.scene.spawnCard(card.id, avatar);
        return avatar;
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
        return {
            image: this.scene.game.assets.getCardTexture(unit.originRef)!,
            attack: unit.attribs.attack,
            health: unit.attribs.health,
            wounded: unit.attribs.health < unit.attribs.maxHealth
        }
    }
    
    makeCardVisualData(card: LocalDuelCard): CardVisualData {
        if (card.type === 'unknown') {
            return {
                type: "faceDown",
            }
        } else if (card.type === 'unit') {
            const asset = this.scene.game.registry.findCard(card.defAssetRef)!;
            const img = this.scene.game.assets.getCardTexture(card.defAssetRef)!;
            return {
                type: "unit",
                name: asset.definition.name,
                image: img,
                attack: card.attribs.attack,
                health: card.attribs.health,
                description: asset.definition.description,
                cost: card.attribs.cost,
            }
        } else {
            throw new Error("Invalid card type");
        }
    }
}