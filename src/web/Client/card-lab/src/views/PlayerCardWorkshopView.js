import {importGlobalStyles, registerTemplate} from "../dom.js";
import {CardEditor} from "../components/CardEditor.js";
import {gameApi} from "../api.js";

export class PlayerCardWorkshopView extends HTMLElement {
    constructor(cardLab) {
        super();

        this.cardLab = cardLab
        this.cards = cardLab.phaseState.player.cards.map(x => structuredClone(x))
        this.defUploadInterval = 2000
        this.defUploadTimeoutHandle = null
    }

    static template = registerTemplate('player-card-workshop-template', `
<h1>Créez vos cartes !</h1>
<div id="card-editors"></div>
`)

    connectedCallback() {
        const dom = this.attachShadow({mode: 'open'});
        const template = document.getElementById('player-card-workshop-template');

        importGlobalStyles(dom)

        dom.appendChild(template.content.cloneNode(true))

        dom.getElementById("card-editors").replaceChildren(...this.cards.map((card, i) => {
            const editor = new CardEditor(card, i)
            editor.addEventListener('card-def-updated', () => this.uploadCardDefinitions())
            return editor
        }));
    }

    async uploadCardDefinitions() {
        clearTimeout(this.defUploadTimeoutHandle)
        this.defUploadTimeoutHandle = setTimeout(async () => {
            const result = await gameApi.cards.updateAll(this.cards)
            console.log("Uploaded card definitions, we got: ", result)
        }, this.defUploadInterval)
    }
}

customElements.define('player-card-workshop', PlayerCardWorkshopView);