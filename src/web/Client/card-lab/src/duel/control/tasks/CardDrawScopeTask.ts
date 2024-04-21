import {ScopeTask, SequenceAwareTask} from "src/duel/control/tasks/ScopeTask.ts";
import {GameTask} from "src/duel/control/task.ts";

export class CardDrawScopeTask extends ScopeTask implements SequenceAwareTask {
    wait = true

    constructor(preparationTasks: GameTask[], childTasks: GameTask[]) {
        super(preparationTasks, childTasks);
    }

    * run(): Generator<GameTask> {
        yield* this.runTasks();

        if (this.wait) {
            yield GameTask.wait(0.6);
        }
    }

    sequencePrepare(previous: GameTask | null, next: GameTask | null, parent: GameTask) {
        if (next === null && parent instanceof ScopeTask && parent.scopeType === "root") {
            this.wait = false;
        }
    }
}