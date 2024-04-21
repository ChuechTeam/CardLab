import {Container, Graphics, Point, Rectangle, Text} from "pixi.js";
import type {GameScene} from "./GameScene.ts";
import {Card, CardControlMode, CardVisualData} from "./Card.ts";
import {placeInRectCenter} from "src/duel/util.ts";

const CARD_HEIGHT_SCREEN_PERCENT = 0.5;
const CARD_OFFSET_SCREEN_PERCENT = 0.08;

// Should be placed at 0, 0
export class CardPreviewOverlay extends Container {
    active = false;

    background: Graphics;

    // The special thing here is that the card is NOT in world space, but in viewport space!
    card: Card | null = null;
    // Same thing with the text!
    tapToCloseBg: Graphics;
    tapToCloseText: Text;
    // Again the same thing!!!
    authorBg: Graphics;
    authorText: Text;

    stage: Container;
    tapToClose = false
    hasAuthor = false

    constructor(public scene: GameScene) {
        super();

        this.eventMode = "none"; // can change later
        this.boundsArea = new Rectangle(0, 0, 100000, 100000);
        this.zIndex = 10;
        this.stage = scene.game.app.stage;

        // extend a grey pixel into INFINITY
        this.background = new Graphics()
            .rect(0, 0, 1, 1)
            .fill({color: 0x000000, alpha: 0.5});
        this.background.scale.set(100000, 100000);
        // Put it far enough just in case the camera moves
        this.background.position.set(-10000, -10000);
        this.addChild(this.background);

        // Viewport-space elements

        const resolution = this.scene.game.app.renderer.resolution
        this.tapToCloseText = new Text({
            resolution: resolution*1.5,
            style: {
                fontFamily: "Chakra Petch",
                fontSize: 20,
                fill: 0xffffff,
            }
        });
        this.tapToCloseText.text = "(Touchez l'écran pour revenir au jeu)"
        this.tapToCloseText.visible = false;

        this.tapToCloseBg = new Graphics()
            .rect(0, 0, this.tapToCloseText.width + 30, this.tapToCloseText.height + 20)
            .fill({color: 0x000000});
        this.tapToCloseBg.pivot.set(this.tapToCloseBg.width / 2, this.tapToCloseBg.height / 2);

        this.tapToCloseText.eventMode = "none";
        this.tapToCloseBg.eventMode = "none";

        this.authorBg = new Graphics()
            .rect(0, 0, 1, 1)
            .fill({color: 0x000000});

        this.authorText = new Text({
            resolution: resolution*1.5,
            style: {
                fontFamily: "Chakra Petch",
                fontSize: 17,
                fill: 0xffffff,
            }
        });

        this.authorBg.eventMode = "none";
        this.authorText.eventMode = "none";

        this.visible = false
        this.on("pointertap", this.onTap, this)
    }

    show(vis: CardVisualData, tapToClose = false) {
        if (this.active && this.card) {
            // we're going to replace it with our new card.
            this.card.destroy();
        }

        this.visible = true;
        this.active = true;

        this.card = new Card(this.scene, vis, CardControlMode.NONE);
        this.card.eventMode = "none";

        const cardSize = new Point(this.card.bounds.width, this.card.bounds.height);
        const screen = this.scene.game.app.screen;

        const scale = (screen.height * CARD_HEIGHT_SCREEN_PERCENT) / cardSize.y;
        this.card.scale.set(scale);

        const worldY = this.scene.viewport.toScreen(0,
            this.scene.viewport.worldHeight * (0.5 - CARD_OFFSET_SCREEN_PERCENT)).y;

        this.card.x = screen.width / 2;
        this.card.y = worldY;

        this.stage.addChild(this.card);

        const cardBot = this.card.y + cardSize.y*scale / 2;
        
        const infoRect = new Rectangle(0, cardBot+8, screen.width, 25);
        if ("author" in vis && vis.author !== null) {
            const author = vis.author
            
            this.hasAuthor = true

            this.authorText.text = `Carte réalisée par ${author}`;
            placeInRectCenter(this.authorText, infoRect, false);

            const margin = 7;
            this.authorBg.x = this.authorText.x - margin;
            this.authorBg.y = this.authorText.y - margin;
            this.authorBg.scale.x = this.authorText.width + margin*2;
            this.authorBg.scale.y = this.authorText.height + margin*2;

            this.stage.addChild(this.authorBg)
            this.stage.addChild(this.authorText)
            
            infoRect.y += 50;
        }
        
        this.tapToClose = tapToClose;
        if (tapToClose) {
            this.eventMode = "static";
            this.zIndex = 9999; // a bit hacky...

            this.tapToCloseText.visible = true;
            this.tapToCloseBg.visible = true;

            placeInRectCenter(this.tapToCloseText, infoRect, true);

            this.tapToCloseBg.x = this.tapToCloseText.x + this.tapToCloseText.width / 2;
            this.tapToCloseBg.y = this.tapToCloseText.y + this.tapToCloseText.height / 2;

            // make sure it is at the top
            this.stage.addChild(this.tapToCloseBg)
            this.stage.addChild(this.tapToCloseText)
        } else {
            this.eventMode = "none";
            this.zIndex = 10;
        }
    }

    hide() {
        this.visible = false;
        this.active = false;
        if (this.card) {
            this.card.destroy();
            this.card = null;
        }

        if (this.tapToClose) {
            this.stage.removeChild(this.tapToCloseText)
            this.stage.removeChild(this.tapToCloseBg)
        }
        if (this.hasAuthor) {
            this.stage.removeChild(this.authorBg)
            this.stage.removeChild(this.authorText)
            this.hasAuthor = false
        }
    }

    onTap() {
        if (this.tapToClose) {
            this.hide();
        }
    }
}