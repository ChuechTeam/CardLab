import {ScopeTask, SequenceAwareTask} from "src/duel/control/tasks/ScopeTask.ts";
import {GameTask} from "src/duel/control/task.ts";
import {GameAvatars} from "src/duel/control/avatar.ts";
import {DuelEntityType} from "src/duel/control/state.ts";
import {DAMAGE_PROJ_STYLE} from "src/duel/game/HomingProjectile.ts";

export class DamageScopeTask extends ScopeTask implements SequenceAwareTask {
    coreExceedInfo: { deadUnitId: number } | null = null;

    constructor(public sourceId: number,
                public targetId: number,
                public damage: number,
                public tags: string[],
                public avatars: GameAvatars,
                public preparationTasks: GameTask[] = [],
                public childTasks: GameTask[] = []) {
        super(preparationTasks, childTasks);
    }

    * run() {
        // todo: (correct) prep tasks handling that pauses parent.
        yield* this.runTasks(this.preparationTasks);
        
        // If this is excess damage coming from a dead unit to a core, spawn a projectile
        // that deals the damage to make it a bit clearer.
        if (this.coreExceedInfo !== null) {
            const deadUnit = this.avatars.findUnit(this.coreExceedInfo.deadUnitId)!;
            const target = this.avatars.findEntity(this.targetId)!;
            
            const proj = this.avatars.scene.spawnProjectile({ 
                startPos: deadUnit.position,
                targetPos: target.position,
                showLine: false,
                ...DAMAGE_PROJ_STYLE
            })
            
            yield GameTask.callback(complete => proj.onHit = complete);
        }
        
        yield* this.runTasks(this.childTasks);
    }

    sequencePrepare(previous: GameTask | null, next: GameTask | null) {
        if (previous instanceof DamageScopeTask
            && this.tags.includes("excess_damage")
            && (this.targetId & 0b1111) === DuelEntityType.PLAYER) {
            this.coreExceedInfo = {deadUnitId: previous.targetId};
            return {runInBackground: true};
        }
    }
}