import {duelLogError} from "../log.ts";
import {DuelGame} from "../duel.ts";
import {GameScene} from "../game/GameScene.ts";

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
export abstract class GameTask {
    #state: GameTaskState = GameTaskState.PENDING;
    #onComplete: (() => void) | null = null;

    get state() {
        return this.#state;
    }

    start() {
        if (this.#state !== GameTaskState.PENDING) {
            duelLogError("Cannot start a game task twice.")
        }

        this.#state = GameTaskState.RUNNING;
        this.run();
    }
    
    // Called by DuelController if the task is running.
    tick(scene: GameScene) {}

    protected run() {
        this.complete();
    }

    protected complete() {
        this.#state = GameTaskState.COMPLETE;
        if (this.#onComplete !== null) {
            this.#onComplete();
            this.#onComplete = null;
        }
    }

    then(onComplete: () => void) {
        if (this.#state === GameTaskState.COMPLETE || this.#state === GameTaskState.FAILED) {
            onComplete();
            return;
        }

        if (this.#onComplete !== null) {
            this.#onComplete = onComplete;
        } else {
            duelLogError("Cannot await/then a game task twice.")
        }

        if (this.#state !== GameTaskState.RUNNING) {
            this.start();
        }
    }
}

export enum GameTaskState {
    PENDING,
    RUNNING,
    COMPLETE,
    FAILED
}