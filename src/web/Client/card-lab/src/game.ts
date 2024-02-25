import {CardEditor} from "./components/CardEditor.js";
import {gameApi} from "./api.ts";
import {LobbyView} from "./views/LobbyView.ts";
import {PlayerCardWorkshopView} from "./views/PlayerCardWorkshopView.ts";
import {tryRunDuelTest} from "./duel/duelTest.ts";
const baseUrl = window.location.origin;

export class CardLab {
    gameContainer: HTMLElement
    player: Player | null
    phase: PhaseName
    phaseState: PhaseState
    socket: WebSocket
    view: HTMLElement | null = null

    constructor(helloResponse: WelcomeMessage, socket: WebSocket) {
        this.gameContainer = document.getElementById("game-container")!;
        this.player = helloResponse.me;
        this.phase = helloResponse.phaseName;
        this.phaseState = helloResponse.phaseState;
        this.socket = socket;

        this.prepareSocket()
    }

    renderView() {
        if (this.phase === 'waitingForPlayers') {
            this.view = new LobbyView(this)
        } else if (this.phase === 'creatingCards') {
            if (!this.isHost) {
                this.view = new PlayerCardWorkshopView(this)
            } else {
                this.view = null;
            }
        } else {
            this.view = null;
        }

        if (this.view !== null) {
            this.gameContainer.replaceChildren(this.view)
        } else {
            this.gameContainer.textContent = `No view to render for phase ${this.phase}!`
        }
    }

    prepareSocket() {
        // Add all the event listeners for debugging
        this.socket.addEventListener("open", () => console.log("Socket opened"));
        this.socket.addEventListener("close", () => console.log("Socket closed"));
        this.socket.addEventListener("error", () => console.log("Socket error"));
        this.socket.addEventListener("message", async (e) => {
            console.log("Socket message", e.data)
            this.handleMessage(e.data)
        });
    }

    handleMessage(strMessage: string) {
        const message = JSON.parse(strMessage)

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
            // todo: reconnection, reset state
        }

        if (this.view !== null
            && 'labMessageReceived' in this.view
            && typeof this.view.labMessageReceived === 'function') {
            this.view.labMessageReceived(message)
        }
    }

    startGame() {
        gameApi.lobby.startGame()
            .then((_) => console.log("Game started"))
            .catch((e) => console.error("Failed to start game", e));
    }

    get isHost() {
        return this.player === null;
    }

    askTheServerToPingMePlease() {
        fetch(new URL("api/game/ping-me", baseUrl), {method: 'POST'})
            .then((_) => console.log("i should be pinged now"))
            .catch((e) => console.error("Failed to ping server", e));
    }
}

const gameContainer = document.getElementById("game-container");
if (gameContainer !== null) {
    gameContainer.textContent = "Connexion au serveur...";

    let socket: WebSocket | null = null;
    try {
        const domainRoot = window.location.host;
        socket = new WebSocket(`ws://${domainRoot}/api/game/ws`);
    } catch (e) {
        console.error("Connection to web socket failed.", e);
        gameContainer.textContent
            = "Connexion échouée. Rafraîchissez la page svp c'est pas encore implémenté de réessayer..."
        // TODO: Retry and tell the user that something is going wrong
    }

    if (socket !== null) {
        const initMessageListener = (e: MessageEvent) => {
            const parsed = JSON.parse(e.data)

            if (parsed.type === 'welcome') {
                socket!.removeEventListener('message', initMessageListener)
                console.log("Received welcome message: ", parsed)

                const lab = new CardLab(parsed, socket!);
                (window as any).cardLab = lab;
                lab.renderView();
            } else {
                // todo queue
            }
        }
        socket.addEventListener("message", initMessageListener);
        socket.addEventListener("error", () => { /* TODO RETRY */
        })
        socket.addEventListener("close", () => { /* TODO RETRY IF UNEXPECTED */
        })
    }
} else {
    tryRunDuelTest();
}