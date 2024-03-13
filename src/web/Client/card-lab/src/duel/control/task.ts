import {duelLog, duelLogDebug, duelLogError} from "../log.ts";
import {DuelGame} from "../duel.ts";
import {GameScene} from "../game/GameScene.ts";
import {Ticker, TickerCallback} from "pixi.js";

export enum GameTaskState {
    PENDING,
    RUNNING,
    COMPLETE,
    FAILED
}

// A game task is an action that can complete either:
// - instantly; or
// - after a certain amount of time.
//
// Game tasks should be used to chain together game animations that change the game state.
// They're supposed to be run sequentially, although they can trigger asynchronous animations in the background,
// which should NOT change the state of avatars, and should only be used for visual effects.
// (Example: a unit can play an animation to be destroyed, but its state should become "destroyed", not "destroying".)
// Multiple tasks can run simultaneously if desired.
//
// You can compare them to Unity's coroutines, which are very similar.
export class GameTask {
    state: GameTaskState = GameTaskState.PENDING;
    runningGenerator: Generator<GameTask> | null = null;
    failure: Error | null = null; // Not null when state = FAILED.

    // The task to notify when this task completes (or fails).
    taskWaitingForMe: GameTask | null = null;
    // The task who created this task. Null when this is the root task.
    parent: GameTask | null = null;
    // All subtasks running within this task. Tasks are removed once they complete or fail.
    children: GameTask[] = [];

    name: string | null = null // The debug name of the task.
    meta: any = null // Some whatever object for debugging. (usually the node from the tree)

    constructor(name?: string, runFunc?: (task: GameTask) => Generator<GameTask> | GameTask | any) {
        if (runFunc != null) {
            this.run = function* () {
                const result = runFunc(this);
                if (result != null) {
                    if (result instanceof GameTask) {
                        yield result;
                    } else {
                        yield* result;
                    }
                }
            };
        }
        if (name != null) {
            this.name = name;
        }
    }

    start(parent: GameTask | null) {
        if (this.state !== GameTaskState.PENDING) {
            throw new Error("Cannot start a game while not in PENDING state.");
        }

        duelLog(`Starting task ${this}`, this.meta)

        this.state = GameTaskState.RUNNING;
        if (parent) {
            this.parent = parent;
            parent.children.push(this);
        }
        try {
            const gen = this.run();
            if (gen) {
                this.runningGenerator = gen;
                this.continueExecution();
            } else {
                // Not using a generator, uses complete or fail.
                this.runningGenerator = null;
            }
        } catch (e) {
            // If someone throws something that is not an error, they're a psychopath.
            this.fail(e as Error);
        }
    }

    run(): Generator<GameTask> | void {
    }

    tick(ticker: Ticker) {
    }

    runTick(ticker: Ticker) {
        const tasksCopy = [...this.children]
        for (const task of tasksCopy) {
            task.runTick(ticker);
        }

        if (this.state === GameTaskState.RUNNING) {
            try {
                this.tick(ticker);
            } catch (e) {
                duelLogError(`Error in task ${this} tick: ${(e as Error).message}`);
                this.fail(e as Error);
            }
        }
    }

    continueExecution() {
        if (this.runningGenerator === null) {
            throw new Error("Task is not running a generator.");
        }

        const result = this.runningGenerator.next();
        if (result.done) {
            this.complete();
            return;
        } else {
            const task = result.value;
            if (task.state === GameTaskState.PENDING) {
                task.start(this);
            }

            if (task.state === GameTaskState.COMPLETE) {
                this.continueExecution();
            } else if (task.state === GameTaskState.FAILED) {
                this.fail(task.failure!);
            } else {
                if (task.taskWaitingForMe === null) {
                    task.taskWaitingForMe = this;
                } else {
                    this.fail(new Error(`A task cannot be waited for twice: ${task}`))
                }
            }
        }
    }

    fail(e: Error) {
        this.failure = e;
        this.state = GameTaskState.FAILED;

        duelLogError(`Task ${this} failed: ${e.message}`, this.meta);

        if (this.taskWaitingForMe) {
            this.taskWaitingForMe.fail(new Error(`Child task ${this} failed: ${e.message}.`, {cause: e}));
        }
        this.parent?.clearTaskChild(this)
    }

    complete() {
        if (this.state !== GameTaskState.RUNNING) {
            throw new Error("Cannot complete a task that is not running.");
        }
        if (this.children.length !== 0) {
            for (const child of this.children) {
                if (child.state === GameTaskState.RUNNING) {
                    throw new Error("Cannot complete a task while it has subtasks still running.");
                }
            }
        }

        duelLog(`Completed task ${this}`, this.meta)

        this.state = GameTaskState.COMPLETE;

        if (this.taskWaitingForMe) {
            this.taskWaitingForMe.continueExecution();
        }
        this.parent?.clearTaskChild(this)
    }

    clearTaskChild(t: GameTask) {
        this.children.splice(this.children.indexOf(t), 1);
    }

    toString() {
        return this.name ?? this.constructor.name;
    }
}