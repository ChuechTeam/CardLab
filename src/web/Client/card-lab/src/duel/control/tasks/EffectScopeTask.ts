import {ScopeTask, SequenceAwareTask} from "src/duel/control/tasks/ScopeTask.ts";
import {GameTask, GameTaskState} from "src/duel/control/task.ts";
import {GameAvatars} from "src/duel/control/avatar.ts";
import {HomingProjectile} from "src/duel/game/HomingProjectile.ts";
import {KnownLocalDuelCard, LocalEntity} from "src/duel/control/state.ts";
import {duelLogWarn} from "src/duel/log.ts";
import {Container, Point} from "pixi.js";
import {Card} from "src/duel/game/Card.ts";

export class EffectScopeTask extends ScopeTask implements SequenceAwareTask {
    isSpell = false;
    isFirstEffect = false;

    hasNext = false

    constructor(public sourceId: number,
                public sourceEntity: LocalEntity,
                public targets: number[],
                public effectTint: DuelEffectTint,
                public disableTargeting: boolean,
                public startDelay: number,
                public endDelay: number,
                public avatars: GameAvatars,
                preparationTasks: GameTask[],
                childTasks: GameTask[]) {
        super(preparationTasks, childTasks);

        if (sourceEntity instanceof KnownLocalDuelCard && sourceEntity.type === "spell") {
            this.isSpell = true;
        }
    }

    * run(): Generator<GameTask> {
        const sourceAv = this.avatars.findEntity(this.sourceId)
        if (sourceAv === undefined) {
            yield* this.runTasks();
            return;
        }

        if (this.isSpell && this.isFirstEffect) {
            yield GameTask.wait(0.25)
        }
        
        if (this.startDelay > 0) {
            yield GameTask.wait(this.startDelay/1000);
        }

        if (!this.disableTargeting && this.targets.length !== 0) {
            // First: show the targets
            const onlyTargetsSelf = this.targets.length === 1 && this.targets[0] === this.sourceId

            const avatars = this.targets
                .map(t => this.avatars.findEntity(t))
                .filter(a => a !== undefined) as Container[];

            if (avatars.length === 0) {
                duelLogWarn("No targets found for effect!", this);
            }

            let color = 0x000000;
            switch (this.effectTint) {
                case "negative":
                    color = 0xee2222;
                    break;
                case "neutral":
                    color = 0x1552ee;
                    break;
                case "positive":
                    color = 0x0ca600;
                    break;
            }

            function visiblePos(c: Container) {
                if (c instanceof Card) {
                    const rect = c.findVisibleRect();
                    const yOffsetDir = c.rotation === 0 ? -1 : 1;
                    return new Point(
                        rect.x + rect.width / 2,
                        rect.y + rect.height / 2 + rect.height * 0.4 * yOffsetDir
                    )
                } else {
                    return new Point(c.x, c.y);
                }
            }

            let hasAnyCard = avatars.some(x => x instanceof Card)
            const srcPos = sourceAv.position;
            const positions = [] as Point[]
            
            function updatePositions() {
                positions.length = avatars.length;
                for (let i = 0; i < positions.length; i++) {
                    positions[i] = visiblePos(avatars[i]);
                }
            }
            updatePositions();

            const appearInterval = Math.max(0.04, 0.18 - avatars.length * 0.02);
            this.avatars.scene.effectTargetAnim.show(srcPos, positions, {
                radius: hasAnyCard ? 60 : 125,
                appearInterval,
                targetEntryTime: 0.2,
                endTime: !onlyTargetsSelf ? 1.25 : 0.5,
                color
            })

            // Fun little hack to do something on tick correctly.
            const task = GameTask.callback(complete => this.avatars.scene.effectTargetAnim.onEnd = complete);
            task.tick = () => {
                updatePositions()
                this.avatars.scene.effectTargetAnim.updateSourcePos(srcPos)
                this.avatars.scene.effectTargetAnim.updateTargetPos(positions)
            }
            yield task;

            // Then: shoot the projectiles
            // Only shoot projectiles when i target someone else.
            if (!onlyTargetsSelf) {
                const proj = [] as HomingProjectile[];

                for (let i = 0; i < positions.length; i++) {
                    const targetPos = positions[i];
                    const projOptions = {
                        projColor: color,
                        lineColor: color,
                        startPos: srcPos,
                        targetPos,
                        showLine: false,
                        useTime: true,
                        time: 0.25,
                        zIndex: 2500
                    };
                    const p = this.avatars.scene.spawnProjectile(projOptions);
                    proj.push(p);
                }

                const t = GameTask.callback(complete => {
                    for (let p of proj) {
                        p.onHit = () => {
                            if (t.state === GameTaskState.RUNNING) complete()
                        };
                    }
                })

                yield t;
                for (let p of proj) {
                    if (!p.destroyed) {
                        p.destroy();
                    }
                }
            }
        }
        yield* this.runTasks();

        if (this.endDelay > 0) {
            yield GameTask.wait(this.startDelay/1000);
        }
        yield GameTask.wait(this.hasNext ? 0.5 : 0.1);
    }

    sequencePrepare(previous: GameTask | null, next: GameTask | null, parent: GameTask) {
        if (next !== null) {
            this.hasNext = true;
        }
    }
}