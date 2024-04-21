import {ScopeTask, SequenceAwareTask} from "src/duel/control/tasks/ScopeTask.ts";
import {GameTask} from "src/duel/control/task.ts";
import {GameAvatars} from "src/duel/control/avatar.ts";
import {Card} from "src/duel/game/Card.ts";
import {DuelEntityType} from "src/duel/control/state.ts";
import {Unit} from "src/duel/game/Unit.ts";

export class AlterationScopeTask extends ScopeTask implements SequenceAwareTask {
    isCard: boolean
    constructor(public targetId: number, 
                public positive: boolean,
                public avatars: GameAvatars,
                preparationTasks: GameTask[],
                childTasks: GameTask[]
    ) {
        super(preparationTasks, childTasks);
        
        this.isCard = (targetId & 0b1111) === DuelEntityType.CARD;
    }
    
    *run() {
        const av = this.avatars.findEntity(this.targetId);
        if (av instanceof Card) {
            av.startAlterationAnim(this.positive, av.state.name !== "hand" || !av.state.flipped)
        } else if (av instanceof Unit) {
            av.glossAlteration(this.positive)
        }
        
        yield* this.runTasks();

        // Give a bit of time to read the changes.
        if (av instanceof Card) {
            yield GameTask.wait(1.0);
        }
    }
    
    sequencePrepare(previous: GameTask | null, next: GameTask | null) {
        if (this.isCard && next instanceof AlterationScopeTask && next.isCard) {
            return {runInBackground: true};
        }
    }
}