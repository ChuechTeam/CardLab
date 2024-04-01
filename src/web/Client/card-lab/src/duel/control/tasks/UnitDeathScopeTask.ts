import {GameTask} from "src/duel/control/task.ts";
import {DestroyUnitTask} from "src/duel/control/tasks/DestroyUnitTask.ts";
import {ScopeTask, SequenceAwareTask} from "src/duel/control/tasks/ScopeTask.ts";

export class UnitDeathScopeTask extends ScopeTask implements SequenceAwareTask {
    constructor(public preparationTasks: GameTask[] = [],
                public childTasks: GameTask[] = []) {
        super(preparationTasks, childTasks);

        for (const t of childTasks) {
            if (t instanceof DestroyUnitTask) {
                t.playDeathAnim = true;
            }
        }
    }
    
    delay = 0.0
    padEnd = false;

    *run(){
        if (this.delay != 0.0) {
            yield GameTask.wait(this.delay);
        }
        yield* this.runTasks();
        if (this.padEnd) {
            yield GameTask.wait(0.1);
        }
    }
    
    sequencePrepare(previous: GameTask | null, next: GameTask | null) {
        // fix case where death has prep tasks
        if (next instanceof UnitDeathScopeTask) {
            return {runInBackground: true};
        }
        if (previous instanceof UnitDeathScopeTask) {
            this.delay = previous.delay + 0.1;
        }
        if (next !== null) {
            this.padEnd = true
        }
    }
}