import {registerTemplate, LabElement, fromDom} from "../dom.ts";
import type {CardLab} from "../game.ts";
import {redirectToQuitGame} from "src/api.ts";
import {LobbyPlayer} from "src/components/LobbyPlayer.ts";

const template = registerTemplate('lobby-view-template',`
<style>
:host {
    padding: 8px;
    min-height: 100vh;
    max-width: 1220px;
    margin: 0 auto;
    box-sizing: border-box;
}
#code-display {
    -webkit-user-select: text;
    user-select: text;
    font-size: calc(4em + 4.0vw);
    text-align: center;
    
    font-family: "Chakra Petch", sans-serif;
    
    margin-top: 0.2em;
}
#players {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    margin: 8px 0;
    grid-area: players;
}
.join-instructions {
    position: relative;
    border: 2px solid black;
    border-bottom-width: 4px;
    grid-area: join;
    
    font-weight: bold;
}
.join-url-box {
    position: absolute;
    left: 0;
    right: 0;
    display: flex;
    justify-content: center;
}
.join-url-container {
    display: flex;
    align-items: center;
    
    border: 2px solid black;
    border-bottom-width: 3px;
    padding: 4px 16px;
    --h: calc(2em + 2.0vw);
    height: var(--h);
    margin-top: calc(var(--h) / -2);
    font-size: calc(var(--h) / 2.25);
    box-sizing: border-box;
    background-color: white;
    
    -webkit-user-select: text;
    user-select: text;
}
#commands-slot {
    grid-area: commands;
}
#commands-slot  > div {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
}
.grid {
    width: 100%;
    display: grid;
    
    gap: 20px;
    
    grid-template:
        "logo"
        "join"
        "players"
        "commands";
}
.logo {
grid-area: logo;
width: 50%;
margin-bottom: 20px;
max-height: 100%;
aspect-ratio: 146/68;
align-self: center;
justify-self: center;
}
@media (min-width: 720px) {
    :host {
        display: flex !important;
        align-items: center;
        justify-content: stretch;
    }
    .grid {
        grid-template:
        "logo join"
        "players players"
        "commands commands";
    }
    .logo {
        width: 80%;
        margin: 0;
    }
}

</style>
<div class="grid">
    <img class="logo" src="logo.svg"/>
    <div class="join-instructions">
        <div class="join-url-box">
            <div class="join-url-container">
                <div id="join-url"></div>
            </div>
        </div>
        <div id="code-display">Truc</div>
    </div>
    <div id="players"></div>
    <div id="commands-slot"></div>
</div>
`);

const hostCommandsTemplate = registerTemplate('lobby-view-host-commands-template',`
<div id="host-commands">
    <button id="start-game" class="cl-button">Lancer la partie !</button>
    <button id="stop-game" class="cl-button -negative">Annuler la partie</button>
</div>
`);

const playerCommandsTemplate = registerTemplate('lobby-view-player-commands-template',`
<div id="player-commands">
    <button id="quit-game" class="cl-button -negative">Quitter la partie</button>
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
    @fromDom("join-url") joinUrl: HTMLElement = null!
    
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
        this.joinUrl.textContent = window.location.host;
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
                if (confirm("Voulez vous vraiment quitter la partie ?")) {
                    redirectToQuitGame();
                }
            });
        }
    }
    
    updatePlayers() {
        this.playersNode.replaceChildren(...this.phaseState.players
            .map(p => new LobbyPlayer(p, this.cardLab.isHost, this.cardLab.player?.id === p.id)))
    }
}

customElements.define('lobby-view', LobbyView);