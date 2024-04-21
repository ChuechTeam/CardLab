import {LabElement, registerTemplate} from "../dom.ts";
import {CardEditor} from "../components/CardEditor.ts";
import type {CardLab} from "../game.ts";

const template = registerTemplate('player-card-workshop-template', `
<style>
card-editor {
    margin-bottom: 120px; /* temporary */
}
</style>
<h1>Créez vos cartes !</h1>
<div id="card-editors"></div>
`)

export class PlayerCardWorkshopView extends LabElement {
    phaseState: CreatingCardPhaseState = null!
    cards: CardDefinition[];

    constructor(private cardLab: CardLab) {
        super();

        this.phaseState = cardLab.phaseState as CreatingCardPhaseState
        if (!this.phaseState.player) {
            throw new Error("Card workshop used while the user is a host!")
        }
        
        this.cards = this.phaseState.player.cards.map(x => structuredClone(x))
        this.importGlobalStyles = true
    }

    render() {
        this.dom.appendChild(template.content.cloneNode(true))

        this.getElement("card-editors")!
            .replaceChildren(...this.cards.map((card, i) => new CardEditor(card, i)));
    }
}

customElements.define('player-card-workshop', PlayerCardWorkshopView);