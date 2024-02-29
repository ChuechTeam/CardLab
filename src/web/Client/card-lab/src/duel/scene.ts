import type {DuelGame} from "./duel.ts";
import {Container} from "pixi.js";

export class Scene extends Container {
    constructor (public game: DuelGame) {
        super()
    }
    
    start() {}
    end() {}
}