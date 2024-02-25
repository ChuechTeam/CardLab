import {Scene} from "./scene.ts";
import {DuelGame} from "../duel.ts";
import * as PIXI from 'pixi.js';
import {Sprite} from "pixi.js";

export class WaitingScene extends Scene {
    constructor(game: DuelGame) {
        super(game);

        const text = new PIXI.Text("Patience...");
        text.x = 50;
        text.y = 50;
        this.game.app.stage.addChild(text);
        
        const gamePack = this.game.registry.packs[0];
        const card = Object.values(gamePack.cards)[0];

        const texture= this.game.assets.getCardTexture({packId: gamePack.id, cardId: card.id})!;
        const sprite = new Sprite(texture);

        sprite.x = 300;
        sprite.y = 400;
        sprite.pivot = new PIXI.Point(sprite.width / 2, sprite.height / 2);

        this.game.app.stage.addChild(sprite);

        this.game.app.ticker.add(dt => {
            sprite.rotation += 0.01 * dt;
        })
    }
}