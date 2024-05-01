import {fromDom, LabElement, registerTemplate} from "src/dom.ts";
import {CardLab} from "src/game.ts";

const template = registerTemplate("tutorial-player-view-template", `
<style>
:host {
position: fixed;
left: 0;
top: 0;
bottom: 0;
right: 0;
}
#tuto-title {
font-family: "Chakra Petch", sans-serif;

position: absolute;
bottom: 0;
right: 0;

background-color: black;
padding: 4px;
margin: 2px;

border: 2px solid #0b589f;
border-radius: 2px;
color: white;

font-size: 0.75em;
pointer-events: none;
}
fullscreen-button {
    position: absolute;
    top: 4px;
    right: 4px;
}
</style>
<div id="prep-mode">
    <h2 id="prep-title">Bienvenue !</h2>
</div>
<div id="duel-mode">
    <div id="tuto-title">Mode tutoriel</div>
    <fullscreen-button></fullscreen-button>
    <slot name="duel"></slot>
</div>
`)

export class TutorialPlayerView extends LabElement {
    @fromDom("prep-mode") prepMode: HTMLElement = null!;
    @fromDom("duel-mode") duelMode: HTMLElement = null!;
    
    constructor(public cardLab: CardLab) {
        super();
    }
    
    render() {
        this.renderTemplate(template);
    }
    
    connected() {
        this.update();
        this.cardLab.addEventListener("duelStateUpdated", this.updateListener);
    }
    
    disconnected() {
        this.cardLab.removeEventListener("duelStateUpdated", this.updateListener);
    }
    
    update() {
        const state = this.cardLab.duelState;
        if (state !== "none") {
            this.prepMode.style.display = "none";
            this.duelMode.style.removeProperty("display");
        } else {
            this.prepMode.style.removeProperty("display");
            this.duelMode.style.display = "none";
        }
    }
    
    updateListener = this.update.bind(this);
}

customElements.define("tutorial-player-view", TutorialPlayerView);