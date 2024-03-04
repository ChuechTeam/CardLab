import {Container, Graphics, Point} from "pixi.js";
import type {GameScene} from "./GameScene.ts";
import {Card, CardVisualData} from "./Card.ts";

const CARD_HEIGHT_SCREEN_PERCENT = 0.5;
const CARD_OFFSET_SCREEN_PERCENT = 0.07;

// Should be placed at 0, 0
export class CardPreviewOverlay extends Container {
    active = false;
    
    background: Graphics;
    
    // The special thing here is that the card is NOT in world space, but in viewport space!
    card: Card | null = null;
    
    stage: Container;
    
    constructor(public scene: GameScene) {
        super();
        
        this.eventMode = "none";
        this.zIndex = 10;
        this.stage = scene.game.app.stage;
        
        // extend a grey pixel into INFINITY
        this.background = new Graphics();
        this.background.beginFill(0x000000, 0.5);
        this.background.drawRect(0, 0, 1, 1);
        this.background.scale.set(100000, 100000);
        // Put it far enough just in case the camera moves
        this.background.position.set(-10000, -10000);
        this.addChild(this.background);
        
        this.visible = false
    }
    
    show(vis: CardVisualData) {
        if (this.active && this.card) {
            // we're going to replace it with our new card.
            this.card.destroy();
        }
        
        this.visible = true;
        this.active = true;
        
        this.card = new Card(this.scene, vis, false);
        
        const cardSize = new Point(this.card.bounds.width, this.card.bounds.height);
        const screen = this.scene.game.app.screen;
        
        const scale = (screen.height * CARD_HEIGHT_SCREEN_PERCENT) / cardSize.y;
        this.card.scale.set(scale);
        
        const worldY = this.scene.viewport.toScreen(0, 
            this.scene.viewport.worldHeight * (0.5 - CARD_OFFSET_SCREEN_PERCENT)).y;
        
        this.card.x = screen.width / 2;
        this.card.y = worldY;
        
        this.stage.addChild(this.card);
        
        //this.addChild(this.card);
    }
    
    hide() {
        this.visible = false;
        this.active = false;
        if (this.card) {
            this.card.destroy();
            this.card = null;
        }
    }
}