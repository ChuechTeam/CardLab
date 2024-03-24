import {Scene} from "../scene.ts";
import {DuelGame} from "../duel.ts";
import {Viewport} from "pixi-viewport";
import {Card} from "./Card.ts";
import {Hand} from "./Hand.ts";
import {GRID_HEIGHT, UNITS_NUM_X, UNITS_NUM_Y, UnitSlot, UnitSlotGrid} from "./UnitSlotGrid.ts";
import {ContainerEvents, EventEmitter, Graphics} from "pixi.js";
import {CardPreviewOverlay} from "./CardPreviewOverlay.ts";
import {Core} from "./Core.ts";
import {EnergyCounter} from "./EnergyCounter.ts";
import {TurnButton} from "./TurnButton.ts";
import {TurnIndicator} from "./TurnIndicator.ts";
import {MessageBanner} from "./MessageBanner.ts";
import {Unit} from "src/duel/game/Unit.ts";
import {InteractionModule} from "src/duel/game/InteractionModule.ts";

export const GAME_WIDTH = 720;
export const GAME_HEIGHT = 1440;

const HAND_Y = -90;

const VIEWPORT_Y_POS = -30;

const SEP_LINE_WIDTH = 620;

// The Y position, relative to the hand, of the player info/control zone, 
// containing the core, energy, buttons, etc.
const PLAYER_ZONE_BASELINE = 320;
type AnyEvent = {
    [K: ({} & string) | ({} & symbol)]: any;
};
export class GameScene extends Scene implements EventEmitter<ContainerEvents & AnyEvent & { a: [] }> {
    viewport: Viewport;

    myHand: Hand;
    advHand: Hand;
    hands: Hand[]; // per player index

    myUnitSlotGrid: UnitSlotGrid;
    advUnitSlotGrid: UnitSlotGrid;
    unitSlotGrids: UnitSlotGrid[]; // per player index

    myCore: Core;
    advCore: Core;
    cores: Core[]; // per player index

    myEnergyCounter: EnergyCounter;
    advEnergyCounter: EnergyCounter;
    energyCounters: EnergyCounter[]; // per player index

    turnButton: TurnButton;

    myTurnIndicator: TurnIndicator;
    advTurnIndicator: TurnIndicator;
    turnIndicators: TurnIndicator[]; // per player index

    cardPreviewOverlay: CardPreviewOverlay;
    messageBanner: MessageBanner;

    cards = new Map<DuelCardId, Card>();
    units = new Map<DuelUnitId, Unit>();

    interaction = new InteractionModule(this);

    private viewportResizeObs: ResizeObserver

    constructor(game: DuelGame, public readonly playerIndex: number, public debugScene: boolean) {
        super(game);

        this.viewport = new Viewport({
            worldWidth: GAME_WIDTH,
            worldHeight: GAME_HEIGHT,
            events: game.app.renderer.events
        })
        this.viewport.sortableChildren = true
        // we're forced to use a resize observer here.
        this.viewportResizeObs = new ResizeObserver(this.resizeViewport.bind(this))
        this.viewportResizeObs.observe(this.game.app.canvas)
        this.resizeViewport();

        // In case you want to see the viewport boundaries
        // const funRect = new PIXI.Graphics()
        // funRect.lineStyle({width: 3, color: 0x000000, alpha: 0.35})
        // funRect.drawRect(0, 0, this.viewport.worldWidth, this.viewport.worldHeight)
        // this.viewport.addChild(funRect)

        this.myHand = new Hand(this, playerIndex == 0 ? 0 : 1, false);
        this.myHand.x = GAME_WIDTH / 2;
        this.myHand.y = GAME_HEIGHT - HAND_Y;

        this.advHand = new Hand(this, playerIndex == 0 ? 1 : 0, true);
        this.advHand.x = GAME_WIDTH / 2;
        this.advHand.y = HAND_Y;

        this.hands = playerIndex == 0 ? [this.myHand, this.advHand] : [this.advHand, this.myHand];

        const baselineMargin = 20;

        this.myCore = new Core(this, 99);
        this.myCore.x = baselineMargin + this.myCore.width / 2;
        this.myCore.y = this.myHand.y - 320;
        this.viewport.addChild(this.myCore);

        this.advCore = new Core(this, 99);
        this.advCore.x = GAME_WIDTH - baselineMargin - this.myCore.width / 2;
        this.advCore.y = this.advHand.y + 320;
        this.viewport.addChild(this.advCore);

        this.cores = playerIndex == 0 ? [this.myCore, this.advCore] : [this.advCore, this.myCore];

        this.myEnergyCounter = new EnergyCounter(this, 99, 99);
        this.myEnergyCounter.y = this.myHand.y - PLAYER_ZONE_BASELINE;
        this.myEnergyCounter.x = GAME_WIDTH - baselineMargin - this.myEnergyCounter.width / 2;
        this.viewport.addChild(this.myEnergyCounter);

        this.advEnergyCounter = new EnergyCounter(this, 99, 99);
        this.advEnergyCounter.y = this.advHand.y + PLAYER_ZONE_BASELINE;
        this.advEnergyCounter.x = baselineMargin + this.advEnergyCounter.width / 2;
        this.viewport.addChild(this.advEnergyCounter);

        this.energyCounters = playerIndex == 0 ?
            [this.myEnergyCounter, this.advEnergyCounter] : [this.advEnergyCounter, this.myEnergyCounter];

        this.turnButton = new TurnButton(this);
        this.turnButton.y = this.myHand.y - PLAYER_ZONE_BASELINE;
        this.turnButton.x = GAME_WIDTH / 2;
        this.viewport.addChild(this.turnButton);

        this.myTurnIndicator = new TurnIndicator(this, "player", debugScene);
        this.myTurnIndicator.y = this.myHand.y - PLAYER_ZONE_BASELINE - 115;
        this.myTurnIndicator.x = 0;
        this.myTurnIndicator.zIndex = -100;
        this.viewport.addChild(this.myTurnIndicator);

        this.advTurnIndicator = new TurnIndicator(this, "opponent", debugScene);
        this.advTurnIndicator.y = this.advHand.y + PLAYER_ZONE_BASELINE + 80;
        this.advTurnIndicator.x = 0;
        this.advTurnIndicator.zIndex = -100;
        this.viewport.addChild(this.advTurnIndicator);

        this.turnIndicators = playerIndex == 0 ?
            [this.myTurnIndicator, this.advTurnIndicator] : [this.advTurnIndicator, this.myTurnIndicator];

        const myGridY = GAME_HEIGHT - 540;
        const gridSpacing = 80;

        this.myUnitSlotGrid = new UnitSlotGrid(this, this.playerIndex, false);
        this.myUnitSlotGrid.x = GAME_WIDTH / 2;
        this.myUnitSlotGrid.y = myGridY;
        this.viewport.addChild(this.myUnitSlotGrid);

        this.advUnitSlotGrid = new UnitSlotGrid(this, 1 - this.playerIndex, true);
        this.advUnitSlotGrid.x = GAME_WIDTH / 2;
        this.advUnitSlotGrid.y = myGridY - GRID_HEIGHT - gridSpacing;
        this.viewport.addChild(this.advUnitSlotGrid);

        const sepLine = new Graphics()
            .moveTo(0, 0)
            .lineTo(620, 0)
            .stroke({width: 2, color: 0x000000});
        sepLine.y = myGridY - (GRID_HEIGHT + gridSpacing) / 2;
        sepLine.x = (GAME_WIDTH - SEP_LINE_WIDTH) / 2;
        this.viewport.addChild(sepLine)

        this.messageBanner = new MessageBanner(this);
        this.messageBanner.x = GAME_WIDTH / 2;
        this.messageBanner.y = sepLine.y;
        this.viewport.addChild(this.messageBanner);

        if (this.debugScene) {
            this.messageBanner.show(
                "Salut tout le monde !!", 20);
        }

        this.unitSlotGrids = playerIndex == 0 ? [this.myUnitSlotGrid, this.advUnitSlotGrid]
            : [this.advUnitSlotGrid, this.myUnitSlotGrid];

        this.cardPreviewOverlay = new CardPreviewOverlay(this)
        this.viewport.addChild(this.cardPreviewOverlay)

        if (debugScene) {
            this.spawnDebugEntities()
        }

        this.addChild(this.viewport);
    }

