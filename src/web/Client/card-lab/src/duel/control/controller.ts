import type {DuelGame} from "../duel.ts";
import {Point} from "pixi.js";
import {GameScene} from "../game/GameScene.ts";
import {duelLog} from "../log.ts";
import {LocalDuelPropositions, LocalDuelState} from "./state.ts";
import {GameTask} from "./task.ts";

// The duel controller "plays" the game by sequentially applying game state deltas from the server.
// Each delta can be applied instantly or over time, depending on the task used.
// It schedules all game animations and UI updates.
export class DuelController {
    // The current state as it is incrementally updated during a mutation.
    // Each delta is applied instantly, but the next delta is applied only after the task is complete.
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
        // The pending deltas to apply, excluding the one running (includes scopes).
        // The array is actually the list of deltas, but reversed, so we can pop deltas from the end.
        deltaQueue: NetDuelDelta[]
        // The stack of all active scopes.
        scopeStack: NetDuelScopeDelta[]
        runningTask: GameTask | null
        runningDelta: NetDuelDelta | null
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
    
    tick() {
        if (this.mut !== null) {
            // Queue the mutation update in a microtask so we're guaranteed
            // that the game tasks run at the very end of the tick.
            // This is necessary for consistency as async/await always produce
            // delayed responses with microtasks, even when the task is effectively
            // synchronous.
            queueMicrotask(() => this.playMutation());
        }
    }
    
    playMutation() {
        // todo!
    }
    
    startMutation(m: DuelMessageOf<"duelMutated">) {
        if (this.mut !== null) {
            this.mutationQueue.push(m);
            return;
        } else {
            this.mut = {
                deltaQueue: [...m.deltas].reverse(),
                scopeStack: [],
                runningTask: null,
                runningDelta: null,
                nextIteration: m.iteration
            }
            // The mutation will be played in the next tick.
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