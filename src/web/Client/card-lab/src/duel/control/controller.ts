import type {DuelGame} from "../duel.ts";
import {GameScene} from "../game/GameScene.ts";
import {duelLog, duelLogError} from "../log.ts";
import {
    KnownLocalDuelCard,
    LocalDuelArenaPosition,
    LocalDuelPlayerState,
    LocalDuelPropositions,
    LocalDuelState,
    LocalDuelUnit,
    stateSnapshot,
    toLocalIndex,
    toNetPos, UnknownLocalDuelCard
} from "./state.ts";
import {GameTask, GameTaskState} from "./task.ts";
import {Ticker, UPDATE_PRIORITY} from "pixi.js";
import {ShowMessageTask} from "./tasks/ShowMessageTask.ts";
import {ScopeTask} from "src/duel/control/tasks/ScopeTask.ts";
import {GameAvatars} from "src/duel/control/avatar.ts";
import {RevealCardsTask} from "src/duel/control/tasks/RevealCardsTask.ts";
import {MoveCardsTask} from "src/duel/control/tasks/MoveCardsTask.ts";
import {RequestResult} from "src/duel/messaging.ts";
import {TurnButtonState} from "src/duel/game/TurnButton.ts";
import {UpdatePlayerAttribsTask} from "src/duel/control/tasks/UpdatePlayerAttribsTask.ts";
import {PlaceUnitTask} from "src/duel/control/tasks/PlaceUnitTask.ts";
import {UpdateUnitAttribsTask} from "src/duel/control/tasks/UpdateUnitAttribsTask.ts";
import {UnitAttackScopeTask} from "src/duel/control/tasks/UnitAttackScopeTask.ts";
import {UnitDeathScopeTask} from "src/duel/control/tasks/UnitDeathScopeTask.ts";
import {DestroyUnitTask} from "src/duel/control/tasks/DestroyUnitTask.ts";
import {DamageScopeTask} from "src/duel/control/tasks/DamageScopeTask.ts";
import {CardPlayScopeTask} from "src/duel/control/tasks/CardPlayScopeTask.ts";
import {EffectScopeTask} from "src/duel/control/tasks/EffectScopeTask.ts";
import {UnitTriggerScopeTask} from "src/duel/control/tasks/UnitTriggerScopeTask.ts";
import {HealScopeTask} from "src/duel/control/tasks/HealScopeTask.ts";
import {CardDrawScopeTask} from "src/duel/control/tasks/CardDrawScopeTask.ts";
import {UpdateCardAttribsTask} from "src/duel/control/tasks/UpdateCardAttribsTask.ts";
import {AlterationScopeTask} from "src/duel/control/tasks/AlterationScopeTask.ts";
import {YOUR_TURN_MAX_TIME} from "src/duel/game/YourTurnOverlay.ts";

function isScopeDelta(d: NetDuelDelta): d is NetDuelScopeDelta {
    return 'isScope' in d;
}

type NetDeltaLeaf = Exclude<NetDuelDelta, NetDuelScopeDelta>;

type DeltaFuncMap = {
    [T in NetDeltaLeaf["type"]]?: (delta: NetDuelDeltaOf<T>, scope: ScopeMutationNode) => GameTask | null
}
type ScopeFuncMap = {
    [T in NetDuelScopeDelta["type"]]?: (node: ScopeMutationNode<NetDuelDeltaOf<T>>) => GameTask
}

type LeafMutationNode = {
    isLeaf: true,
    delta: Exclude<NetDuelDelta, NetDuelScopeDelta>
}

type ScopeMutationNode<T = NetDuelScopeDelta | null> = {
    isLeaf: false,
    scope: T // null if root node
    preparationNodes: MutationNode[],
    childNodes: MutationNode[],
}

type MutationNode =
    | LeafMutationNode
    | ScopeMutationNode

const TIMER_EPSILON = 250;
// that's a long variable name
const FAST_FORWARD_AFTER_BACKGROUND_THRESHOLD = 6000; // milliseconds

