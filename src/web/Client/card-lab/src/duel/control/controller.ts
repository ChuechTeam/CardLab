import type {DuelGame} from "../duel.ts";
import {GameScene} from "../game/GameScene.ts";
import {duelLog, duelLogError} from "../log.ts";
import {LocalDuelPropositions, LocalDuelState, toLocalIndex} from "./state.ts";
import {GameTask, GameTaskState} from "./task.ts";
import {Ticker} from "pixi.js";
import {ShowMessageTask} from "./ShowMessageTask.ts";

function isScopeDelta(d: NetDuelDelta): d is NetDuelScopeDelta {
    return 'state' in d; // HMMMM I'm sure this is gonna blow up someday
}

type DeltaFuncMap = {
    [T in NetDuelDelta["type"]]?:
    (delta: NetDuelDeltaOf<T>, scopeStack: NetDuelScopeDelta[]) => GameTask | null
}

// The duel controller "plays" the game by sequentially applying game state deltas from the server.
// Each delta can be applied instantly or over time, depending on the task used.
// It schedules all game animations and UI updates.
export class DuelController {
    // The current state. During a mutation, it represents the state at the end of it (for now!).
    state: LocalDuelState
    // The latest propositions given by the server.
    propositions: LocalDuelPropositions
    // The index of the local player (0 or 1) ; (player 1 or player 2)
    playerIndex: LocalDuelPlayerIndex
    // The game scene (this one's easy)
    scene: GameScene

    // The iteration number of the displayed game state.
    clientIteration: number

    // The iteration number of the last received game state.
    serverIteration: number

    // The state of the ongoing mutation: applying deltas sequentially, and running their related game tasks.
    mut: {
        taskQueue: GameTask[]
        runningTasks: GameTask[]
        simultaneousGroup: string | null;
        // The pending deltas to apply, excluding the one running (includes scopes).
        // The array is actually the list of deltas, but reversed, so we can pop deltas from the end.
        // deltaQueue: NetDuelDelta[]
        // The stack of all active scopes.
        // scopeStack: NetDuelScopeDelta[]
        nextIteration: number
    } | null = null

    // Pending mutations that haven't been applied yet.
    // We could apply those instantly if the client is too late.
    mutationQueue: DuelMessageOf<"duelMutated">[] = []

    constructor(public game: DuelGame, welcomeMsg: DuelMessageOf<"duelWelcome">) {
        duelLog("Creating DuelController from welcome message", welcomeMsg)
        this.state = new LocalDuelState(welcomeMsg.state);
        this.propositions = new LocalDuelPropositions(welcomeMsg.propositions);

        this.clientIteration = this.serverIteration = welcomeMsg.iteration;

        if (welcomeMsg.player == "p1") {
            this.playerIndex = 0;
        } else {
            this.playerIndex = 1;
        }

        // DEBUG ONLY: skip scene setup when wanted (for testing all UI elements)
        const params = new URLSearchParams(location.search);
        const debugScene = params.has("debugScene") || params.has("d");
        this.scene = new GameScene(this.game, this.playerIndex, debugScene);

        if (!debugScene) {
            this.setupScene();
        }

        this.game.app.ticker.add(this.tick, this);
    }

    displayGameScene() {
        if (this.game.scene !== this.scene) {
            this.game.switchScene(this.scene);
        }
    }

    receiveMessage(msg: DuelMessage) {
        if (msg.type === "duelWelcome") {
            this.tearDownScene()
            this.setupScene()
        } else if (msg.type === "duelMutated") {
            this.startMutation(msg)
        }
    }

    tick(ticker: Ticker) {
        if (this.mut !== null) {
            // Queue the mutation update in a microtask so we're guaranteed
            // that the game tasks run at the very end of the tick.
            // This is necessary for consistency as async/await always produce
            // delayed responses with microtasks, even when the task is effectively
            // synchronous.
            queueMicrotask(() => this.playMutation(ticker));
        }
    }

    startMutation(m: DuelMessageOf<"duelMutated">) {
        if (this.mut !== null) {
            this.mutationQueue.push(m);
            return;
        } else {
            duelLog(`Starting mutation to iteration ${m.iteration} with ${m.deltas.length} deltas`)
            const deltaQueue = [...m.deltas].reverse();
            const scopeStack = [] as NetDuelScopeDelta[];
            const taskList = [] as GameTask[];
            this.mut = {
                taskQueue: [],
                runningTasks: [],
                simultaneousGroup: null,
                nextIteration: m.iteration
            };

            while (deltaQueue.length > 0) {
                const delta = deltaQueue.pop()!;
                if (isScopeDelta(delta)) {
                    if (delta.state === "start") {
                        scopeStack.push(delta);
                    } else {
                        scopeStack.pop();
                    }
                    continue;
                }

                const task = this.applyDelta(delta, scopeStack);
                if (task !== null) {
                    if (Array.isArray(task)) {
                        duelLog(`Delta ${delta.type} produced tasks: ${task}`)
                        taskList.push(...task);
                    } else {
                        duelLog(`Delta ${delta.type} produced task: ${task}`)
                        taskList.push(task);
                    }
                }
                duelLog(`Delta ${delta.type} produced no task`)
            }
            this.mut.taskQueue = taskList.reverse();
            // The mutation will be played in the next tick.
        }
    }

