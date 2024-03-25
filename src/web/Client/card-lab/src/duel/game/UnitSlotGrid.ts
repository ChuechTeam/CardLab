import {Container, Graphics, Point, Ticker} from "pixi.js";
import {GameScene} from "./GameScene.ts";
import {Unit} from "src/duel/game/Unit.ts";
import {InteractionData, InteractionDataOf, InteractionType} from "src/duel/game/InteractionModule.ts";
import {Card} from "src/duel/game/Card.ts";
import {LocalDuelArenaPosition} from "src/duel/control/state.ts";

export const GRID_WIDTH = 680;
export const GRID_HEIGHT = 310;

// For now, those are constants. We might make this configurable in the future
export const UNITS_NUM_X = 4
export const UNITS_NUM_Y = 2

const SPACING_X = 20
const SPACING_Y = 50

// g = n*u + (n-1)*s
//   = n*(u+s) - s
// ==>  (g+s)/n - s = u

const SLOT_WIDTH = (GRID_WIDTH + SPACING_X) / UNITS_NUM_X - SPACING_X
const SLOT_HEIGHT = (GRID_HEIGHT + SPACING_Y) / UNITS_NUM_Y - SPACING_Y

export class UnitSlotGrid extends Container {
    slots: UnitSlot[] = [] // row-major coordinates (x = idx % num_y, y = idx / num_y)
                           // (in view-space)
    interactionId: number = -1
    selectableSlots: UnitSlot[] = []
    draggedCard: Card | null = null
    selectedSlot: UnitSlot | null = null
    
    slotWidth = SLOT_WIDTH
    slotHeight = SLOT_HEIGHT

    constructor(public scene: GameScene, public playerIndex: number, public reversed: boolean) {
        super();

        this.eventMode = "none"

        this.pivot.set(GRID_WIDTH / 2, GRID_HEIGHT / 2);

        for (let y = 0; y < UNITS_NUM_Y; y++) {
            for (let x = 0; x < UNITS_NUM_X; x++) {
                const pos = {player: playerIndex as LocalDuelPlayerIndex, vec: this.toGameCoords(x, y)};
                const slot = new UnitSlot(scene, pos);
                slot.pivot.set(SLOT_WIDTH / 2, SLOT_HEIGHT / 2)
                slot.position.set(x * (SLOT_WIDTH + SPACING_X) + SLOT_WIDTH / 2,
                    y * (SLOT_HEIGHT + SPACING_Y) + SLOT_HEIGHT / 2)
                this.addChild(slot)

                slot.occupant = null;
                this.slots.push(slot);
            }
        }

        this.on("added", () => {
            for (let slot of this.slots) {
                slot.worldPos = this.scene.viewport.toWorld(slot.getGlobalPosition())
            }
        })

        this.scene.interaction.on("start", this.onInteractionStart, this)
        this.scene.interaction.on("submit", this.onInteractionSubmit, this)
        this.scene.interaction.on("stop", this.onInteractionStop, this)
    }

    slotAt(x: number, y: number): UnitSlot {
        const pos = this.toViewCoords(x, y);
        const idx = pos.x + pos.y * UNITS_NUM_X;
        if (idx >= this.slots.length) {
            throw new Error(`Invalid slot coordinates: ${x}, ${y}`);
        }

        return this.slots[idx]
    }

    unitAt(x: number, y: number): Unit | null {
        return this.slotAt(x, y).occupant
    }

    // actually, this function transforms game into view, and view into game, fascinating!
    private toViewCoords(x: number, y: number): Point {
        if (this.reversed) {
            return new Point(UNITS_NUM_X - x - 1, UNITS_NUM_Y - y - 1)
        } else {
            return new Point(x, y)
        }
    }

    private toGameCoords(x: number, y: number): Point {
        return this.toViewCoords(x, y)
    }

    private onInteractionStart(type: InteractionType, data: InteractionData, id: number) {
        if (data.type === InteractionType.DRAGGING_CARD && data.propositions.allowedSlots.length !== 0) {
            this.interactionId = id;
            this.beginSlotSelect(data);
        }
    }

    private interactionTick(t: Ticker) {
        if (this.interactionId !== -1) {
            const cardPos = this.scene.viewport.toGlobal(this.draggedCard!.position);
            let newSlot: UnitSlot | null = null;
            for (let slot of this.selectableSlots) {
                if (slot.getBounds().containsPoint(cardPos.x, cardPos.y)) {
                    newSlot = slot;
                    break;
                }
            }

            if (newSlot !== this.selectedSlot) {
                this.selectedSlot?.glow();
                this.selectedSlot = newSlot;
                if (newSlot) {
                    newSlot.select();
                }
            }
        }
    }
    
    private onInteractionSubmit(type: InteractionType, data: InteractionData, id: number) {
        if (this.interactionId === id) {
            this.endSlotSelect();
        }
    }

    private onInteractionStop(type: InteractionType, data: InteractionData, id: number, cancel: boolean) {
        if (this.interactionId === id) {
            this.endSlotSelect();
        }
    }

    private beginSlotSelect(data: InteractionDataOf<InteractionType.DRAGGING_CARD>) {
        this.selectableSlots = data.propositions.allowedSlots
            .filter(p => p.player === this.playerIndex)
            .map(p => this.slotAt(p.vec.x, p.vec.y));
        this.draggedCard = data.card;

        for (let slot of this.selectableSlots) {
            slot.glow();
        }

        this.scene.game.app.ticker.add(this.interactionTick, this);
    }

    private endSlotSelect() {
        for (let slot of this.selectableSlots) {
            slot.empty();
        }
        this.selectableSlots = [];
        this.interactionId = -1;
        this.selectedSlot = null;
        this.draggedCard = null;
        this.scene.game.app.ticker.remove(this.interactionTick, this);
    }
}

export enum UnitSlotState {
    EMPTY,
    GLOWING,
    SELECTED,
    OCCUPIED
}

export class UnitSlot extends Container {
    background: Graphics;
    border: Graphics;
    state: UnitSlotState = UnitSlotState.EMPTY;
    occupant: Unit | null = null
    worldPos: Point = new Point(0, 0)

    constructor(public scene: GameScene, public gamePos: LocalDuelArenaPosition) {
        super();

        this.background = new Graphics()
            .rect(0, 0, SLOT_WIDTH, SLOT_HEIGHT)
            .fill(0xD9D9D9)
        this.addChild(this.background)

        this.border = new Graphics()
            .rect(0, 0, SLOT_WIDTH, SLOT_HEIGHT)
            .stroke({width: 4, color: "#0077ff"});
        this.border.visible = false;
        this.addChild(this.border)
    }

    empty() {
        this.state = UnitSlotState.EMPTY;
        this.occupant = null;
        this.background.tint = 0xffffff;
        this.border.visible = false;
    }

    glow() {
        this.state = UnitSlotState.GLOWING;
        this.background.tint = "#47ceff";
        this.border.visible = false;
    }

    select() {
        this.state = UnitSlotState.SELECTED;
        this.background.tint = "#3693ff";
        this.border.visible = true;
    }
    
    occupiedBy(unit: Unit) {
        this.state = UnitSlotState.OCCUPIED;
        this.occupant = unit;
        this.background.tint = 0xffffff;
        this.border.visible = false;
    }
}