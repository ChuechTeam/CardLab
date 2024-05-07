import {fromDom, LabElement, registerTemplate} from "src/dom.ts";
import type {CardLab} from "src/game.ts";
import {gameApi} from "src/api.ts";

const template = registerTemplate("duel-host-view-template", `
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
        <h1>Battez-vous !</h1>
    </div>
</div>
`)

export class DuelHostView extends LabElement {
    @fromDom("root") root: HTMLElement = null!;

    constructor(public cardLab: CardLab) {
        super();
    }

    render() {
        this.renderTemplate(template);
    }

    connected() {
    }

    disconnected() {
    }
}

customElements.define("duel-host-view", DuelHostView);