    playMutation(ticker: Ticker) {
        if (this.mut === null) {
            return;
        }

        for (let i = 0; i < this.mut.runningTasks.length; i++) {
            const task = this.mut.runningTasks[i];
            task.runTick(ticker, this.scene);
            if (task.state !== GameTaskState.RUNNING) {
                this.mut.runningTasks.splice(i, 1);
                i--;
            }
            if (task.state === GameTaskState.COMPLETE) {
                duelLog(`Task ${task} completed deferred.`);
            } else if (task.state === GameTaskState.FAILED) {
                duelLogError(`Task ${task} failed deferred!`);
            }
        }

        while (this.mut.taskQueue.length > 0) {
            const task = this.mut.taskQueue[this.mut.taskQueue.length - 1];
            // TODO: Check simultaneous groups
            if (this.mut.runningTasks.length === 0) { // If should run task
                this.mut.taskQueue.pop();
                task.start();
                if (task.state === GameTaskState.RUNNING) {
                    this.mut.runningTasks.push(task);
                } else if (task.state === GameTaskState.COMPLETE) {
                    duelLog(`Task ${task} completed instantly.`);
                } else if (task.state === GameTaskState.FAILED) {
                    duelLogError(`Task ${task} failed instantly!`);
                }
            } else {
                break;
            }
        }

        if (this.mut.taskQueue.length === 0) {
            // end mutation
            this.clientIteration = this.mut.nextIteration;
            this.mut = null;
            if (this.mutationQueue.length > 0) {
                const next = this.mutationQueue.shift()!;
                this.startMutation(next);
            }
        }
    }

    applyDelta(delta: NetDuelDelta, scopeStack: NetDuelScopeDelta[]): GameTask[] | GameTask | null {
        const type = delta.type;
        if (!(type in this.deltaFuncs)) {
            duelLogError(`Don't know what to do with this delta (${type})!`, delta);
            return null;
        }

        const f = this.deltaFuncs[type]!;
        return f(delta as any, scopeStack);
    }

    deltaFuncs: DeltaFuncMap = {
        "switchTurn": delta => {
            this.state.updateTurn(delta.newTurn, delta.whoPlays);
            return new GameTask(async t => {
                this.scene.showTurnIndicator(this.state.whoseTurn);
                await t.compose(new ShowMessageTask(this.scene,
                    `Tour de J${this.state.whoseTurn + 1}`, 1.5))
            });
        },
        "switchStatus": delta => {
            this.state.status = delta.status;
            return new GameTask(() => this.scene.messageBanner.hide())
        },
        "updateEnergy": delta => {
            const idx = toLocalIndex(delta.player);
            const p = this.state.players[idx]
            p.energy = delta.newEnergy
            p.maxEnergy = delta.newMaxEnergy
            return new GameTask(() =>
                this.scene.energyCounters[idx].update(delta.newEnergy, delta.newMaxEnergy))
        },
        "revealCards": delta => {
            this.state.revealCards(delta.revealedCards)
            this.state.hideCards(delta.hiddenCards)
            // TODO: Create card avatars and remove unknown cards
            return null;
        }
    }

    // Removes all created avatars (units and cards) from the scene.
    tearDownScene() {
        // todo!
        duelLog("Tearing down scene");
    }

    // Builds the scene from the current state, including units, cards, and UI elements.
    // Skips any spawn-related animations.
    setupScene() {
        duelLog("Setting up scene");

        for (let i = 0; i < 2; i++) {
            const counter = this.scene.energyCounters[i]
            counter.update(this.state.players[i].energy, this.state.players[i].maxEnergy)
        }
        for (let i = 0; i < 2; i++) {
            const core = this.scene.cores[i]
            core.update(this.state.players[i].coreHealth);
        }

        if (this.state.status === "awaitingConnection") {
            this.scene.messageBanner.show("En attente de l'autre joueur...", -1);
        } else if (this.state.status === "playing") {
            this.scene.showTurnIndicator(this.state.whoseTurn);
        }
    }
}