    resizeViewport() {
        this.viewport.resize(this.game.app.screen.width, this.game.app.screen.height)
        this.viewport.fitWorld()
        this.viewport.moveCenter(this.viewport.worldWidth / 2, this.viewport.worldHeight / 2)
        this.viewport.y = VIEWPORT_Y_POS;
    }

    spawnCard(id: DuelCardId, card: Card) {
        if (this.cards.has(id)) {
            throw new Error("Duplicate id.");
        }
        const c = this.viewport.addChild(card);
        this.cards.set(id, c);
        card.id = id;
        card.on("destroyed", () => this.cards.delete(id));

        // by default, put it in an out-of-screen place.
        c.x = -9999;
        c.y = -9999;
        return c;
    }

    spawnUnit(id: DuelUnitId, unit: Unit) {
        if (this.units.has(id)) {
            throw new Error("Duplicate id.");
        }
        const u = this.viewport.addChild(unit);
        this.units.set(id, u);
        unit.on("destroyed", () => this.units.delete(id));

        // by default, put it in an out-of-screen place.
        u.x = -9999;
        u.y = -9999;
        return u;
    }

    end() {
        this.viewportResizeObs.disconnect();
    }

    spawnDebugEntities() {
        const pack = this.game.registry.packs[0]
        const cards = Array.from(pack.cards.values())

        function randCard() {
            return cards[Math.floor(Math.random() * cards.length)]
        }

        for (let i = 0; i < 8; i++) {
            const spawned = this.spawnCard(i, new Card(this, Card.dataFromCardRef({
                packId: pack.id,
                cardId: randCard().id
            }, this.game, false), true))
            spawned.updatePropositions({ allowedSlots: [] } as any); // quite the hack

            this.myHand.addCard(spawned)
        }

        for (let i = 0; i < 4; i++) {
            const spawned = this.spawnCard(1024 + i, new Card(this, {type: "faceDown"}, false))

            this.advHand.addCard(spawned)
        }

        for (let i = 0; i < UNITS_NUM_Y; i++) {
            for (let j = 0; j < UNITS_NUM_X; j++) {
                const slots = [this.myUnitSlotGrid.slotAt(j, i), this.advUnitSlotGrid.slotAt(j, i)]
                for (const slot of slots) {
                    const card = randCard();
                    const unit = new Unit(this, {
                        image: this.game.assets.getCardTexture({packId: pack.id, cardId: card.id})!,
                        attack: card.definition.attack,
                        health: card.definition.health
                    }, slot.width, slot.height);
                    unit.position = slot.worldPos;
                    this.viewport.addChild(unit);
                }
            }
        }
    }

    showTurnIndicator(idx: 0 | 1) {
        this.turnIndicators[idx].show()
        this.turnIndicators[1 - idx].hide()
    }
    
    unregisterCardEarly(card: Card) {
        this.cards.delete(card.id);
    }
}