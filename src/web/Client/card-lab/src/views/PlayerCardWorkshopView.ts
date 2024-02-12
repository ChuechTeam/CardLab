import {LabElement, registerTemplate} from "../dom.ts";
import {CardEditor} from "../components/CardEditor.ts";
import {gameApi} from "../api.ts";
import type {CardLab} from "../game.ts";

const template = registerTemplate('player-card-workshop-template', `
<h1>Créez vos cartes !</h1>
<div id="card-editors"></div>
`)

export class PlayerCardWorkshopView extends LabElement {
    phaseState: CreatingCardPhaseState = null!
    cards: CardDefinition[];

    constructor(private cardLab: CardLab) {
        super();

        this.phaseState = cardLab.phaseState as CreatingCardPhaseState
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