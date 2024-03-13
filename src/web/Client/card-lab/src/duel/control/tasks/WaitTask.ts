import {GameTask} from "src/duel/control/task.ts";
import {GameScene} from "src/duel/game/GameScene.ts";
import {Ticker} from "pixi.js";

export class WaitTask extends GameTask {
    remaining: number
    constructor(public readonly duration: number) {
        super();
        this.remaining = duration
    }
    
    tick(ticker: Ticker) {
        this.remaining -= ticker.deltaMS/1000;
        if (this.remaining < 0) {
            this.complete();
        }
    }
}