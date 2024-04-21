import {ScopeTask, SequenceAwareTask} from "src/duel/control/tasks/ScopeTask.ts";
import {GameTask} from "src/duel/control/task.ts";
import {GameAvatars} from "src/duel/control/avatar.ts";
import {DuelEntityType} from "src/duel/control/state.ts";
import {DAMAGE_PROJ_STYLE} from "src/duel/game/HomingProjectile.ts";

export class HealScopeTask extends ScopeTask {
    constructor(public sourceId: number | null,
                public targetId: number,
                public value: number,
                public tags: string[],
                public avatars: GameAvatars,
                public preparationTasks: GameTask[] = [],
                public childTasks: GameTask[] = []) {
        super(preparationTasks, childTasks);
    }

    * run() {
        // todo: (correct) prep tasks handling that pauses parent.
        yield* this.runTasks(this.preparationTasks);
        
        const target = this.avatars.findEntity(this.targetId);
        if (target !== undefined && "reactToHeal" in target && typeof target.reactToHeal === "function") {
            target.reactToHeal()
        }
        
        yield* this.runTasks(this.childTasks);
    }
}