import {GameTask} from "src/duel/control/task.ts";
import {GameAvatars} from "src/duel/control/avatar.ts";
import {duelLogError} from "src/duel/log.ts";
import {LocalDuelUnit} from "src/duel/control/state.ts";

export class UpdateUnitAttribsTask extends GameTask {
    constructor(public unit: LocalDuelUnit, public attribs: Partial<NetDuelUnitAttributes>, public avatars: GameAvatars) {
        super();
    }

    * run() {
        const avatar = this.avatars.findUnit(this.unit.id);
        if (avatar === undefined) {
            duelLogError("UpdateUnitAttribsTask: unit not found", this.unit.id);
            return;
        }

        avatar.updateVisualData({
            attack: this.attribs.attack,
            health: this.attribs.health,
            wounded: this.attribs.health !== undefined ? this.attribs.health < this.unit.attribs.maxHealth : undefined,
        })
    }
}