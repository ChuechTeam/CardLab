import {gameApi} from "./api.ts";
import {LobbyView} from "./views/LobbyView.ts";
import {PlayerCardWorkshopView} from "./views/PlayerCardWorkshopView.ts";
import {tryRunDuelTest} from "./duel/duelTest.ts";
import {gameStorageCheck} from "src/localSave.ts";
import {StatusOverlay} from "src/components/StatusOverlay.ts";
import {PackDownloadStatus} from "src/components/PackDownloadStatus.ts";
import {DuelGamePack, loadGamePackWithProgress, PackDownloadProgress} from "src/duel/gamePack.ts";
import {DuelGameRegistry} from "src/duel/gameRegistry.ts";
import {DuelAssets, loadDuelAssets} from "src/duel/assets.ts";
import {createDuel, DuelGame} from "src/duel/duel.ts";
import {DuelMessaging} from "src/duel/messaging.ts";
import {TutorialPlayerView} from "src/views/TutorialPlayerView.ts";
import {TutorialHostView} from "src/views/TutorialHostView.ts";
import {PreparationHostView} from "src/views/PreparationHostView.ts";
import {PreparationPlayerView} from "src/views/PreparationPlayerView.ts";
import {CreatingCardsHostView} from "src/views/CreatingCardsHostView.ts";
import {DuelPlayerView} from "src/views/DuelPlayerView.ts";
import {ConnectionIssuesBanner} from "src/components/ConnectionIssuesBanner.ts";
//import "src/style.css";

const baseUrl = window.location.origin;
type PackDownTask = { progress: PackDownloadProgress; promise: Promise<DuelGamePack> };
type ReconnectionState = { handle: number; interval: number; queue: MessageQueue }

const basePackUrl = {
    def: new URL("/basePacks/basePack1.labdef", baseUrl).toString(),
    res: new URL("/basePacks/basePack1.labres", baseUrl).toString()
}

const BASE_RECONNECT_INTERVAL = 1000; // ms
const INC_RECONNECT_INTERVAL = 1000; // ms
const MAX_RECONNECT_INTERVAL = 30000; // ms

export class CardLab extends EventTarget {
    gameContainer: HTMLElement
    player: Player | null
    tempId: number
    permId: string
    phase: PhaseName
    phaseState: PhaseState
    socket: WebSocket
    view: HTMLElement | null = null

    basePack: DuelGamePack | null = null;
    sessionPack: DuelGamePack | null = null;
    sessionPackUrl: DownloadablePack | null = null;

    basePackDownload: PackDownTask | null = null;
    sessionPackDownload: PackDownTask | null = null;

    ongoingDuel: {
        requiresSessionPack: boolean,
        loadTask: { cancel: boolean } | null
        messaging: DuelMessaging
        loaded: {
            game: DuelGame,
            element: HTMLElement
        } | null
    } | null = null;

    statusOverlay: StatusOverlay
    basePackDownloadUI: PackDownloadStatus
    sessionPackDownloadUI: PackDownloadStatus
    connectionIssuesBanner: ConnectionIssuesBanner

    reconnectionState: ReconnectionState | null = null;

    constructor(helloResponse: WelcomeMessage, socket: WebSocket) {
        super();

        this.gameContainer = document.getElementById("game-container")!;
        this.player = helloResponse.me;
        this.phase = helloResponse.phaseName;
        this.phaseState = helloResponse.phaseState;
        this.socket = socket;
        this.tempId = helloResponse.tempId;
        this.permId = helloResponse.permId;
        this.sessionPackUrl = helloResponse.pack;

        if (helloResponse.duel != null) {
            this.registerDuel(helloResponse.duel, helloResponse.duelRequireSessionPack);
        }

        this.prepareSocket()
        gameStorageCheck(this.permId);

        this.gameContainer.replaceChildren();
        this.statusOverlay = new StatusOverlay();
        this.gameContainer.appendChild(this.statusOverlay);

        this.sessionPackDownloadUI = new PackDownloadStatus();
        this.basePackDownloadUI = new PackDownloadStatus();
        this.connectionIssuesBanner = new ConnectionIssuesBanner();
        this.statusOverlay.appendChild(this.sessionPackDownloadUI);
        this.statusOverlay.appendChild(this.basePackDownloadUI);
        this.statusOverlay.appendChild(this.connectionIssuesBanner);

        if (!this.isHost) {
            this.downloadBasePack().then(() => console.log("Init: Base pack downloaded!"));
            if (this.sessionPackUrl !== null) {
                this.downloadSessionPack().then(() => console.log("Init: Session pack downloaded!"));
            }
        }

        if (this.ongoingDuel !== null) {
            void this.startLoadingDuel();
        }
    }

