import {GameTask} from "src/duel/control/task.ts";
import {GameAvatars} from "src/duel/control/avatar.ts";

export class UpdatePlayerAttribsTask extends GameTask {
    constructor(public playerIndex: number,
                public prevAttrs: NetDuelPlayerAttributes,
                public changedAttrs: Partial<NetDuelPlayerAttributes>,
                public avatars: GameAvatars) {
        super();
    }

    * run() {
        // Later on we should of course have some background animations when
        // updating those values
        if ('energy' in this.changedAttrs || 'maxEnergy' in this.changedAttrs) {
            this.avatars.scene.energyCounters[this.playerIndex]
                .update(this.changedAttrs.energy, this.changedAttrs.maxEnergy);
        }
        if (typeof this.changedAttrs.coreHealth !== "undefined") {
            let delta = this.changedAttrs.coreHealth - this.prevAttrs.coreHealth;

            const core = this.avatars.scene.cores[this.playerIndex];
            core.update(this.changedAttrs.coreHealth!);
            
            if (delta !== 0) {
                core.hpChangeIndicator.show(delta);
            }
        }
    }
}