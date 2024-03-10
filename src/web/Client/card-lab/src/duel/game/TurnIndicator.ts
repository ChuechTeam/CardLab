import {GameScene} from "./GameScene.ts";
import {Container, FillGradient, Graphics, Sprite} from "pixi.js";

const WIDTH = 10000;

export class TurnIndicator extends Container {
    bg: Sprite;

    constructor(public scene: GameScene, public readonly type: "player" | "opponent", visible = false) {
        super();

        this.bg = new Sprite(this.scene.game.assets.base.verticalGradient);
        this.bg.x = -2000;
        this.bg.width = WIDTH;
        
        this.bg.alpha = 0.75;
        this.addChild(this.bg);

        if (type === "player") {
            this.bg.tint = 0x0084FF;
            this.bg.height = 600;
        } else {
            this.bg.tint = 0xFF0000;
            this.bg.height = 450; // smaller height since there's less space for opponent.
            this.bg.scale.y *= -1;
        }

        this.visible = visible;
    }

    show() {
        this.visible = true;
    }

    hide() {
        this.visible = false;
    }
}