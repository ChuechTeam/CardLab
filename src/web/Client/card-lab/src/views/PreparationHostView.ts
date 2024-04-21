import {fromDom, LabElement, registerTemplate} from "src/dom.ts";
import type {CardLab} from "src/game.ts";
import {gameApi} from "src/api.ts";

const template = registerTemplate("preparation-host-view-template", `
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
</style>
<div id="root">
    <div>
        <h1 class="title">Préparez-vous...</h1>
        <p id="status"></p>
        <div>
            <button id="show-opponents">Montrer les adversaires</button>
            <button id="start-game">Lancer la partie</button>
        </div>
    </div>
</div>
`)

export class PreparationHostView extends LabElement {
    @fromDom("status") status: HTMLElement = null!;
    @fromDom("show-opponents") showOpponentsBtn: HTMLButtonElement = null!;
    @fromDom("start-game") startGameBtn: HTMLButtonElement = null!;

    constructor(public cardLab: CardLab) {
        super();
    }

    render() {
        this.renderTemplate(template);
    }

    connected() {
        this.update((this.cardLab.phaseState as PreparationPhaseState));
        this.showOpponentsBtn.addEventListener("click", async () => {
            this.showOpponentsBtn.disabled = true;
            try {
                await gameApi.host.preparationRevealOpponents();
            } finally {
                this.showOpponentsBtn.disabled = false;
            }
        })
        this.startGameBtn.addEventListener("click", async () => {
            this.startGameBtn.disabled = true;
            try {
                await gameApi.host.endPreparation();
            } finally {
                this.startGameBtn.disabled = false;
            }
        })
    }

    disconnected() {
    }

    update(state: PreparationPhaseState) {
        switch (state.status) {
            case "waitingLastUploads":
                this.status.innerText = "En attente des mises en ligne finales des joueurs..."
                break;
            case "compilingPack":
                this.status.innerText = "Préparation du pack de jeu...";
                break;
            case "ready":
                this.status.innerText = "Prêt à jouer !"
                break;
        }
        this.startGameBtn.disabled = state.status !== "ready";
    }

    labMessageReceived(msg: LabMessage) {
        if (msg.type === "phaseStateUpdated")
            this.update(this.cardLab.phaseState as PreparationPhaseState)
    }
}

customElements.define("preparation-host-view", PreparationHostView);