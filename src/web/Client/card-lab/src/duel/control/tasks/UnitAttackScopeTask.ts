import {GameTask} from "src/duel/control/task.ts";
import {GameAvatars} from "src/duel/control/avatar.ts";
import {ScopeTask, SequenceAwareTask} from "src/duel/control/tasks/ScopeTask.ts";
import {Unit} from "src/duel/game/Unit.ts";

export class UnitAttackScopeTask extends ScopeTask implements SequenceAwareTask {
    constructor(public unitId: number,
                public targetId: number,
                public damage: number,
                public avatars: GameAvatars,
                public preparationTasks: GameTask[] = [],
                public childTasks: GameTask[] = []) {
        super(preparationTasks, childTasks);
    }
    
    padEnd = false;

    * run(): Generator<GameTask> {
        // todo: handle prep tasks correctly (i.e. pause the attack)
        const unit = this.avatars.findUnit(this.unitId)!;
        const target = this.avatars.findEntity(this.targetId)!;
        
        yield* this.runTasks(this.preparationTasks);
        
        unit.beginAttacking(target.position);
        yield GameTask.callback(complete => unit.attackAnim.onPhase1Done = complete);
        
        if (target instanceof Unit) {
            target.superImpactAnim.def.config(target.position.subtract(unit.position).normalize(), this.damage);
            target.superImpactAnim.start();
        }

        const backgroundTasks = [] as GameTask[];
        yield* this.runTasks(this.childTasks, backgroundTasks);

        // inspect very rare bug that might occur when dt > goBackTime
        unit.launchAttackAnimPhase2();
        yield GameTask.callback(complete => unit.attackAnim.onPhase2Done = complete);
        
        yield* this.simultaneous(backgroundTasks);
        
        if (this.padEnd) {
            yield GameTask.wait(0.35);
        }
    }
    
    sequencePrepare(previous: GameTask | null, next: GameTask | null) {
        if (next !== null) {
            this.padEnd = true
        }
    }
}