    renderView() {
        const prev = this.view

        if (this.phase === 'waitingForPlayers') {
            this.view = new LobbyView(this)
        } else if (this.phase === 'creatingCards') {
            if (this.isHost) {
                this.view = new CreatingCardsHostView(this);
            } else {
                this.view = new PlayerCardWorkshopView(this)
            }
        } else if (this.phase === "tutorial") {
            if (this.isHost) {
                this.view = new TutorialHostView(this);
            } else {
                this.view = new TutorialPlayerView(this);
            }
        } else if (this.phase === "preparation") {
            if (this.isHost) {
                this.view = new PreparationHostView(this);
            } else {
                this.view = new PreparationPlayerView(this);
            }
        } else if (this.phase == "duels") {
            if (this.isHost) {
                this.view = null;
            } else {
                this.view = new DuelPlayerView(this);
            }
        } else {
            this.view = null;
        }

        if (this.ongoingDuel !== null && this.ongoingDuel.loaded !== null) {
            this.showDuel(this.ongoingDuel.loaded.element);
        }

        if (prev !== null) {
            prev.remove();
        }

        if (this.view !== null) {
            this.gameContainer.prepend(this.view)

            let child = this.gameContainer.firstChild
            let nextChild;
            while (child) {
                nextChild = child.nextSibling;
                if (child.nodeType === 3) {
                    this.gameContainer.removeChild(child);
                }
                child = nextChild;
            }
        } else {
            this.gameContainer.append(`No view to render for phase ${this.phase}!`)
        }
    }

    /*
     * Networking stuff
     */

    prepareSocket() {
        this.socket.addEventListener("close", e => {
            if (!socketHandleSpecialExit(e)) {
                this.beginReconnection()
            }
        });
        this.socket.addEventListener("error", this.beginReconnection.bind(this));
        this.socket.addEventListener("message", async (e) => {
            console.log("Socket message", e.data)
            this.handleMessage(JSON.parse(e.data))
        });
    }

    beginReconnection() {
        if (this.reconnectionState !== null) {
            throw new Error("Cannot reconnect while reconnecting; that doesn't make any sense!");
        }

        this.reconnectionState = {
            handle: setInterval(this.reconnectAttempt.bind(this), BASE_RECONNECT_INTERVAL),
            interval: BASE_RECONNECT_INTERVAL,
            queue: new MessageQueue()
        };
        this.connectionIssuesBanner.show();
    }

    reconnectAttempt() {
        const socket = socketMake();
        const state = this.reconnectionState;
        
        if (state === null) {
            throw new Error("Can't attempt to reconnect with no reconnection state");
        }

        const closeListener = (e: CloseEvent) => {
            clear();
            if (!socketHandleSpecialExit(e)) {
                this.continueReconnection();
            }
        };
        const errListener = () => {
            clear();
            this.continueReconnection();
        };
        const msgListener = (e: MessageEvent) => {
            if (state === this.reconnectionState) {
                const m = JSON.parse(e.data) as LabMessage;
                if (m.type !== "welcome") {
                    state.queue.push(m);
                } else {
                    clear();
                    
                    this.exitReconnection(socket);
                    this.handleMessage(m);
                    this.handleMessageQueue(state.queue);
                }
            }
        };
        
        function clear() {
            socket.removeEventListener("close", closeListener);
            socket.removeEventListener("error", errListener);
            socket.removeEventListener("message", msgListener);
        }
        
        socket.addEventListener("close", closeListener);
        socket.addEventListener("error", errListener);
        socket.addEventListener("message", msgListener)
    }

