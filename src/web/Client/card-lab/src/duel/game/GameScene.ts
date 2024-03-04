import {Scene} from "../scene.ts";
import {DuelGame} from "../duel.ts";
import {Viewport} from "pixi-viewport";
import {Card, CardInteractionModule} from "./Card.ts";
import {Hand} from "./Hand.ts";
import {UnitSlotGrid} from "./UnitSlotGrid.ts";
import {Graphics} from "pixi.js";
import {CardPreviewOverlay} from "./CardPreviewOverlay.ts";

export const GAME_WIDTH = 720;
export const GAME_HEIGHT = 1440;

const HAND_Y = -90;

const VIEWPORT_Y_POS = -30;

const SEP_LINE_WIDTH = 620;

export class GameScene extends Scene {
    viewport: Viewport;

    myHand: Hand;
    advHand: Hand;
    hands: Hand[]; // per player index

    myUnitSlotGrid: UnitSlotGrid;
    advUnitSlotGrid: UnitSlotGrid | null = null;
    unitSlotGrids: UnitSlotGrid[]; // per player index
    
    cardPreviewOverlay: CardPreviewOverlay;

    cards: Card[] = [];
    
    cardInteraction = new CardInteractionModule(this);

    constructor(game: DuelGame, public readonly playerIndex: number) {
        super(game);

        this.viewport = new Viewport({
            worldWidth: GAME_WIDTH,
            worldHeight: GAME_HEIGHT,
            events: game.app.renderer.events
        })
        this.viewport.sortableChildren = true
        this.game.app.renderer.on("resize", this.resizeViewport.bind(this));
        this.resizeViewport();

        // const funRect = new PIXI.Graphics()
        // funRect.lineStyle({width: 3, color: 0x000000, alpha: 0.35})
        // funRect.drawRect(0, 0, this.viewport.worldWidth, this.viewport.worldHeight)
        // this.viewport.addChild(funRect)

        const pack = this.game.registry.packs[0]
        const cards = Array.from(pack.cards.values())
        function randCard() { return cards[Math.floor(Math.random() * cards.length)] }

        this.myHand = new Hand(this, false);
        this.myHand.x = GAME_WIDTH / 2;
        this.myHand.y = GAME_HEIGHT - HAND_Y;

        for (let i = 0; i < 8; i++) {
            const spawned = this.spawnCard(new Card(this, Card.dataFromCardRef({
                packId: pack.id,
                cardId: randCard().id
            }, this.game, false), true))

            this.myHand.addCard(spawned)
        }

        this.advHand = new Hand(this, true);
        this.advHand.x = GAME_WIDTH / 2;
        this.advHand.y = HAND_Y;

        for (let i = 0; i < 4; i++) {
            const spawned = this.spawnCard(new Card(this, {type: "faceDown"}, false))

            this.advHand.addCard(spawned)
        }

        this.hands = playerIndex == 0 ? [this.myHand, this.advHand] : [this.advHand, this.myHand];

        this.myUnitSlotGrid = new UnitSlotGrid(this);
        this.myUnitSlotGrid.x = GAME_WIDTH / 2;
        this.myUnitSlotGrid.y = GAME_HEIGHT - 500;
        this.viewport.addChild(this.myUnitSlotGrid);
        
        const sepLine = new Graphics();
        sepLine.lineStyle({width: 2, color: 0x000000})
        sepLine.moveTo(0, 0)
        sepLine.lineTo(620, 0)
        sepLine.y = 735;
        sepLine.x = (GAME_WIDTH - SEP_LINE_WIDTH) / 2;
        this.viewport.addChild(sepLine)

        this.advUnitSlotGrid = new UnitSlotGrid(this);
        this.advUnitSlotGrid.x = GAME_WIDTH / 2;
        this.advUnitSlotGrid.y = 525;
        this.viewport.addChild(this.advUnitSlotGrid);

        this.unitSlotGrids = playerIndex == 0 ? [this.myUnitSlotGrid, this.advUnitSlotGrid]
            : [this.advUnitSlotGrid, this.myUnitSlotGrid];
        
        this.cardPreviewOverlay = new CardPreviewOverlay(this)
        this.viewport.addChild(this.cardPreviewOverlay)
        
        this.addChild(this.viewport);
    }

    resizeViewport() {
        this.viewport.resize(this.game.app.screen.width, this.game.app.screen.height)
        this.viewport.fitWorld()
        this.viewport.moveCenter(this.viewport.worldWidth / 2, this.viewport.worldHeight / 2)
        this.viewport.y = VIEWPORT_Y_POS;
    }

    spawnCard(card: Card) {
        const c = this.viewport.addChild(card);
        this.cards.push(c);
        return c;
    }
}