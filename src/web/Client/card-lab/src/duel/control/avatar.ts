import {GameScene} from "src/duel/game/GameScene.ts";
import {LocalDuelCard} from "src/duel/control/state.ts";
import {Card, CardVisualData} from "src/duel/game/Card.ts";

// Creates all the avatars of the game, i.e., the visual representations of the cards and units.
// Note that the player is represented as the core.
export class GameAvatars {
    constructor(public scene: GameScene) {
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
    
    findCard(cardId: DuelCardId) {
        return this.scene.cards.get(cardId)
    }
    
    spawnCard(card: LocalDuelCard): Card {
        const avatar = new Card(this.scene, this.makeCardVisualData(card), card.type !== "unknown");
        this.scene.spawnCard(card.id, avatar);
        return avatar;
    }
    
    findUnit(unitId: DuelUnitId) {
        return this.scene.units.get(unitId)
    }
    
    // todo: spawnUnit
    
    
    
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