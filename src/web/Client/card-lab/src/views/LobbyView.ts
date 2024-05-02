import {registerTemplate, LabElement, fromDom} from "../dom.ts";
import type {CardLab} from "../game.ts";
import {redirectToQuitGame} from "src/api.ts";
import {LobbyPlayer} from "src/components/LobbyPlayer.ts";

const template = registerTemplate('lobby-view-template',`
<style>
:host {
    padding: 8px;
}
#code-display {
    user-select: all;
    -webkit-user-select: all;
}
#players {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
}
</style>
<h1>Bienvenue !</h1>
<p id="code-display">Truc</p>
<div id="players"></div>
<div id="commands-slot"></div>
`);

const hostCommandsTemplate = registerTemplate('lobby-view-host-commands-template',`
<div id="host-commands">
    <button id="start-game">Lancer la partie !</button>
    <button id="stop-game">Annuler la partie</button>
</div>
`);

const playerCommandsTemplate = registerTemplate('lobby-view-player-commands-template',`
<div id="player-commands">
    <button id="quit-game">Quitter la partie</button>
</div>
`)

export class LobbyView extends LabElement {
    cardLab: CardLab
    phaseState: WaitingForPlayersPhaseState
    @fromDom("players") playersNode: HTMLElement = null!
    @fromDom("code-display") codeDisplay: HTMLElement = null!
    @fromDom("start-game") startGameButton: HTMLElement | null = null
    @fromDom("stop-game") stopGameButton: HTMLElement | null = null
    @fromDom("quit-game") quitGameButton: HTMLElement | null = null
    
    constructor(cardLab: CardLab) {
        super();

        this.cardLab = cardLab
        this.phaseState = cardLab.phaseState as WaitingForPlayersPhaseState
        this.importGlobalStyles = true
    }
    
    labMessageReceived(message: LabMessage) {
        if (message.type === 'lobbyPlayerUpdated') {
            this.updatePlayers()
        }
    }
    
    render() {
        this.dom.appendChild(template.content.cloneNode(true))
        const commandsSlot = this.getElement("commands-slot")!

        const commandTemplate = this.cardLab.isHost ?
            hostCommandsTemplate : playerCommandsTemplate;
        
        commandsSlot.replaceChildren(commandTemplate.content.cloneNode(true))
    }
    
    connected() {
        this.codeDisplay.textContent = this.phaseState.code
        this.updatePlayers()

        if (this.startGameButton !== null) {
            this.startGameButton.addEventListener('click', () => {
                this.cardLab.startGame()
            });
        }
        const exitBtn = this.quitGameButton ?? this.stopGameButton;
        if (exitBtn !== null) {
            exitBtn.addEventListener('click', () => {
                redirectToQuitGame();
            });
        }
    }
    
    updatePlayers() {
        this.playersNode.replaceChildren(...this.phaseState.players
            .map(p => new LobbyPlayer(p, this.cardLab.isHost, this.cardLab.player?.id === p.id)))
    }
}

customElements.define('lobby-view', LobbyView);