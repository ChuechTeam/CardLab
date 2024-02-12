import {registerTemplate, LabElement, fromDom} from "../dom.ts";
import type {CardLab} from "../game.ts";

const template = registerTemplate('lobby-view-template',`
<h1>Salut</h1>
<p id="code-display">Truc</p>
<ul id="players"></ul>
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
    }
    
    updatePlayers() {
        this.playersNode.replaceChildren(...this.phaseState.players.map(p => {
            const li = document.createElement('li')
            li.textContent = p.name
            return li
        }))
    }
}

customElements.define('lobby-view', LobbyView);