import {ScopeTask} from "src/duel/control/tasks/ScopeTask.ts";
import {GameTask} from "src/duel/control/task.ts";
import {GameAvatars} from "src/duel/control/avatar.ts";

export class UnitTriggerScopeTask extends ScopeTask {
    constructor(public unitId: number, public avatars: GameAvatars,
                preparationTasks: GameTask[], childTasks: GameTask[]) {
        super(preparationTasks, childTasks);
    }

    * run(): Generator<GameTask> {
        const avatar = this.avatars.findUnit(this.unitId);
        if (avatar === undefined || avatar.superTriggerAnim.running) {
            if (avatar !== undefined) {
                avatar.glossTrigger()
            }
            yield* this.runTasks();
            return;
        }
        
        avatar.glossTrigger()
        avatar.superTriggerAnim.start(false)
        yield GameTask.callback(complete => avatar.onTriggerAnimDone = complete)
        
        yield* this.runTasks();

        if (!avatar.destroyed) {
            avatar.superTriggerAnim.reverse = true
            yield GameTask.callback(complete => avatar.onTriggerAnimDone = complete);
            avatar.superTriggerAnim.stop()
        }
    }
}