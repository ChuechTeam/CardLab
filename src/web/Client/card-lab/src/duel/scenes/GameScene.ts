import {Scene} from "./scene.ts";
import {DuelGame} from "../duel.ts";
import {Viewport} from "pixi-viewport";
import * as PIXI from 'pixi.js';

export class GameScene extends Scene {
    viewport: Viewport;

    constructor(game: DuelGame) {
        super(game);
        this.viewport = new Viewport({
            worldWidth: 720,
            worldHeight: 1280,
            events: game.app.renderer.events
        })

        const funRect = new PIXI.Graphics()
        funRect.lineStyle({width: 20, color: 0xFF0000, alpha: 1})
        funRect.drawRect(0, 0, this.viewport.worldWidth, this.viewport.worldHeight)
        this.viewport.addChild(funRect)

        this.viewport.addChild(new PIXI.Text("Hello World", {fill: 0xFFFFFF}));
        this.addChild(this.viewport)

        document.addEventListener("keydown", e => {
            if (e.code == "ArrowRight") {
                this.viewport.x += 10;
            } else if (e.code == "ArrowLeft") {
                this.viewport.x -= 10;
            } else if (e.code == "ArrowUp") {
                this.viewport.y += 10;
            } else if (e.code == "ArrowDown") {
                this.viewport.y -= 10;
            }
        });

        (window as any).helpMe = this.viewport
    }
}