    continueReconnection() {
        const s = this.reconnectionState;
        if (s === null) {
            throw new Error("Cannot continue reconnection when not reconnecting.");
        }

        clearInterval(s.handle);
        s.interval = Math.min(s.interval + INC_RECONNECT_INTERVAL, MAX_RECONNECT_INTERVAL);
        s.handle = setInterval(this.reconnectAttempt.bind(this), s.interval);

        console.log(`Continuing reconnection (interval=${s.interval})...`);
    }

    exitReconnection(socket: WebSocket) {
        clearInterval(this.reconnectionState?.handle);
        this.reconnectionState = null;
        this.socket = socket;
        this.prepareSocket();
        this.connectionIssuesBanner.hide();
    }

    handleMessage(message: LabMessage) {
        if (message.type === 'lobbyPlayerUpdated') {
            const phState = this.phaseState as WaitingForPlayersPhaseState;
            if (message.kind === 'quit') {
                let i = 0;
                for (const player of phState.players) {
                    if (player.id === message.playerId) {
                        phState.players.splice(i, 1)
                        break;
                    } else {
                        i++
                    }
                }
            } else if (message.kind === 'join') {
                phState.players.push({id: message.playerId, name: message.playerName})
            } else {
                // todo update if we ever dare to implement it
            }
        } else if (message.type === 'switchedPhase') {
            this.phase = message.name;
            this.phaseState = message.state;
            this.renderView();
        } else if (message.type === 'welcome') {
            const prevPhase = this.phase;

            this.phase = message.phaseName;
            this.phaseState = message.phaseState;
            this.sessionPackUrl = message.pack;
            this.player = message.me;

            if (prevPhase === message.phaseName) {
                if (this.view !== null
                    && 'labStateRestore' in this.view
                    && typeof this.view.labStateRestore === 'function') {
                    this.view.labStateRestore(this.phaseState)
                }
            } else {
                this.renderView();
            }

            if (message.duel !== null) {
                // This won't work properly if two different duels have the same requiresSessionPack value!
                if (this.ongoingDuel !== null && this.ongoingDuel.requiresSessionPack === message.duelRequireSessionPack) {
                    this.ongoingDuel.messaging.receiveMessage({type: "duelWelcome", ...message.duel}, true);
                } else {
                    this.registerDuel(message.duel, message.duelRequireSessionPack);
                    void this.startLoadingDuel()
                }
            } else {
                this.dismountDuel();
            }
        } else if (message.type === "packAvailable") {
            this.sessionPackUrl = message.pack;
            if (!this.isHost) {
                this.downloadSessionPack().then(() => console.log("Session pack downloaded!"));
            }
        } else if (message.type === "sessionDuelStarted") {
            this.registerDuel(message.welcome, message.requireSessionPack)
            void this.startLoadingDuel()
        } else if (message.type === "sessionDuelEnded") {
            this.dismountDuel()
        } else if (message.type === "tutorialStarted") {
            const state = this.phaseState as TutorialPhaseState;
            state.started = true;
        } else if (message.type === "phaseStateUpdated") {
            this.phaseState = message.state;
        } else if (message.type.startsWith("duel")) {
            const msg = message as DuelMessage
            this.ongoingDuel?.messaging.receiveMessage(msg);
        }

        if (this.view !== null
            && 'labMessageReceived' in this.view
            && typeof this.view.labMessageReceived === 'function') {
            this.view.labMessageReceived(message)
        }
    }
    
    handleMessageQueue(mq: MessageQueue) {
        mq.flush(this.handleMessage.bind(this))
    }

    sendMessage(msg: LabMessage) {
        this.socket.send(JSON.stringify(msg))
    }

    /*
     * Commands
     */

    startGame() {
        gameApi.host.startGame()
            .then((_) => console.log("Game started"))
            .catch((e) => console.error("Failed to start game", e));
    }

    /*
     * Duel and various downloads
     */

