import {Container, Graphics} from "pixi.js";
import {GameScene} from "./GameScene.ts";

const GRID_WIDTH = 680;
const GRID_HEIGHT = 310;

// For now, those are constants. We might make this configurable in the future
const UNITS_NUM_X = 4
const UNITS_NUM_Y = 2

const SPACING_X = 20
const SPACING_Y = 50

// g = n*u + (n-1)*s
//   = n*(u+s) - s
// ==>  (g+s)/n - s = u

const SLOT_WIDTH = (GRID_WIDTH+SPACING_X)/UNITS_NUM_X - SPACING_X
const SLOT_HEIGHT = (GRID_HEIGHT+SPACING_Y)/UNITS_NUM_Y - SPACING_Y

export class UnitSlotGrid extends Container {
    slots: Graphics[] = [] // row-major coordinates (x = idx % num_y, y = idx / num_y)
    
    constructor(public scene: GameScene) {
        super();
        
        this.eventMode = "none"
        
        console.log(`Slot width = ${SLOT_WIDTH} ; Slot height = ${SLOT_HEIGHT}`)
        
        this.pivot.set(GRID_WIDTH / 2, GRID_HEIGHT / 2);
        
        // const debugRect = new Graphics();
        // debugRect.lineStyle({ width: 2, color: 0x0000F0 })
        // debugRect.drawRect(0, 0, GRID_WIDTH, GRID_HEIGHT)
        // this.addChild(debugRect)

        for (let y = 0; y < UNITS_NUM_Y; y++) {
            for (let x = 0; x < UNITS_NUM_X; x++) {
                const slot = new Graphics();
                slot.beginFill(0xD9D9D9)
                slot.drawRect(0, 0, SLOT_WIDTH, SLOT_HEIGHT)
                slot.endFill()
                slot.position.set(x * (SLOT_WIDTH + SPACING_X), y * (SLOT_HEIGHT + SPACING_Y))
                this.addChild(slot)
                this.slots.push(slot)
            }
        }
    }
}