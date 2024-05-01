import {fromDom, LabElement, registerTemplate} from "src/dom.ts";
import {CardLab} from "src/game.ts";
import "src/components/FullscreenButton.ts";

const template = registerTemplate("duel-player-view-template", `
<style>
:host {
position: fixed;
left: 0;
top: 0;
bottom: 0;
right: 0;
}
fullscreen-button {
    position: absolute;
    top: 4px;
    right: 4px;
}
</style>
<slot name="duel"></slot>
<fullscreen-button></fullscreen-button>
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