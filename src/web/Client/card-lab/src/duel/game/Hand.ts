﻿import {Container, Point} from "pixi.js";
import {GameScene} from "./GameScene.ts";
import {Card} from "./Card.ts";

// Ultimately, a hand is just a horizontal line of uniformly distributed cards.
// We could have some sort of arced shape, but it's complicated to set up and frankly,
// it's weird to have in portrait mode.

// The X coordinate is the center of the line.

const HAND_CARD_Z = 100;

export class Hand extends Container {
    cards: Card[] = [];

    constructor(public scene: GameScene, public readonly playerIndex: number, public readonly flipped: boolean) {
        super();
    }

    addCard(card: Card, reposition = true, idx=0) {
        if (this.cards.includes(card)) {
            return
        }
        
        this.cards.splice(idx, 0, card);
        if (reposition) {
            this.repositionCards();
        }
    }

    cardGone(card: Card) {
        const idx = this.cards.indexOf(card);
        if (idx == -1) {
            return
        }
        
        this.cards.splice(idx, 1);
        this.repositionCards();
    }
    
    repositionCards(instant=false) {
        if (this.cards.length == 1) {
            this.cards[0].moveToHand(new Point(this.position.x, this.position.y), HAND_CARD_Z, this.flipped, this, instant);
            return
        }

        const xStart = -this.lineWidth / 2
        // We need to subtract 1 as the first card is already placed correctly,
        // else for 2 cards we'd have -lw/2 then 0
        const xInc = this.lineWidth / (this.cards.length - 1)

        // we're assuming cards belong in world space
        for (let i = 0; i < this.cards.length; i++) {
            const card = this.cards[i];
            const pos = this.toWorld(new Point(xStart + xInc * i, 0))
            card.moveToHand(pos, HAND_CARD_Z - i, this.flipped, this, instant);
        }
    }

    // Also applied flipped transformation
    toWorld(p: Point) {
        // 1. Apply flipped transform
        if (this.flipped) {
            p.x = -p.x;
        }
        // 2. Convert to world space (assuming Hand is in the world)
        return new Point(p.x + this.position.x, p.y + this.position.y)
    }

    get lineWidth() {
        if (this.cards.length == 2) {
            // having too much spacing between two cards feels awkward
            return 210;
        } else {
            return 390;
        }
    }
}