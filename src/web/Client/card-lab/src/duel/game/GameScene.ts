import {Scene} from "../scene.ts";
import {DuelGame} from "../duel.ts";
import {Viewport} from "pixi-viewport";
import * as PIXI from 'pixi.js';
import {Card} from "./Card.ts";

export const GAME_WIDTH = 720;
export const GAME_HEIGHT = 1440;

export class GameScene extends Scene {
    viewport: Viewport;

    constructor(game: DuelGame) {
        super(game);
        this.viewport = new Viewport({
            worldWidth: GAME_WIDTH,
            worldHeight: GAME_HEIGHT,
            events: game.app.renderer.events
        })
        this.game.app.renderer.on("resize", this.resizeViewport.bind(this));
        this.resizeViewport();

        const funRect = new PIXI.Graphics()
        funRect.lineStyle({width: 20, color: 0xFF0000, alpha: 1})
        funRect.drawRect(0, 0, this.viewport.worldWidth, this.viewport.worldHeight)
        this.viewport.addChild(funRect)

        const pack = this.game.registry.packs[0]
        const card = Array.from(pack.cards.values())[0];
        (window as any).funCard =  this.viewport.addChild(new Card(this, Card.dataFromCardRef({packId: pack.id, cardId: card.id}, this.game, true)));
        
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

    resizeViewport() {
        this.viewport.resize(this.game.app.screen.width, this.game.app.screen.height)
        this.viewport.fitWorld()
        this.viewport.moveCenter(this.viewport.worldWidth / 2, this.viewport.worldHeight / 2)
    }
}