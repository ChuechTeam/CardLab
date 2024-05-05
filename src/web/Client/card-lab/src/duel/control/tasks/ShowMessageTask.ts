import {GameTask} from "src/duel/control/task.ts";
import {GameScene} from "src/duel/game/GameScene.ts";
import {Ticker} from "pixi.js";

export class ShowMessageTask extends GameTask {
    remaining: number
    
    constructor(public scene: GameScene,
                public readonly message: string, 
                public readonly duration: number,
                public readonly pauseDuration: number | null = null) {
        super();
        
        this.remaining = pauseDuration ?? duration;
    }
    
    run() {
        this.scene.messageBanner.show(this.message, this.duration);
        if (this.remaining <= 0) {
            this.complete();
        }
    }

    tick(ticker: Ticker) {
        this.remaining -= ticker.deltaMS/1000;
        if (this.remaining < 0) {
            this.complete();
        }
    }
}