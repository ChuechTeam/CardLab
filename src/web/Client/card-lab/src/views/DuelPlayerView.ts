import {fromDom, LabElement, registerTemplate} from "src/dom.ts";
import {CardLab} from "src/game.ts";

const template = registerTemplate("duel-player-view-template", `
<style>
:host {
position: fixed;
left: 0;
top: 0;
bottom: 0;
right: 0;
}
</style>
<slot name="duel"></slot>
`)

export class DuelPlayerView extends LabElement {
    constructor(public cardLab: CardLab) {
        super();
    }
    
    render() {
        this.renderTemplate(template);
    }
}

customElements.define("duel-player-view", DuelPlayerView);