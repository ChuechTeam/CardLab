import {GameTask} from "src/duel/control/task.ts";
import {GameAvatars} from "src/duel/control/avatar.ts";
import {UnitDeathScopeTask} from "src/duel/control/tasks/UnitDeathScopeTask.ts";
import {UnitTriggerScopeTask} from "src/duel/control/tasks/UnitTriggerScopeTask.ts";

export class DestroyUnitTask extends GameTask {
    constructor(public unitId: number, public avatars: GameAvatars) {
        super();
    }
    
    *run() {
        const u = this.avatars.findUnit(this.unitId)!;
        this.avatars.deadUnitsPositions.set(this.unitId, u.position);
        
        if (this.playDeathAnim) {
            u.becomeDead();
            
            // Play the trigger anim in the middle of the death.
            if (this.hasDeathTrigger) {
                yield GameTask.wait(0.2);
                if (!u.destroyed) {
                    if (!u.superTriggerAnim.running) {
                        u.superTriggerAnim.start()
                    }
                    u.glossTrigger()
                }
            }
            
            if (!u.destroyed) {
                yield GameTask.callback(complete => u.on("destroyed", complete));
            }
        } else {
            u.destroy();
        }
    }
    
    get hasDeathTrigger() {
        return this.parent instanceof UnitDeathScopeTask && this.parent.nextTriggerId === this.unitId;
    }
    
    get playDeathAnim() {
        return this.parent instanceof UnitDeathScopeTask;
    }
}