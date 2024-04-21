import {GameTask} from "src/duel/control/task.ts";
import {GameAvatars, unitHealthAttrState} from "src/duel/control/avatar.ts";
import {duelLogError} from "src/duel/log.ts";
import {LocalDuelUnit} from "src/duel/control/state.ts";
import {AttrCompMode, attrStateCompare} from "src/duel/game/AttrState.ts";

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
        
        const def = this.avatars.scene.game.registry.findCard(this.unit.originRef)!.definition;
        
        let atkDelta =
            this.attribs.attack !== undefined ? this.attribs.attack - avatar.visData.attack : 0;
        
        let hpDelta =
            this.attribs.health !== undefined ? this.attribs.health - avatar.visData.health : 0;

        avatar.updateVisualData({
            attack: this.attribs.attack,
            attackState: this.attribs.attack !== undefined ? 
                attrStateCompare(AttrCompMode.MORE_IS_BETTER, def.attack, this.attribs.attack) : undefined,
            health: this.attribs.health,
            healthState: this.attribs.health !== undefined ?
                unitHealthAttrState(this.attribs.health, this.unit.attribs.maxHealth, def.health) : undefined
        })
        
        if (atkDelta !== 0) {
            avatar.attackAttr.changeIndicator.show(atkDelta)
        }
        
        if (hpDelta !== 0) {
            avatar.healthAttr.changeIndicator.show(hpDelta)
        }
    }
}