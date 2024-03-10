import {Container, Graphics, Rectangle, Text} from "pixi.js";
import {GameScene} from "./GameScene.ts";
import {placeInRectCenter} from "../util.ts";

const WIDTH = 220;
const HEIGHT = 80;

export class TurnButton extends Container {
    bg: Graphics;
    text: Text;

    constructor(public scene: GameScene) {
        super();

        this.bg = new Graphics().rect(0, 0, WIDTH, HEIGHT).fill({color: 0xaaaaaa});
        this.addChild(this.bg);

        this.text = new Text({
            text: "Terminer le tour", style: {
                fontFamily: "Chakra Petch",
                fontSize: 24,
                fill: 0x000000
            }
        });
        placeInRectCenter(this.text, new Rectangle(0, 0, WIDTH, HEIGHT));
        this.addChild(this.text);
        
        this.pivot.set(WIDTH / 2, HEIGHT / 2);
    }
}