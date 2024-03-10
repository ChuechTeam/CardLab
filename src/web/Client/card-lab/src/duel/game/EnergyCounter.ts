import {BitmapText, Container, Graphics, Rectangle, TextStyle} from "pixi.js";
import {GameScene} from "./GameScene.ts";
import {placeInRectCenter} from "../util.ts";

const WIDTH = 100*1.4;
const HEIGHT = 90*1.4;

const AMOUNT_STYLE = new TextStyle({ fontFamily: "ChakraPetchDigits", fontSize: 64 });
const MAX_STYLE = new TextStyle({ fontFamily: "ChakraPetchDigits", fontSize: 30 });

export class EnergyCounter extends Container {
    bg: Graphics
    amountText: BitmapText
    maxText: BitmapText
    
    constructor(public scene: GameScene, amount: number, max: number) {
        super();
        
        this.bg = new Graphics()
            .rect(0, 0, WIDTH, HEIGHT)
            .fill({color: 0x000000})
            .moveTo(5, HEIGHT * 0.6)
            .lineTo(WIDTH - 5, HEIGHT * 0.6)
            .stroke({ width: 2, color: 0xFFFFFF });
        this.addChild(this.bg);
        
        this.amountText = new BitmapText({ text: "", style: AMOUNT_STYLE });
        this.amountText.tint = 0xFFFFFF;
        this.addChild(this.amountText);
        
        this.maxText = new BitmapText({ text: "", style: MAX_STYLE });
        this.maxText.tint = 0xFFFFFF;
        this.addChild(this.maxText);
        
        this.update(amount, max);
        
        this.pivot.set(WIDTH / 2, HEIGHT / 2);
    }
    
    update(amount: number | null | undefined, max: number | null | undefined) {
        if (amount != null) {
            // Annoyingly, this is necessary since the BitmapText doesn't update its width
            // when we do it twice in a frame.
            this.amountText.didViewUpdate = false;
            this.amountText.text = amount.toString();
            placeInRectCenter(this.amountText, new Rectangle(0, 0, WIDTH, HEIGHT * 0.575));
        }
        
        if (max != null) {
            this.maxText.didViewUpdate = false;
            this.maxText.text = max.toString();
            placeInRectCenter(this.maxText, new Rectangle(0, HEIGHT * 0.6, WIDTH, HEIGHT * 0.4));
        }
    }
}