    retryLoadingDuel() {
        if (this.duelState === "loading") {
            void this.startLoadingDuel();
        }
    }

    private registerDuel(welcome: PartialDuelWelcome, require: boolean) {
        this.dismountDuel();

        this.ongoingDuel = {
            requiresSessionPack: require,
            loadTask: null,
            loaded: null,
            messaging: new DuelMessaging(null)
        }
        this.ongoingDuel.messaging.messageSender = this.sendMessage.bind(this);
        this.ongoingDuel.messaging.receiveMessage({type: "duelWelcome", ...welcome}, true);
    }

    private async downloadBasePack() {
        if (this.basePack !== null) {
            return this.basePack;
        }
        if (this.basePackDownload !== null) {
            return this.basePackDownload.promise;
        }

        const prog = new PackDownloadProgress();
        const packProm = loadGamePackWithProgress(basePackUrl.def, basePackUrl.res, prog);

        this.basePackDownload = {progress: prog, promise: packProm};
        this.basePackDownloadUI.showProgress("Téléchargement des ressources de base", prog);

        try {
            const pack = await packProm;
            this.basePack = pack;
            this.basePackDownloadUI.hide();
            return pack;
        } finally {
            this.basePackDownload = null;
        }
    }

    private async downloadSessionPack() {
        if (this.sessionPack !== null) {
            return this.sessionPack;
        }
        if (this.sessionPackDownload !== null) {
            return this.sessionPackDownload.promise;
        }
        if (this.sessionPackUrl === null) {
            throw new Error("The session pack is not yet available.");
        }

        const prog = new PackDownloadProgress();
        const packProm = loadGamePackWithProgress(
            this.fullPackUrl(this.sessionPackUrl.defPath), this.fullPackUrl(this.sessionPackUrl.resPath), prog);

        this.sessionPackDownload = {progress: prog, promise: packProm};
        this.sessionPackDownloadUI.showProgress("Téléchargement des cartes des joueurs", prog);

        try {
            const pack = await packProm;
            this.sessionPack = pack;
            this.sessionPackDownloadUI.hide();
            return pack;
        } finally {
            this.sessionPackDownload = null;
        }
    }

    private async loadDuelAssets(session: boolean, task: {
        cancel: boolean
    }): Promise<[DuelAssets, DuelGameRegistry] | null> {
        const proms = session ? [this.downloadBasePack(), this.downloadSessionPack()] : [this.downloadBasePack()];
        const packs = await Promise.all(proms);
        const registry = new DuelGameRegistry(packs);
        if (task.cancel) {
            return null;
        }
        const assets = await loadDuelAssets(registry);
        if (task.cancel) {
            return null;
        }
        return [assets, registry];
    }

    private async startLoadingDuel() {
        if (this.ongoingDuel === null) {
            throw new Error("No ongoing duel.");
        }
        if (this.ongoingDuel.loaded !== null) {
            throw new Error("Duel is already loaded.");
        }
        if (this.ongoingDuel.loadTask !== null) {
            throw new Error("Duel is already loading.");
        }

        const task = this.ongoingDuel.loadTask = {cancel: false};
        try {
            this.dispatchEvent(new CustomEvent("duelStateUpdated"));
            const loaded = await this.loadDuelAssets(this.ongoingDuel.requiresSessionPack, task);
            if (loaded === null) {
                // Task has been cancelled.
                return;
            }

            const [assets, registry] = loaded

            const element = document.createElement("div");
            element.className = "game-duel";
            element.slot = "duel";

            const game = await createDuel(element, registry, assets, this.ongoingDuel.messaging);

            if (task.cancel) {
                game.dismount();
                element.remove();
                return;
            }

            this.ongoingDuel.loaded = {
                game, element
            };

            this.ongoingDuel.loadTask = null;

            this.showDuel(element);
            this.dispatchEvent(new CustomEvent("duelStateUpdated"));
        } finally {
            if (this.ongoingDuel !== null && this.ongoingDuel.loadTask === task) {
                this.ongoingDuel.loadTask = null;
                this.dispatchEvent(new CustomEvent("duelStateUpdated"));
            }
        }
    }

