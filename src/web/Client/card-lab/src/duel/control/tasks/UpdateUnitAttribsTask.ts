import {GameTask} from "src/duel/control/task.ts";
import {GameAvatars} from "src/duel/control/avatar.ts";
import {duelLogError} from "src/duel/log.ts";

class NetUnitAttributes {
}

export class UpdateUnitAttribsTask extends GameTask {
    constructor(public unitId: number, public attribs: Partial<NetDuelUnitAttributes>, public avatars: GameAvatars) {
        super();
    }

    * run() {
        const avatar = this.avatars.findUnit(this.unitId);
        if (avatar === undefined) {
            duelLogError("UpdateUnitAttribsTask: unit not found", this.unitId);
            return;
        }

        avatar.updateVisualData({
            attack: this.attribs.attack,
            health: this.attribs.health,
        })
    }
}