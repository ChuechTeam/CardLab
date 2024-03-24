import {GameTask} from "src/duel/control/task.ts";
import {LocalDuelUnit} from "src/duel/control/state.ts";
import {GameAvatars} from "src/duel/control/avatar.ts";

export class PlaceUnitTask extends GameTask {
    constructor(public unit: NetDuelUnit, public avatars: GameAvatars) {
        super();
    }

    *run() {
        const local = new LocalDuelUnit(this.unit);
        const spawned = this.avatars.spawnUnit(local)
        
        const slot = this.avatars.findSlot(local.position)
        spawned.spawnOn(slot);
    }
}