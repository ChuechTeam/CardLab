import {registerTemplate, importGlobalStyles} from "../dom.js";

export class LobbyView extends HTMLElement {
    constructor(cardLab) {
        super();

        this.cardLab = cardLab
    }

    static template = registerTemplate('lobby-view-template',`
<h1>Salut</h1>
<p id="code-display">Truc</p>
<ul id="players"></ul>
<div id="commands-slot"></div>
`);
    
    static hostCommandsTemplate = registerTemplate('lobby-view-host-commands-template',`
<div id="host-commands">
    <button id="start-game">Lancer la partie !</button>
    <button id="stop-game">Annuler la partie</button>
</div>
`);
    
    static playerCommandsTemplate = registerTemplate('lobby-view-player-commands-template',`
<div id="player-commands">
    <button id="quit-game">Quitter la partie</button>
</div>
`)
    
    labMessageReceived(message) {
        if (message.type === 'lobbyPlayerUpdated') {
            this.updatePlayers()
        }
    }
    
    connectedCallback() {
        const dom = this.attachShadow({mode: 'open'});

        importGlobalStyles(dom)
        
        dom.appendChild(LobbyView.template.content.cloneNode(true))
        
        if (this.cardLab.isHost) {
            const node = LobbyView.hostCommandsTemplate.content.cloneNode(true);
            dom.getElementById("commands-slot").replaceWith(node)
            
            dom.getElementById("start-game").addEventListener('click', () => {
                this.cardLab.startGame()
            });
        } else {
            const node = LobbyView.playerCommandsTemplate.content.cloneNode(true);
            dom.getElementById("commands-slot").replaceWith(node)
        }

        dom.getElementById("code-display").textContent = this.cardLab.phaseState.code
        
        this.playersNode = dom.getElementById("players")
        this.updatePlayers()
    }
    
    updatePlayers() {
        this.playersNode.replaceChildren(...this.cardLab.phaseState.players.map(p => {
            const li = document.createElement('li')
            li.textContent = p.name
            return li
        }))
    }
}

customElements.define('lobby-view', LobbyView);