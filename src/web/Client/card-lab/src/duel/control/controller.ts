import type {DuelGame} from "../duel.ts";
import {GameScene} from "../game/GameScene.ts";
import {duelLog, duelLogError} from "../log.ts";
import {LocalDuelPropositions, LocalDuelState, toLocalIndex} from "./state.ts";
import {GameTask, GameTaskState} from "./task.ts";
import {Ticker, UPDATE_PRIORITY} from "pixi.js";
import {ShowMessageTask} from "./tasks/ShowMessageTask.ts";
import {DefaultScopeTask} from "src/duel/control/tasks/DefaultScopeTask.ts";

function isScopeDelta(d: NetDuelDelta): d is NetDuelScopeDelta {
    return 'state' in d; // HMMMM I'm sure this is gonna blow up someday
}

type NetDeltaLeaf = Exclude<NetDuelDelta, NetDuelScopeDelta>;

type DeltaFuncMap = {
    [T in NetDeltaLeaf["type"]]?: (delta: NetDuelDeltaOf<T>) => GameTask | null
}
type ScopeFuncMap = {
    [T in NetDuelScopeDelta["type"]]?: (node: ScopeMutationNode<T>) => GameTask
}

type LeafMutationNode = {
    isLeaf: true,
    delta: Exclude<NetDuelDelta, NetDuelScopeDelta>
}

type ScopeMutationNode<T = NetDuelScopeDelta | null> = {
    isLeaf: false,
    scope: T // null if root node
    preparationNodes: MutationNode[], // todo in server
    childNodes: MutationNode[],
}

type MutationNode =
    | LeafMutationNode
    | ScopeMutationNode

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
        runningTask: GameTask
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

        this.game.app.ticker.add(this.tick, this, UPDATE_PRIORITY.LOW);
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
            this.playMutation(ticker);
        }
    }

    startMutation(m: DuelMessageOf<"duelMutated">) {
        if (this.mut !== null) {
            this.mutationQueue.push(m);
            return;
        } else {
            duelLog(`Starting mutation to iteration ${m.iteration} with ${m.deltas.length} deltas`)

            const tree = this.buildMutationTree(m);
            const task = this.applyScope(tree);

            console.log("Tree: ", tree);
            console.log("Task: ", task);
            
            this.mut = {
                runningTask: task,
                nextIteration: m.iteration
            };
        }
    }

    buildMutationTree(m: DuelMessageOf<"duelMutated">): ScopeMutationNode<null> {
        let i = 0;

        function next(): NetDuelDelta | null {
            if (i >= m.deltas.length) {
                return null;
            }
            return m.deltas[i++];
        }

        function parseScope<T extends NetDuelScopeDelta | null>(d: T): ScopeMutationNode<T> {
            const node: ScopeMutationNode<T> = {isLeaf: false, scope: d, preparationNodes: [], childNodes: []};
            let nextDelta = next();
            while (nextDelta != null && (!isScopeDelta(nextDelta) || nextDelta.state !== "end")) {
                node.childNodes.push(parse(nextDelta));
                nextDelta = next();
            }
            if (nextDelta === null && d !== null) {
                throw new Error(`Unclosed scope ${d?.type}`);
            }
            return node;
        }

        function parseLeaf(d: Exclude<NetDuelDelta, NetDuelScopeDelta>): LeafMutationNode {
            return {isLeaf: true, delta: d};
        }

        function parse(d: NetDuelDelta): MutationNode {
            if (isScopeDelta(d)) {
                return parseScope(d);
            } else {
                return parseLeaf(d);
            }
        }

        return parseScope(null);
    }

    playMutation(ticker: Ticker) {
        if (this.mut === null) {
            return;
        }

        const task = this.mut.runningTask;
        if (task.state === GameTaskState.PENDING) {
            task.start(null);
        } else if (task.state === GameTaskState.RUNNING) {
            task.runTick(ticker);
        }

        if (task.state === GameTaskState.COMPLETE) {
            // end mutation
            this.clientIteration = this.mut.nextIteration;
            this.mut = null;
            if (this.mutationQueue.length > 0) {
                const next = this.mutationQueue.shift()!;
                this.startMutation(next);
            }
        } else if (task.state === GameTaskState.FAILED) {
            // todo: panic?? reset to latest known state?
            duelLogError(`Mutation task failed!`, task);
        }
    }

    applyNode(node: MutationNode): GameTask | null {
        let t: GameTask | null;
        if (node.isLeaf) {
            t = this.applyDelta(node.delta);
        } else {
            t = this.applyScope(node);
        }
        if (t) {
            t.meta = node
        }
        return t;
    }

    applyScope(node: ScopeMutationNode): GameTask {
        if (node.scope && node.scope.type in this.scopeFuncs) {
            return this.scopeFuncs[node.scope.type]!(node as any);
        }

        // Default implementation.
        const preparationTasks = node.preparationNodes.map(n => this.applyNode(n));
        const childTasks = node.childNodes.map(n => this.applyNode(n));
        return new DefaultScopeTask(node.scope?.type ?? "root", preparationTasks, childTasks);
    }

    applyDelta(delta: NetDeltaLeaf): GameTask | null {
        const type = delta.type;
        if (!(type in this.deltaFuncs)) {
            duelLogError(`Don't know what to do with this delta (${type})!`, delta);
            return null;
        }

        const f = this.deltaFuncs[type]!;
        return f(delta as any);
    }

    deltaFuncs: DeltaFuncMap = {
        "switchTurn": delta => {
            this.state.updateTurn(delta.newTurn, delta.whoPlays);
            return new GameTask("SwitchTurn",() => {
                this.scene.showTurnIndicator(this.state.whoseTurn);
                return new ShowMessageTask(this.scene, `Tour de J${this.state.whoseTurn + 1}`, 1.5)
            });
        },
        "switchStatus": delta => {
            this.state.status = delta.status;
            return new GameTask("SwitchStatus",() => this.scene.messageBanner.hide())
        },
        "updateEnergy": delta => {
            const idx = toLocalIndex(delta.player);
            const p = this.state.players[idx]
            p.energy = delta.newEnergy
            p.maxEnergy = delta.newMaxEnergy
            return new GameTask("UpdateEnergy", () =>
                this.scene.energyCounters[idx].update(delta.newEnergy, delta.newMaxEnergy))
        },
        "revealCards": delta => {
            this.state.revealCards(delta.revealedCards)
            this.state.hideCards(delta.hiddenCards)
            // TODO: Create card avatars and remove unknown cards
            return null;
        }
    }

    scopeFuncs: ScopeFuncMap = {}

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