    private showDuel(element: HTMLElement) {
        if (this.view !== null) {
            this.view.append(element);
        } else {
            console.error("No view for showing duel!");
        }
    }

    private dismountDuel() {
        if (this.ongoingDuel === null) {
            return;
        }

        if (this.ongoingDuel.loaded !== null) {
            try {
                this.ongoingDuel.loaded.game.dismount();
            } catch (e) {
                console.error("Failed to dismount duel.", e);
            } finally {
                this.ongoingDuel.loaded.element.remove();
            }
        } else if (this.ongoingDuel.loadTask !== null) {
            this.ongoingDuel.loadTask.cancel = true;
        }

        this.ongoingDuel = null;

        this.dispatchEvent(new CustomEvent("duelStateUpdated"));
    }

    private fullPackUrl(part: string) {
        return new URL(part, baseUrl).toString();
    }

    get duelState(): "none" | "loading" | "ready" | "error" {
        if (this.ongoingDuel === null) {
            return "none";
        } else if (this.ongoingDuel.loaded === null) {
            if (this.ongoingDuel.loadTask === null) {
                return "error";
            } else {
                return "loading";
            }
        } else {
            return "ready";
        }
    }

    get isHost() {
        return this.player === null;
    }
}

function socketMake() {
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    return new WebSocket(`${protocol}://${window.location.host}/api/game/ws`);
}

enum SocketExitCode {
    CONNECTION_REPLACED = 3001,
    SERVER_SHUTTING_DOWN = 3002,
    KICKED = 3003,
}

function socketExitCode(e: CloseEvent): SocketExitCode | null {
    if (e.code === 3001 || e.code === 3002 || e.code === 3003) {
        return e.code;
    } else {
        return null;
    }
}

// True when the user should be redirected to the main page.
function socketHandleSpecialExit(e: CloseEvent): boolean {
    const code = socketExitCode(e);

    switch (code) {
        case SocketExitCode.CONNECTION_REPLACED:
            alert("Vous avez été déconnecté car vous vous êtes connecté avec un autre appareil.");
            break;
        case SocketExitCode.SERVER_SHUTTING_DOWN:
            alert("Le serveur va bientôt s'arrêter. Vous avez été déconnecté.");
            break;
        case SocketExitCode.KICKED:
            alert("Vous avez été expulsé de la partie.");
            break;
        default:
            return false;
    }

    window.location.href = baseUrl;
    return true;
}

class MessageQueue {
    messages: LabMessage[] = []; // stored in the opposite direction! last item = last to be processed
    push(m: LabMessage) { this.messages.push(m); }
    flush(f: (m: LabMessage) => void) {
        while (this.messages.length > 0) {
            f(this.messages.pop()!);
        }
    }
}

const gameContainer = document.getElementById("game-container");
if (gameContainer !== null) {
    gameContainer.textContent = "Connexion au serveur...";

    let socket: WebSocket | null = null;
    socket = socketMake();

    if (socket !== null) {
        const queue = new MessageQueue()
        
        const initMessageListener = (e: MessageEvent) => {
            const parsed = JSON.parse(e.data)

            if (parsed.type === 'welcome') {
                socket!.removeEventListener('message', initMessageListener)
                socket!.removeEventListener('error', errListener)
                socket!.removeEventListener('close', closeListener)
                
                console.log("Received welcome message: ", parsed)

                const lab = new CardLab(parsed, socket!);
                lab.handleMessageQueue(queue);
                (window as any).cardLab = lab;
                lab.renderView();
            } else {
                queue.push(parsed)
            }
        }
        const errListener = (e: Event) => {}; // todo
        const closeListener = (e: CloseEvent) => {
            if (!socketHandleSpecialExit(e)) {
                // TODO RETRY
            }
        };
        
        socket.addEventListener("message", initMessageListener);
        socket.addEventListener("error", errListener);
        socket.addEventListener("close", closeListener); 
    }
} else {
    tryRunDuelTest();
}