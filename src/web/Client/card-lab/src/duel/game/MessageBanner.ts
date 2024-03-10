import {Container, Graphics, Text} from "pixi.js";
import {GameScene} from "./GameScene.ts";

export class MessageBanner extends Container {
    bg: Graphics;
    text: Text;

    displayTimer: number = 0; // seconds before hiding.
    displayed: boolean = false;

    constructor(public scene: GameScene) {
        super();

        this.bg = new Graphics().rect(0, 0, 1, 1).fill({color: 0x000000});
        this.addChild(this.bg);

        this.text = new Text({
            text: "",
            style: {
                fontFamily: "Chakra Petch",
                fontSize: 22,
                fill: 0xFFFFFF,
                wordWrapWidth: 600,
                wordWrap: true,
                align: "center"
            }
        });
        this.text.x = 10;
        this.text.y = 10;
        this.addChild(this.text);

        this.visible = false;

        this.scene.game.app.ticker.add(this.tick, this);
        this.on("destroyed", () => this.scene.game.app.ticker.remove(this.tick, this));
    }

    show(message: string, time: number) {
        this.text.text = message;
        this.bg.scale.x = this.text.width + 20;
        this.bg.scale.y = this.text.height + 20;

        this.pivot.set(this.bg.width / 2, this.bg.height / 2);

        this.displayTimer = time;
        this.visible = true;
        this.displayed = true;
    }

    tick() {
        if (this.displayed && this.displayTimer != -1) {
            this.displayTimer -= this.scene.game.app.ticker.deltaMS / 1000;
            if (this.displayTimer <= 0) {
                this.hide();
            }
        }
    }

    hide() {
        this.visible = false;
        this.displayed = false;
    }
}