// The duel controller "plays" the game by sequentially applying game state deltas from the server.
// Each delta can be applied instantly or over time, depending on the task used.
// It schedules all game animations and UI updates.
export class DuelController {
    // The current state. During a mutation, it represents the state at the end of it.
    state: LocalDuelState
    // The latest propositions given by the server.
    propositions: LocalDuelPropositions
    // The index of the local player (0 or 1) ; (player 1 or player 2)
    playerIndex: LocalDuelPlayerIndex
    // The remaining time of the timer, in milliseconds
    timer: number | null = null
    // Whether the timer is paused (during a mutation)
    timerPaused: boolean = false
    // The last iteration that updated the timer
    timerIteration: number = -1
    // The game scene (this one's easy)
    scene: GameScene
    // The game avatars (units and cards) currently displayed in the scene.
    avatars: GameAvatars

    // The iteration number of the displayed game state.
    clientIteration: number
    // Whose turn is it on the client.
    clientWhoseTurn: LocalDuelPlayerIndex

    // The iteration number of the last received game state.
    serverIteration: number
    // Whose turn is it on the server.
    serverWhoseTurn: LocalDuelPlayerIndex
    
    // Names of both players
    names: string[]

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
        this.clientWhoseTurn = this.serverWhoseTurn = this.state.whoseTurn;
        this.clientIteration = this.serverIteration = welcomeMsg.iteration;

        if (welcomeMsg.player == "p1") {
            this.playerIndex = 0;
        } else {
            this.playerIndex = 1;
        }

        this.timer = welcomeMsg.timer;
        this.names = [welcomeMsg.p1Name, welcomeMsg.p2Name];

        // DEBUG ONLY: skip scene setup when wanted (for testing all UI elements)
        const params = new URLSearchParams(location.search);
        const debugScene = params.has("debugScene") || params.has("d");
        this.scene = new GameScene(this.game, this.playerIndex, debugScene);
        this.avatars = new GameAvatars(this.scene, this);
        if (!debugScene) {
            this.setupScene();
        }

