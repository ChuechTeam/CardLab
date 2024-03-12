import {GameTask} from "./task.ts";
import {GameScene} from "../game/GameScene.ts";
import {Ticker} from "pixi.js";

export class ShowMessageTask extends GameTask {
    remaining: number
    
    constructor(public scene: GameScene,
                public readonly message: string, 
                public readonly duration: number) {
        super();
        
        this.remaining = duration
    }
    
    run() {
        this.scene.messageBanner.show(this.message, this.duration);
    }

    tick(ticker: Ticker, scene: GameScene) {
        this.remaining -= ticker.deltaMS/1000;
        if (this.remaining < 0) {
            this.complete();
        }
    }
}