import {GameTask} from "src/duel/control/task.ts";
import {GameAvatars} from "src/duel/control/avatar.ts";

export class DestroyUnitTask extends GameTask {
    playDeathAnim = false;
    
    constructor(public unitId: number, public avatars: GameAvatars) {
        super();
    }
    
    *run() {
        const u = this.avatars.findUnit(this.unitId)!;
        if (this.playDeathAnim) {
            u.becomeDead();
            yield GameTask.callback(complete => u.on("destroyed", complete));
        } else {
            u.destroy();
        }
    }
}