import {ScopeTask} from "src/duel/control/tasks/ScopeTask.ts";
import {GameTask} from "src/duel/control/task.ts";
import {GameAvatars} from "src/duel/control/avatar.ts";
import {Point} from "pixi.js";
import {EffectScopeTask} from "src/duel/control/tasks/EffectScopeTask.ts";

export class CardPlayScopeTask extends ScopeTask {
    constructor(public cardId: number,
                public player: LocalDuelPlayerIndex,
                public opponent: boolean,
                public avatars: GameAvatars,
                preparationTasks: GameTask[], 
                childTasks: GameTask[]) {
        super(preparationTasks, childTasks);

        for (let t of childTasks) {
            if (t instanceof EffectScopeTask) {
                t.isFirstEffect = true;
                break;
            }
        }
    }

    * run(): Generator<GameTask> {
        yield* this.runTasks();
        
        const laidCard = this.avatars.scene.laidDownCard
        if (this.shouldLay(this.cardId)) {
            if (laidCard !== null && laidCard.id === this.cardId && laidCard.state.name === "laying") {
                laidCard.state.autoDestroyTime = 3.5;
                this.avatars.scene.cardInfoTooltip.time = 3.5;
            }
        } else if (laidCard != null && this.cardId === laidCard.id) {
            // In case we launched the spell, the card needs to go away
            yield GameTask.wait(0.33);
            laidCard.startDiscardAnim(true, true)
        }
    }
    
    shouldLay(cardId: number) {
        return cardId === this.cardId && this.opponent;
    }
}