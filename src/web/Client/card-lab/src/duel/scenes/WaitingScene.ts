import {Scene} from "./scene.ts";
import {DuelGame} from "../duel.ts";
import * as PIXI from 'pixi.js';
import {Sprite} from "pixi.js";
import {GameScene} from "./GameScene.ts";

export class WaitingScene extends Scene {
    constructor(game: DuelGame) {
        super(game);

        const text = new PIXI.Text("Patience...");
        text.x = 50;
        text.y = 50;
        this.addChild(text);
        
        const gamePack = this.game.registry.packs[0];
        const card = Object.values(gamePack.cards)[0];

        const texture= this.game.assets.getCardTexture({packId: gamePack.id, cardId: card.id})!;
        const sprite = new Sprite(texture);

        sprite.x = 300;
        sprite.y = 400;
        sprite.pivot = new PIXI.Point(sprite.width / 2, sprite.height / 2);

        this.addChild(sprite);

        this.game.app.ticker.add(dt => {
            sprite.rotation += 0.01 * dt;

          
        })
        
        this.eventMode = "static"
        this.on("pointermove", e => {
            const position = e.global;
            text.text = `Pos = (${position.x}, ${position.y})`
            sprite.position = position
        })
        this.on("pointerdown", e => {
            this.game.switchScene(new GameScene(this.game));
        })
        
        const updateHA = () => {
            // very good solution
            this.hitArea = new PIXI.Rectangle(0, 0,
                this.game.app.screen.width,
                this.game.app.screen.height);
        }
        
        updateHA();
        this.game.app.renderer.on("resize", updateHA)
    }
}