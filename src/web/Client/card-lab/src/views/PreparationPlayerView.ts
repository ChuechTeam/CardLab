import {fromDom, LabElement, registerTemplate} from "src/dom.ts";
import type {CardLab} from "src/game.ts";
import {gameApi} from "src/api.ts";

const template = registerTemplate("preparation-player-view-template", `
<style>
#root {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    top: 0; 
    
    display: flex;
    justify-content: center;
    align-items: center;
}
#opponent-container {
    text-align: center;
    display: none;
}
#opponent-container.show {
    display: block;
}
#block {
    margin: 20px;
}
.title {
text-align: center;
}
#opponent-name {
font-size: 3.2em;
background-color: #630000;
color: white;
padding: 16px;
border-radius: 16px;
animation: glow 4s infinite alternate ease-in-out;
}
#opponent-block {
    margin: 2.5em 0;
}
@keyframes glow {
    0% {
    box-shadow: 0 2px 9px 6px rgba(255,0,0,0.14);
    background-color: #630000;
    }
    100% {
    box-shadow: 0 2px 22px 17px rgba(255,0,0,0.14);
    background-color: #8B0000;
    }
}
</style>
<div id="root">
    <div id="block">
        <h1 class="title">Préparez-vous à vous battre !</h1>
        <div id="opponent-container">
            <hr>
            <h2>Votre adversaire :</h2>
            <p id="opponent-block"><span id="opponent-name">NOM</span></p>
        </div>
    </div>
</div>
`)

export class PreparationPlayerView extends LabElement {
    @fromDom("opponent-container") opponentContainer: HTMLElement = null!;
    @fromDom("opponent-name") opponentName: HTMLElement = null!;

    constructor(public cardLab: CardLab) {
        super();
    }

    render() {
        this.renderTemplate(template);
    }

    connected() {
        this.update((this.cardLab.phaseState as PreparationPhaseState));
    }

    disconnected() {
    }

    update(state: PreparationPhaseState) {
        if (state.yourOpponent !== null) {
            this.opponentContainer.className = "show";
            this.opponentName.innerText = state.yourOpponent;
        } else {
            this.opponentContainer.className = "";
        }
    }

    labMessageReceived(msg: LabMessage) {
        if (msg.type === "phaseStateUpdated")
            this.update(this.cardLab.phaseState as PreparationPhaseState)
    }

    labStateRestore(state: PreparationPhaseState) {
        this.update(state)
    }
}

customElements.define("preparation-player-view", PreparationPlayerView);