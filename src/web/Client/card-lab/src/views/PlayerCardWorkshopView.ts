import {fromDom, LabElement, registerTemplate} from "../dom.ts";
import {CardEditor} from "../components/CardEditor.ts";
import type {CardLab} from "../game.ts";

const template = registerTemplate('player-card-workshop-template', `
<style>
#navigator {
    width: 100%;
    height: 100dvh;
    display: flex;
    flex-direction: column;
}

#card-editors {
    overflow-y: scroll;
    flex-grow: 1;
}

#controls {
    height: max(40px,4vh);
    border-top: 2px solid black;
    z-index: 1;
    flex-shrink: 0;
    flex-grow: 0;
    
    display: flex;
    background-color: white;
    
    box-shadow: 0 -2px 2px 0 rgba(0,0,0,0.2);
}
#prev, #next {
    flex-grow: 2;
    appearance: none;
    border: 0;
    background-color: white;
    
    font-size: 1.5em;
    overflow: hidden;
    
    padding: 4px;
}

#editor-label {
    flex-grow: 4;
    text-align: center;
    align-self: center;
    
    font-weight: bold;
}

#prev[disabled], #next[disabled] {
    opacity: 0.6;
}

#controls lab-icon {
    height: 100%;
}
</style>
<div id="navigator">
    <div id="card-editors"></div>
    <div id="controls">
        <button id="prev" style="transform: scaleX(-1);"><lab-icon icon="arrow-right" class="-block"></lab-icon></button>
        <div id="editor-label">Carte 1/2</div>
        <button id="next"><lab-icon icon="arrow-right" class="-block"></lab-icon></button>
    </div>
</div>

`)

export class PlayerCardWorkshopView extends LabElement {
    phaseState: CreatingCardPhaseState = null!
    cards: CardDefinition[];
    
    @fromDom("card-editors") editorsContainer: HTMLElement = null!;
    @fromDom("prev") prevButton: HTMLButtonElement = null!;
    @fromDom("next") nextButton: HTMLButtonElement = null!;
    @fromDom("editor-label") editorLabel: HTMLElement = null!;
    
    cardEditors: CardEditor[] = [];
    selectedEditorIdx = 0;

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

        this.cardEditors = this.cards.map((card, i) => new CardEditor(card, i));
        this.getElement("card-editors")!.replaceChildren(...this.cardEditors);

        this.setAttribute("data-wants-top-overlay", '1');
    }
    
    connected() {
        // temp fix for CardScriptEditor
        this.editorsContainer.addEventListener("scroll", e => this.dispatchEvent(new Event("scroll")));
        
        this.prevButton.addEventListener("click", () => this.deltaIdx(-1));
        this.nextButton.addEventListener("click", () => this.deltaIdx(1));
        this.updateSelected();
    }
    
    deltaIdx(delta: number) {
        this.selectedEditorIdx += delta;
        if (this.selectedEditorIdx < 0) {
            this.selectedEditorIdx = 0;
        }
        if (this.selectedEditorIdx >= this.cardEditors.length) {
            this.selectedEditorIdx = this.cardEditors.length - 1;
        }
        this.updateSelected();
    }
    
    updateSelected() {
        for (let i = 0; i < this.cardEditors.length; i++){
            let cardEditor = this.cardEditors[i];
            if (i === this.selectedEditorIdx) {
                cardEditor.style.display = "block";
            } else {
                cardEditor.style.display = "none";
            }
        }
        
        this.editorLabel.textContent = `Carte ${this.selectedEditorIdx + 1}/${this.cardEditors.length}`;
        this.prevButton.disabled = this.selectedEditorIdx === 0;
        this.nextButton.disabled = this.selectedEditorIdx === this.cardEditors.length - 1;
    }
}

customElements.define('player-card-workshop', PlayerCardWorkshopView);