import {BitmapText, Container, Graphics, Point, Rectangle, TextStyle} from "pixi.js";
import {GameScene} from "src/duel/game/GameScene.ts";
import {placeInRectCenter} from "src/duel/util.ts";

const TEXT_STYLE = new TextStyle({
    fontFamily: "ChakraPetchDigits",
    fontSize: 32,
    fill: 0xffffff
})

const WIDTH = 160;
const HEIGHT = 80;

const RED_TIMER_THRESHOLD = 15000; // time < x then we go red (in milliseconds)

export class TurnTimer extends Container {
    bg: Graphics
    text: BitmapText
    time: number | null = null
    active: boolean = false

    constructor(public scene: GameScene) {
        super();

        this.bg = new Graphics()
            .rect(0, 0, WIDTH, HEIGHT)
            .fill({ color: 0x000000 });
        this.addChild(this.bg);

        this.text = new BitmapText({style: TEXT_STYLE})
        this.addChild(this.text);

        this.visible = false;
        this.boundsArea = new Rectangle(0, 0, WIDTH, HEIGHT);
        this.eventMode = "none";
        this.pivot = new Point(WIDTH / 2, HEIGHT / 2);
    }

    // in ms
    update(time: number | null) {
        if (this.time === time) {
            return;
        }
        
        this.time = time;
        this.visible = time !== null;

        if (this.active) {
            this.render();
        }
    }

    render() {
        if (this.time !== null) {
            this.visible = true;
            if (this.time <= RED_TIMER_THRESHOLD) {
                this.text.tint = 0xff3221;
                this.text.scale.set(1.5);
            } else {
                this.text.tint = 0xffffff;
                this.text.scale.set(1);
            }
            const minutes = Math.floor(this.time / 60000);
            const seconds = Math.floor((this.time % 60000) / 1000);
            this.text.text = `${minutes}:${seconds.toString().padStart(2, "0")}`
            placeInRectCenter(this.text, this.boundsArea);
        } else {
            this.visible = false;
        }
    }

    show() {
        if (this.active) {
            return;
        }

        this.active = true;
        this.render();
    }

    hide() {
        this.active = false;
        this.visible = false;
    }
}