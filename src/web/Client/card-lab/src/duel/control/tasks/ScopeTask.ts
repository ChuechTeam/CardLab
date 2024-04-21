import {GameTask} from "src/duel/control/task.ts";

export class ScopeTask extends GameTask {
    scopeType = "unknown"

    constructor(public preparationTasks: GameTask[], public childTasks: GameTask[]) {
        super();
    }

    * run(): Generator<GameTask> {
        yield* this.runTasks()
    }

    * runTasks(tasks: GameTask[] | null = null, background: GameTask[] | null = null): Generator<GameTask> {
        if (tasks === null) {
            yield* this.runTasks(this.preparationTasks);
            yield* this.runTasks(this.childTasks);
            return;
        }

        let externallyManagedBg = background !== null;
        background ??= [];

        for (let i = 0; i < tasks.length; i++) {
            const task = tasks[i];

            let bg = false;
            if (isSeqAware(task)) {
                const result = task.sequencePrepare(tasks[i - 1] ?? null, tasks[i + 1] ?? null, this);
                bg = result?.runInBackground ?? false;
            }

            if (bg) {
                background.push(task);
                task.start(this);
            } else {
                yield task;
            }
        }

        if (!externallyManagedBg && background.length !== 0) {
            yield* this.simultaneous(background);
        }
    }

    toString(): string {
        if (this.constructor.name !== "ScopeTask") {
            return this.constructor.name;
        } else {
            return `ScopeTask(${this.scopeType})`;
        }
    }
}

export interface SequenceAwareTask extends GameTask {
    sequencePrepare(previous: GameTask | null, next: GameTask | null, parent: GameTask): {
        runInBackground: boolean
    } | void;
}

function isSeqAware(t: GameTask): t is SequenceAwareTask {
    return (t as SequenceAwareTask).sequencePrepare !== undefined;
}