import {duelLogError} from "../log.ts";
import {DuelGame} from "../duel.ts";
import {GameScene} from "../game/GameScene.ts";
import {Ticker, TickerCallback} from "pixi.js";

// A game task is an action that can complete either:
// - instantly; or
// - after a certain amount of time.
//
// Game tasks should be used to chain together game animations that change the game state.
// They're supposed to be run sequentially, although they can trigger asynchronous animations in the background,
// which should NOT change the state of avatars, and should only be used for visual effects.
// (Example: a unit can play an animation to be destroyed, but its state should become "destroyed", not "destroying".)
// Game tasks can also in turn call other game tasks, but multiple tasks cannot run simultaneously.
//
// Game tasks all start at the end of a frame tick. (Should this be changed? I don't know, it's handy)
//
// You can compare them to Unity's coroutines, which are very similar.
export class GameTask {
    #state: GameTaskState = GameTaskState.PENDING;
    #onComplete: (() => any) | null = null;
    #onFail: ((e: Error) => any) | null = null;
    #subTask: GameTask | null = null

    constructor(runner?: (task: GameTask) => Promise<any> | void) {
        if (runner) {
            this.run = () => {
                const r = runner(this);
                if (r instanceof Promise) {
                    r.then(() => this.complete()).catch(e => this.fail(e));
                } else {
                    this.complete();
                }
            }
        }
    }

    get state() {
        return this.#state;
    }

    start() {
        if (this.#state !== GameTaskState.PENDING) {
            duelLogError("Cannot start a game task twice.")
        }

        this.#state = GameTaskState.RUNNING;
        try {
            this.run();
        } catch (e) {
            duelLogError(`Game task ${this.name} failed during run:`, e);
            this.#state = GameTaskState.FAILED;
        }
    }

    protected run() {}

    protected complete() {
        this.#state = GameTaskState.COMPLETE;
        if (this.#onComplete !== null) {
            this.#onComplete();
            this.#onComplete = null;
        }
    }

    protected fail(e: Error) {
        this.#state = GameTaskState.FAILED;
        if (this.#onFail !== null) {
            this.#onFail(e);
            this.#onFail = null;
        }
    }

    // The tick function is always called at the very end of the frame.
    protected tick(ticker: Ticker, scene: GameScene) {
    }

    // Called by the DuelController
    runTick(ticker: Ticker, scene: GameScene) {
        if (this.#subTask) {
            this.#subTask.runTick(ticker, scene)
        }
        if (this.state === GameTaskState.RUNNING) {
            this.tick(ticker, scene)
        }
    }

    registerCallbacks(onComplete: () => any, onReject: (e: Error) => any) {
        if (this.#state === GameTaskState.COMPLETE) {
            onComplete();
            return;
        } else if (this.#state === GameTaskState.FAILED) {
            onReject(new Error("Task failed."));
            return;
        }

        if (this.#onComplete === null) {
            this.#onComplete = onComplete;
            this.#onFail = onReject;
        } else {
            duelLogError("Cannot await/then a game task twice.")
        }
    }

    compose(task: GameTask): Promise<void> {
        if (this.#subTask) {
            throw new Error("Cannot await two game tasks simultaneously.");
        }

        this.#subTask = task;
        return new Promise((resolve, reject) => {
            task.registerCallbacks(() => {
                this.#subTask = null;
                // todo: complete on next tick to avoid timing surprises?
                resolve();
            }, e => {
                this.#subTask = null;
                // todo: complete on next tick to avoid timing surprises?
                reject(e);
            })
            task.start()
        });
    }

    get name() {
        return this.constructor.name;
    }
    
    toString() {
        return this.name;
    }
}

export enum GameTaskState {
    PENDING,
    RUNNING,
    COMPLETE,
    FAILED
}