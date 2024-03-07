import {Scene} from "./scene.ts";
import {DuelGame} from "./duel.ts";
import * as PIXI from 'pixi.js';
import {Graphics} from "pixi.js";
import {GAME_WIDTH} from "./game/GameScene.ts";

export class WaitingScene extends Scene {
    constructor(game: DuelGame) {
        super(game);

        const text = new PIXI.Text( {
            text: "Connexion en cours...",
            style: {fontFamily: "Chakra Petch"}
        });
        text.x = 50;
        text.y = 50;
        this.addChild(text);
    }
}