        if (this.state.status === "awaitingConnection") {
            this.game.messaging.sendMessage({type: "duelReportReady"});
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
            if (msg.iteration !== this.serverIteration) {
                this.fastForward(msg);
            }
        } else if (msg.type === "duelMutated") {
            this.serverIteration = msg.iteration;
            this.serverWhoseTurn = toLocalIndex(msg.whoseTurn);
            this.startMutation(msg)
        } else if (msg.type === "duelTimerUpdated") {
            // Don't update the timer if we're "close enough" (to avoid jitter)
            this.updateTimer(msg.timer, this.serverIteration, false)
        }
    }

    tick(ticker: Ticker) {
        if (this.mut !== null) {
            this.playMutation(ticker);
        }

        // todo: timer correctly when unfocused
        if (!this.timerPaused && this.timer !== null) {
            this.timer -= ticker.elapsedMS;
            if (this.timer < 0) {
                this.timer = 0;
            }
        }

        this.scene.turnTimer.update(this.timer)
    }

    startMutation(m: DuelMessageOf<"duelMutated">) {
        if (this.mut !== null) {
            this.mutationQueue.push(m);
            this.updateTimer(m.timer, m.iteration)
        } else {
            duelLog(`Starting mutation to iteration ${m.iteration} with ${m.deltas.length} deltas`)

            this.state.removeDeadUnits();
            this.avatars.deadUnitsPositions.clear();
            const tree = this.buildMutationTree(m);
            const task = this.applyScope(tree);
            this.propositions = new LocalDuelPropositions(m.propositions);

            console.log("Tree: ", tree);
            console.log("Task: ", task);
            console.log("Propositions: ", this.propositions);

            this.mut = {
                runningTask: task,
                nextIteration: m.iteration
            };

            this.updateTimer(m.timer, m.iteration, true)
            this.pauseGameplay();
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
            while (nextDelta != null && nextDelta.type != "scopeEnd") {
                if (nextDelta.type !== "scopePreparationEnd") {
                    node.childNodes.push(parse(nextDelta));
                } else {
                    node.preparationNodes = node.childNodes;
                    node.childNodes = [];
                }
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
            this.clientWhoseTurn = this.state.whoseTurn;
            this.mut = null;
            if (this.mutationQueue.length > 0) {
                const next = this.mutationQueue.shift()!;
                this.startMutation(next);
            } else {
                // Mutations ended, we can let the player play the game (shocking!)
                this.resumeGameplay()
            }
        } else if (task.state === GameTaskState.FAILED) {
            duelLogError(`Mutation task failed!`, task);
            this.fastForward();
        }
    }

    // this makes timer handling a bit broken but eh...
    pauseGameplay() {
        this.scene.interaction.block();
        this.requestTimerControl(true);
    }

    resumeGameplay() {
        this.updateScenePropositions();
        this.scene.interaction.unblock();
        this.timerPaused = false;
        this.requestTimerControl(false);
    }

    requestTimerControl(pause: boolean) {
        if (this.clientWhoseTurn === this.playerIndex) {
            this.game.messaging.sendMessage({
                type: "duelControlTimer",
                pause
            })
        }
    }

    updateTimer(t: number | null, iteration: number, pause?: boolean) {
        if (iteration < this.timerIteration) {
            return;
        }

        // Don't update the timer if we're "close enough" (to avoid jitter)
        if (this.timer === null || t === null || Math.abs(this.timer - t) > TIMER_EPSILON) {
            this.timer = t;
        }
        if (pause !== undefined) {
            this.timerPaused = pause;
        }
        this.timerIteration = iteration;
    }

    applyNode(node: MutationNode, scope: ScopeMutationNode): GameTask | null {
        let t: GameTask | null;
        if (node.isLeaf) {
            t = this.applyDelta(node.delta, scope);
        } else {
            t = this.applyScope(node);
        }
        if (t) {
            t.meta = node
        }
        return t;
    }

    buildScopeTasks(node: ScopeMutationNode,
                    applyFunc = (child: MutationNode) => this.applyNode(child, node)): [GameTask[], GameTask[]] {
        const prepTasks = [] as GameTask[];
        const childTasks = [] as GameTask[];

        for (let prep of node.preparationNodes) {
            const task = applyFunc(prep);
            if (task !== null) {
                prepTasks.push(task);
            }
        }

        for (let child of node.childNodes) {
            const task = applyFunc(child);
            if (task !== null) {
                childTasks.push(task);
            }
        }

        return [prepTasks, childTasks];
    }

    applyScope(node: ScopeMutationNode): GameTask {
        if (node.scope && node.scope.type in this.scopeFuncs) {
            return this.scopeFuncs[node.scope.type]!(node as any);
        }

        // Default implementation.
        const task = new ScopeTask(...this.buildScopeTasks(node));
        task.scopeType = node.scope?.type ?? "root";
        return task;
    }

    applyDelta(delta: NetDeltaLeaf, scope: ScopeMutationNode): GameTask | null {
        const type = delta.type;
        if (!(type in this.deltaFuncs)) {
            duelLogError(`Don't know what to do with this delta (${type})!`, delta);
            return null;
        }

        const f = this.deltaFuncs[type]!;
        return f(delta as any, scope);
    }

    deltaFuncs: DeltaFuncMap = {
        "switchTurn": delta => {
            this.state.updateTurn(delta.newTurn, delta.whoPlays);
            
            const state = this.state;
            const scene = this.scene;
            const whoseTurn = this.state.whoseTurn;
            const meIndex = this.playerIndex;
            const canEndTurn = this.canEndTurn;
            return new GameTask("SwitchTurn", function*() {
                scene.showTurnIndicator(whoseTurn);
                scene.turnButton.switchState(canEndTurn ? TurnButtonState.AVAILABLE : TurnButtonState.OPPONENT_TURN);
                scene.cardInfoTooltip.hide();
                for (let [id, u] of scene.units) {
                    const unit = state.units.get(id);
                    if (unit !== undefined) {
                        u.updateVisualData({
                            actionsShown: unit.owner === whoseTurn
                        });
                    }
                }
                if (whoseTurn === meIndex) {
                    scene.yourTurnOverlay.show();
                    yield GameTask.wait(YOUR_TURN_MAX_TIME-0.2);
                } else {
                    yield GameTask.wait(0.6);
                }
            });
        },
        "switchStatus": delta => {
            this.state.status = delta.status;
            if (delta.winner !== null) this.state.winner = toLocalIndex(delta.winner)

            return new GameTask("SwitchStatus", () => {
                this.scene.messageBanner.hide();
                if (delta.status === "ended") {
                    let winner = this.state.winner;
                    this.scene.duelEndOverlay.show(
                        winner === this.playerIndex ? "win"
                            : winner !== null ? "lose" : "terminated",
                    )
                }
            })
        },
        "updateEntityAttribs": delta => {
            const prev = stateSnapshot(this.state.findEntity(delta.entityId)!.attribs);
            const entity = this.state.updateAttribs(delta.entityId, delta.attribs);
            if (entity instanceof LocalDuelPlayerState) {
                return new UpdatePlayerAttribsTask(entity.index, prev as NetDuelPlayerAttributes, delta.attribs, this.avatars);
            } else if (entity instanceof LocalDuelUnit) {
                return new UpdateUnitAttribsTask(stateSnapshot(entity), delta.attribs, this.avatars);
            } else if (entity instanceof KnownLocalDuelCard) {
                return new UpdateCardAttribsTask(entity.id,
                    this.game.registry.findCard(entity.defAssetRef)!.definition, delta.attribs, this.avatars);
            } else {
                duelLogError(`Can't yet update attributes for entity ${entity.constructor.name}`, delta);
                return null;
            }
        },
        "createCards": delta => {
            for (const c of delta.cardIds) {
                this.state.createCard(c);
            }
            // Created cards are always in temp location.
            return null;
        },
        "revealCards": delta => {
            this.state.revealCards(delta.revealedCards)
            this.state.hideCards(delta.hiddenCards)
            return new RevealCardsTask(delta.revealedCards, this.avatars);
        },
        "moveCards": delta => {
            for (const c of delta.changes) {
                this.state.moveCard(c.cardId, c.newLocation, c.index);
            }
            const changes = delta.changes
                .map(c => ({...c, cardSnapshot: stateSnapshot(this.state.cards.get(c.cardId)!)}));
            return new MoveCardsTask(this.playerIndex, changes, this.avatars);
        },
        "placeUnit": delta => {
            this.state.createUnit(delta.unit);
            return new PlaceUnitTask(delta.unit, this.avatars);
        },
        "removeUnit": delta => {
            this.state.markUnitDead(delta.removedId);
            return new DestroyUnitTask(delta.removedId, this.avatars);
        },
        "showMessage": delta => {
            return new ShowMessageTask(this.scene, delta.message, delta.duration/1000, delta.pauseDuration/1000);
        }
    }

    scopeFuncs: ScopeFuncMap = {
        "unitAttackScope": node => {
            return new UnitAttackScopeTask(node.scope.unitId, node.scope.targetId, node.scope.damage,
                this.avatars, ...this.buildScopeTasks(node));
        },
        "deathScope": node => {
            return new UnitDeathScopeTask(...this.buildScopeTasks(node));
        },
        "damageScope": node => {
            return new DamageScopeTask(node.scope.sourceId, node.scope.targetId, node.scope.damage,
                node.scope.tags ?? [], this.avatars, ...this.buildScopeTasks(node));
        },
        "healScope": node => {
            return new HealScopeTask(node.scope.sourceId, node.scope.targetId, node.scope.damage,
                node.scope.tags ?? [], this.avatars, ...this.buildScopeTasks(node));
        },
        "cardPlayScope": node => {
            const player = toLocalIndex(node.scope.player);
            return new CardPlayScopeTask(node.scope.cardId,
                player, player != this.playerIndex, this.avatars,
                ...this.buildScopeTasks(node));
        },
        "effectScope": node => {
            return new EffectScopeTask(
                node.scope.sourceId,
                this.state.findEntity(node.scope.sourceId)!,
                node.scope.targets,
                node.scope.tint,
                node.scope.disableTargeting ?? false,
                node.scope.startDelay ?? 0,
                node.scope.endDelay ?? 0,
                this.avatars,
                ...this.buildScopeTasks(node)
            )
        },
        "unitTriggerScope": node => {
            return new UnitTriggerScopeTask(node.scope.unitId, this.avatars, ...this.buildScopeTasks(node));
        },
        "cardDrawScope": node => {
            return new CardDrawScopeTask(...this.buildScopeTasks(node));
        },
        "alterationScope": node => {
            return new AlterationScopeTask(node.scope.targetId,
                node.scope.positive,
                this.avatars,
                ...this.buildScopeTasks(node));
        }
    }

    // Removes all created avatars (units and cards) from the scene, and resets any temporary state.
    tearDownScene() {
        duelLog("Tearing down scene");

        for (let hand of this.scene.hands) {
            // Just in case... I don't know why but there was a bug where there was still a destroyed card??
            hand.cards.length = 0;
        }
        
        const cards = [...this.avatars.cards.values()]
        for (const card of cards) {
            card.destroy();
        }
        const units = [...this.avatars.units.values()]
        for (const unit of units) {
            unit.destroy();
        }
        
        this.scene.messageBanner.hide();
        for (let turnIndicator of this.scene.turnIndicators) {
            turnIndicator.hide();
        }

        this.scene.cardPreviewOverlay.hide();
        this.scene.targetSelect.hide();
        this.scene.entitySelectOverlay.hide();
        this.scene.cardInfoTooltip.hide();
        this.scene.turnTimer.hide();
        this.scene.spellUseOverlay.hide();
        this.scene.effectTargetAnim.hide();
        this.scene.duelEndOverlay.hide();
        this.scene.yourTurnOverlay.hide();

        for (const grid of this.scene.unitSlotGrids) {
            for (const slot of grid.slots) {
                slot.empty();
            }
        }

        const proj = [...this.scene.projectiles]
        for (let p of proj) {
            p.destroy();
        }
    }

    // Builds the scene from the current state, including units, cards, and UI elements.
    // Skips any spawn-related animations.
    setupScene() {
        duelLog("Setting up scene");

        for (let i = 0; i < 2; i++) {
            const counter = this.scene.energyCounters[i]
            counter.update(this.state.players[i].attribs.energy, this.state.players[i].attribs.maxEnergy)
        }
        for (let i = 0; i < 2; i++) {
            const core = this.scene.cores[i]
            core.update(this.state.players[i].attribs.coreHealth);
        }
        this.scene.advPlayerName.text = this.names[this.playerIndex === 0 ? 1 : 0];

        for (let i = 0; i < 2; i++) {
            const player = this.state.players[i];
            // addCard adds at the start of the hand so we have to reverse
            for (const cardId of [...player.hand].reverse()) {
                const cardState = this.state.cards.get(cardId)!;
                const cardAv = this.avatars.spawnCard(cardState);
                cardAv.updatePropositions(this.propositions.card.get(cardId));
                this.scene.hands[i].addCard(cardAv, false);
            }
        }
        this.scene.hands.forEach(x => x.repositionCards(true));

        for (let unit of this.state.units.values()) {
            if (!unit.alive) {
                continue;
            }

            const avatar = this.avatars.spawnUnit(unit);
            const slot = this.avatars.findSlot(unit.position);
            avatar.updatePropositions(this.propositions.unit.get(unit.id));
            avatar.spawnOn(slot);
        }

        this.updateTurnButton();

        this.scene.turnTimer.show();
        this.scene.turnTimer.update(this.timer);

        if (this.state.status === "awaitingConnection") {
            this.scene.messageBanner.show("En attente de l'autre joueur...", -1);
        } else if (this.state.status === "playing") {
            this.scene.showTurnIndicator(this.state.whoseTurn);
        } else if (this.state.status === "ended") {
            let winner = this.state.winner;
            this.scene.duelEndOverlay.show(
                winner === this.playerIndex ? "win"
                    : winner !== null ? "lose" : "terminated",
            )
        }
    }

    rebuildScene() {
        this.tearDownScene();
        this.setupScene();
    }

    fastForward(stateMsg?: DuelMessageOf<"duelWelcome">) {
        if (stateMsg !== undefined) {
            this.state = new LocalDuelState(stateMsg.state);
            this.propositions = new LocalDuelPropositions(stateMsg.propositions);
            this.serverIteration = stateMsg.iteration;
            this.serverWhoseTurn = this.state.whoseTurn;
            this.timer = stateMsg.timer;
            this.timerPaused = false;
        }

        if (this.clientIteration === this.serverIteration) {
            return; // no need to fast forward.
        }

        if (this.mut !== null) {
            if (this.mut.runningTask.state === GameTaskState.RUNNING || this.mut.runningTask.state === GameTaskState.PENDING) {
                this.mut.runningTask.cancel();
            }

            if (stateMsg !== undefined) {
                // Discard all pending mutations, we already have the complete state. 
                this.mutationQueue.length = 0;
            }

            let nextMsg: DuelMessageOf<"duelMutated"> | undefined
            while ((nextMsg = this.mutationQueue.shift()) !== undefined) {
                this.mut = null;
                duelLog(`Fast-forward: applying next mutation (iteration ${nextMsg.iteration})`, nextMsg);
                this.startMutation(nextMsg)
            }

            this.mut = null;
        }

        duelLog(`Completing Fast-forward to latest state (withStateMsg=${stateMsg !== undefined}): `, this.state);
        this.clientIteration = this.serverIteration;
        this.clientWhoseTurn = this.serverWhoseTurn;
        this.rebuildScene()
        this.resumeGameplay()
    }

    onGameBroughtToForeground(elapsedMS: number) {
        if (elapsedMS > FAST_FORWARD_AFTER_BACKGROUND_THRESHOLD) {
            this.fastForward()
        }
    }

    updateScenePropositions() {
        for (const [id, card] of this.avatars.cards.entries()) {
            card.updatePropositions(this.propositions.card.get(id));
            card.updateControlMode(this.avatars.getCardControlMode(id))
        }
        for (const [id, unit] of this.avatars.units.entries()) {
            unit.updatePropositions(this.propositions.unit.get(id));
        }

        this.updateTurnButton()
    }

    updateTurnButton() {
        this.scene.turnButton.switchState(
            this.canEndTurn ? TurnButtonState.AVAILABLE : TurnButtonState.OPPONENT_TURN);
        this.scene.turnButton.onlyOption =
            this.propositions.card.size === 0
            && this.propositions.unit.size === 0
            && this.state.status === "playing";
    }

    dismount() {
        if (this.mut !== null
            && (this.mut.runningTask.state === GameTaskState.RUNNING || this.mut.runningTask.state === GameTaskState.PENDING)) {
            this.mut.runningTask.cancel();
        }
    }

    /**
     * Requests
     */

    private makeHeader(id: number) {
        return {requestId: id, iteration: this.serverIteration};
    }

    endTurn(): Promise<RequestResult> {
        if (!this.canEndTurn) {
            throw new Error("Can't end turn right now.");
        }

        const [msg, prom] = this.game.messaging.sendRequest(
            id => ({type: "duelEndTurn", header: this.makeHeader(id)}));

        return prom;
    }

    get canEndTurn() {
        return this.state.whoseTurn === this.playerIndex;
    }

    useCardProposition(cardId: DuelCardId,
                       slots: LocalDuelArenaPosition[],
                       entities: number[] = []): Promise<RequestResult> {
        if (!this.canUseCardProposition(cardId, slots, entities)) {
            throw new Error("Invalid card proposition parameters.");
        }

        const [msg, prom] = this.game.messaging.sendRequest(
            id => ({
                type: "duelUseCardProposition",
                header: this.makeHeader(id),
                cardId,
                chosenSlots: slots.map(toNetPos),
                chosenEntities: entities
            }));

        return prom;
    }

    useUnitProposition(unitId: number, chosenId: number) {
        if (!this.canUseUnitProposition(unitId, chosenId)) {
            throw new Error("Invalid unit proposition parameters.");
        }

        const [msg, prom] = this.game.messaging.sendRequest(
            id => ({
                type: "duelUseUnitProposition",
                header: this.makeHeader(id),
                unitId,
                chosenEntityId: chosenId
            }));

        return prom;
    }

    canUseCardProposition(cardId: DuelCardId,
                          slots: LocalDuelArenaPosition[],
                          entities: number[] = []) {
        const prop = this.propositions.card.get(cardId);
        if (prop === undefined) {
            return false;
        }

        switch (prop.requirement) {
            case "none":
                return slots.length === 0 && entities.length === 0;
            case "singleSlot":
                return slots.length === 1 && entities.length === 0
                    && prop.allowedSlots.some(
                        b => slots[0].player === b.player
                            && slots[0].vec.equals(b.vec)
                    );
            case "singleEntity":
                return slots.length === 0 && entities.length === 1
                    && prop.allowedEntities.includes(entities[0]);
        }
    }

    canUseUnitProposition(unitId: number, chosenId: number) {
        const prop = this.propositions.unit.get(unitId);
        if (prop === undefined) {
            return false;
        }

        return prop.allowedEntities.includes(chosenId);
    }
}