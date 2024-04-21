import {fromDom, LabElement, registerTemplate} from "src/dom.ts";
import type {CardLab} from "src/game.ts";
import {gameApi} from "src/api.ts";

const template = registerTemplate("creating-cards-host-view-template", `
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
        <h1>Créez vos cartes !</h1>
        <button id="end-creation">Terminer</button>
    </div>
</div>
`)

export class CreatingCardsHostView extends LabElement {
    @fromDom("status") status: HTMLElement = null!;
    @fromDom("end-creation") endCreationBtn: HTMLButtonElement = null!;

    constructor(public cardLab: CardLab) {
        super();
    }

    render() {
        this.renderTemplate(template);
    }

    connected() {
        this.endCreationBtn.addEventListener("click", async () => {
            this.endCreationBtn.disabled = true;
            try {
                await gameApi.host.endCardCreation();
            } finally {
                this.endCreationBtn.disabled = false;
            }
        });
    }

    disconnected() {
    }
}

customElements.define("creating-cards-host-view", CreatingCardsHostView);