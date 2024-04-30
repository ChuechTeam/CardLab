import "./CardScriptEditor.ts"; // TODO: import async (correctly without it being ugly as hell)
import {fromDom, LabElement, registerTemplate} from "../dom.ts";
import {gameApi} from "../api.ts";
import {runAfterDelay} from "../async.ts";
import {DrawCanvas} from "./DrawCanvas.ts";
import {CardStatInput} from "./CardStatInput.ts";
import "./CardStatInput.ts"; // So the component gets registered
import "./DrawCanvas.ts"; // So the component gets registered
import {BalanceOverview} from "./BalanceOverview.ts";
import "./BalanceOverview.ts";
import {CardScriptEditor} from "src/components/CardScriptEditor.ts";
import * as Blockly from "blockly/core";
import type {CardLab} from "src/game.ts";
import {gameStorageStore, gameStorageLoad, gameSessionLocalInvalidated} from "src/localSave.ts"
import {DrawCanvasControls} from "src/components/DrawCanvasControls.ts";
import "src/components/DrawCanvasControls.ts";

const template = registerTemplate('card-editor-template', `<svg xmlns="http://www.w3.org/2000/svg" style="display: none;">
    <symbol viewBox="0 0 104.85 144.56" id="card-svg-bg">
        <defs>
            <style>
                .cls-1, .cls-3 {
                    fill: var(--card-color);
                }

                .cls-2 {
                    fill: #fff;
                }

                .cls-3 {
                    stroke: var(--card-color);
                    stroke-width: 0.5px;
                }
            </style>
        </defs>
        <g id="card">
            <g id="depth">
                <polygon class="cls-1"
                         points="5.67 143.93 0.73 138.99 0.73 133.53 104.18 133.53 104.18 138.99 99.24 143.93 5.67 143.93"/>
                <path class="cls-1"
                      d="M103.55,134.16v4.57L99,143.31H5.93l-4.57-4.58v-4.57H103.55m1.25-1.25H.11v6.34l.36.37,3.77,3.76.81.81.36.37H99.5l.36-.37,2.29-2.29,2.29-2.28.36-.37v-6.34Z"/>
            </g>
            <g id="border">
                <polygon class="cls-2"
                         points="5.67 141.39 0.73 136.45 0.73 5.57 5.67 0.63 99.24 0.63 104.18 5.57 104.18 136.45 99.24 141.39 5.67 141.39"/>
                <path class="cls-1"
                      d="M99,1.25l4.57,4.57V136.19L99,140.77H5.93l-4.57-4.58V5.82C3.14,4,4.15,3,5.93,1.25H99M99.5,0H5.41L5.05.37.47,4.94l-.36.37v131.4l.36.37,3.77,3.77.81.8.36.37H99.5l.36-.37,2.29-2.28,2.29-2.29.36-.37V5.31l-.36-.37-1.21-1.21L99.86.37,99.5,0Z"/>
            </g>
            <polygon class="cls-3"
                     points="103.8 17.71 80.59 17.71 80.59 5.73 80.59 1.25 99.1 1.25 103.67 5.73 103.8 17.71"/>
        </g>
    </symbol>
</svg>
<svg xmlns="http://www.w3.org/2000/svg" style="display: none;">
    <symbol viewBox="0 0 23 16.36" id="card-svg-attr">
        <defs>
            <style>
                .cls-1 {
                    fill: var(--card-color);
                    stroke: var(--card-color);
                    stroke-miterlimit: 17;
                    stroke-width: 0.5px;
                }
            </style>
        </defs>
        <g id="Layer_7" data-name="Layer 7">
            <path class="cls-1" d="M0,16.36H19.28L23,12.64V0H0Z"/>
        </g>
    </symbol>
</svg>
<style>
    .card-editor {
        margin: 6px 12px;
    }

    .game-card {
        max-height: 85dvh;
        margin-bottom: 8px;
        display: flex;
        justify-content: center;
        align-items: center;
        flex-direction: column;
    }

    .stats-inputs {
        display: grid;
        grid-auto-flow: column;

        grid-template-rows: auto auto;
        grid-template-columns: 1fr 1fr 1fr;

        column-gap: 16px;
        row-gap: 4px;

        text-align: center;

        margin-bottom: 8px;
    }

    .stats-inputs span {
        text-align: center;
        font-weight: bold;
        align-self: end;
    }

    .input-block {
        display: flex;

        margin-bottom: 8px;
    }

    .input-block span {
        margin-right: 12px;
        align-self: center;
        font-weight: bold;
        flex-shrink: 0;
    }

    .input-block input {
        flex-grow: 1;
        font-size: 1.2em;
        font-family: "Chakra Petch", sans-serif;
        padding-right: 0;
        width: 100%;
    }
    
    #name-input:placeholder-shown {
        border: 2px red solid;
        border-radius: 2px;
    }

    #balance-overview {
        margin: 8px 0 2px;
    }

    #edit-buttons {
        margin-top: 16px;
        margin-bottom: 8px;
        display: flex;
        flex-direction: column;
        row-gap: 8px;
    }

    #edit-buttons .cl-button {
        font-weight: bold;
    }

    dialog {
        padding: 0;
        border: 2px solid black;
    }

    #script-editor {
        height: 85dvh;
        width: 97dvw;
    }

    #script-dialog {
        position: absolute;
        top: 0;
        left: 0;
        bottom: 0;
        right: 0;

        z-index: 10;
    }

    dialog::backdrop {
        background-color: rgba(0, 0, 0, 0.5);
    }

    .hacky-backdrop {
        display: none;
    }

    #script-dialog[open] + .hacky-backdrop {
        display: block;
        position: fixed;
        top: 0;
        left: 0;
        bottom: 0;
        right: 0;
        background-color: rgba(0, 0, 0, 0.5);

        z-index: 9;
    }

    dialog > header {
        display: flex;
        align-items: center;
        border-bottom: 6px solid black;
    }

    dialog > header > .-label {
        flex-grow: 1;
        font-weight: bold;
        text-align: center;
        padding: 2px 0;
    }

    dialog > header > .-close-button {
        align-self: stretch;
        border: none;
        background-color: transparent;
        font-size: 1.25em;
        border-left: 2px solid black;
        padding: 3px 12px;
    }

    #script-dialog-credit {
        border-right: 2px solid black;
        align-self: stretch;
        display: flex;
        align-items: center;
        padding: 0 8px;
        column-gap: 12px;
        font-size: 1.1em;
    }

    #script-dialog-credit.state-valid {
        background-color: #2f972f;
        color: white;
    }

    #script-dialog-credit.state-invalid {
        background-color: #cc0909;
        color: white;
    }

    #script-dialog-credit[updating] {
        opacity: 0.6;
    }

    #script-dialog-credit-val {
        font-family: "Chakra Petch", sans-serif;
        font-weight: bold;
        margin-top: 3px;
    }
    
    #draw-dialog {
        max-width: unset;
        max-height: unset;
    }
    
    #draw-dialog > .-contents {
        --width: 94dvw;
        width: var(--width);
        height: 80dvh;
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 8px;
        justify-content: space-evenly;
    }
    
    #draw-dialog > .-contents > .-controls {
        flex-grow: 0;
        flex-basis: 250px;
    }   
    
    #draw-dialog-slot {
        aspect-ratio: 5/3;
        max-width: 100%;
        max-height: 100%;
    }
    
    #draw-dialog-slot #card-canvas {
        max-height: 100%;
        max-width: 100%;
    }
    
    #draw-dialog-slot #card-canvas::part(canvas) {
        border: 2px solid black;
    }
    
    #draw-upload-button {
        align-self: stretch;
        border: none;
        background-color: transparent;
        font-size: 1.3em;
        border-right: 2px solid black;
        padding: 3px 12px;
        
        display: flex;
        justify-content: center;
        align-items: center;
    }
    
    #draw-upload-button lab-icon::part(img) {
        display: block;
    }

    .def-grid {
        display: block;
    }

    @media (orientation: landscape) {
        .def-grid {
            display: grid;
            grid-template-columns: 1fr 2fr;
            grid-template-rows: auto auto auto auto;
            column-gap: 8px;
        }

        .game-card {
            grid-row: 1/5;
            grid-column: 1;
            max-height: 70dvh;
            margin: 0;
        }

        .input-block.-name {
            grid-column: 2;
            grid-row: 1;
        }

        .input-block.-archetype {
            grid-column: 2;
            grid-row: 2;
        }

        .stats-inputs {
            grid-column: 2;
            grid-row: 3;
        }

        #edit-buttons {
            grid-column: 2;
            grid-row: 4;

            flex-direction: row;
            column-gap: 8px;

            margin: 0;
        }

        #edit-buttons button {
            font-size: 0.9em;
            flex-grow: 1;
        }

        #draw-dialog > .-contents {
            flex-direction: row-reverse;
            justify-content: unset;
            align-items: center;
            
            --half-excess: max(0px, calc( 4px + ( var(--width) / 2 + (env(safe-area-inset-left, 0px) - 50dvw) ) ) );
            width: calc(var(--width) - var(--half-excess));
            margin-left: var(--half-excess);
        }
        
        #draw-dialog > .-contents > .-controls {
            flex-grow: 1;
        }
    }
</style>
<div class="card-editor">
    <div class="def-grid">
        <div class="game-card">
            <svg class="-bg" viewBox="0 0 104.85 144.56">
                <use href="#card-svg-bg"/>
                <foreignObject height="100%" width="100%">
                    <div xmlns="http://www.w3.org/1999/xhtml" class="game-card-fields">
                        <div class="-header">
                            <div class="-name" id="card-name">Carte sympa</div>
                            <div class="-cost" id="card-cost">8</div>
                        </div>
                        <div class="-image" id="card-image-slot">
                            <draw-canvas class="-draw-canvas" id="card-canvas"></draw-canvas>
                        </div>
                        <div class="-desc" id="card-desc">
                        </div>
                        <div class="-attribs">
                            <div class="-attack">
                                <svg class="-shape" viewBox="0 0 23 16.36">
                                    <use href="#card-svg-attr"/>
                                </svg>
                                <div class="-val" id="card-attack">5</div>
                            </div>
                            <div class="-archetype" id="card-archetype"></div>
                            <div class="-health">
                                <svg class="-shape" viewBox="0 0 23 16.36">
                                    <use href="#card-svg-attr"/>
                                </svg>
                                <div class="-val" id="card-health">5</div>
                            </div>
                        </div>
                    </div>
                </foreignObject>
            </svg>
        </div>
        <div class="input-block -name">
            <span>Nom :</span>
            <input type="text" id="name-input" placeholder="[Aucun]" maxlength="24"/>
        </div>
        <div class="input-block -archetype">
            <span>Archétype :</span>
            <input type="text" id="archetype-input" placeholder="[Aucun]" maxlength="24"/>
        </div>
        <div class="stats-inputs">
            <span>Coût</span>
            <card-stat-input id="cost-input" value="8"></card-stat-input>

            <span>Attaque</span>
            <card-stat-input id="attack-input" value="7"></card-stat-input>

            <span>Santé</span>
            <card-stat-input id="health-input" value="6"></card-stat-input>
        </div>
        <div id="edit-buttons">
            <button class="cl-button" id="draw-button">🖌️ Dessiner l'image</button>
            <button class="cl-button" id="script-button">📝 Modifier le script</button>
        </div>
    </div>
    <balance-overview id="balance-overview"></balance-overview>
    <dialog id="script-dialog">
        <header>
            <div class="-credit" id="script-dialog-credit">
                <lab-icon icon="credit-coin"></lab-icon>
                <span id="script-dialog-credit-val">0</span>
            </div>
            <div class="-label">Éditeur de script</div>
            <button class="-close-button">✖</button>
        </header>
        <card-script-editor id="script-editor"></card-script-editor>
    </dialog>
    <div class="hacky-backdrop"></div>
    <dialog id="draw-dialog">
        <header>
            <button id="draw-upload-button"><lab-icon icon="upload"></lab-icon></button>
            <div class="-label">Dessin de l'illustration</div>
            <button class="-close-button">✖</button>
        </header>
        <div class="-contents">
            <div id="draw-dialog-slot"></div>
            <draw-canvas-controls class="-controls" id="draw-controls"></draw-canvas-controls>
        </div>
    </dialog>
    <input hidden type="file" accept="image/*" id="draw-upload-input">
</div>
`)

export class CardEditor extends LabElement {
    delayedImgUpload = runAfterDelay({
        func: () => this.uploadCardImage(),
        delay: 10000
    })
    delayedDefUpdate = runAfterDelay({
        func: () => this.uploadDefinitionServer(),
        delay: 400
    })

    @fromDom("card-name") nameTxt: HTMLElement = null!
    @fromDom("card-cost") costTxt: HTMLElement = null!
    @fromDom("card-attack") attackTxt: HTMLElement = null!
    @fromDom("card-health") healthTxt: HTMLElement = null!
    @fromDom("card-desc") descTxt: HTMLInputElement = null!
    @fromDom("card-archetype") archetypeTxt: HTMLElement = null!

    @fromDom("name-input") nameInput: HTMLInputElement = null!
    @fromDom("archetype-input") archetypeInput: HTMLInputElement = null!
    @fromDom("cost-input") costInput: CardStatInput = null!
    @fromDom("attack-input") attackInput: CardStatInput = null!
    @fromDom("health-input") healthInput: CardStatInput = null!
    
    @fromDom("card-canvas") cardCanvas: DrawCanvas = null!
    @fromDom("script-editor") scriptEditor: CardScriptEditor = null!
    @fromDom("balance-overview") balanceOverview: BalanceOverview = null!
    
    @fromDom("draw-button") drawButton: HTMLButtonElement = null!
    @fromDom("draw-dialog") drawDialog: HTMLDialogElement = null!
    @fromDom("draw-controls") drawControls: DrawCanvasControls = null!
    @fromDom("draw-upload-button") drawUploadButton: HTMLButtonElement = null!;
    @fromDom("draw-upload-input") drawUploadInput: HTMLInputElement = null!;
    @fromDom("draw-dialog-slot") drawDialogSlot: HTMLElement = null!
    @fromDom("card-image-slot") cardImageSlot: HTMLElement = null!
    
    @fromDom("script-button") scriptButton: HTMLButtonElement = null!
    @fromDom("script-dialog") scriptDialog: HTMLDialogElement = null!
    @fromDom("script-dialog-credit") scriptCredit: HTMLElement = null!
    @fromDom("script-dialog-credit-val") scriptCreditVal: HTMLElement = null!

    localScriptSaveKey: string
    localImgSaveKey: string
    archetypeDirty = false
    nameDirty = false

    constructor(public card: CardDefinition, public cardIndex: number) {
        super();
        this.importGlobalStyles = true
        this.localScriptSaveKey = `card-script-${cardIndex}`;
        this.localImgSaveKey = `card-img-${cardIndex}`;
    }

    render() {
        this.renderTemplate(template)
    }

    connected() {
        this.updateDefinitionDom()

        for (const input of [this.costInput, this.attackInput, this.healthInput]) {
            input.addEventListener('decrement', () => this.addToStat(input, -1))
            input.addEventListener('increment', () => this.addToStat(input, 1))
        }
        
        this.nameInput.addEventListener('input', () => {
            this.card.name = this.nameInput.value
            this.nameDirty = true
            this.updateDefinitionDom()
        })
        this.archetypeInput.addEventListener("input", () => {
            const arch = this.sanitizeArchetype(this.archetypeInput.value);
            if (arch !== this.card.archetype) {
                this.card.archetype = arch;
                this.archetypeDirty = true;
                this.updateDefinitionDom()
            }
        })

        this.nameInput.addEventListener('blur', () => {
            if (this.nameDirty) {
                this.card.name = this.card.name.trim()
                this.updateDefinition(false)
                this.nameDirty = false;
            }
        })
        this.archetypeInput.addEventListener("blur", () => {
            if (this.archetypeDirty) {
                this.updateDefinition(false);
                this.archetypeDirty = false;
            }
            this.archetypeInput.value = this.card.archetype ?? "";
        })

        this.cardCanvas.addEventListener("stroke-ended", e => {
            this.delayedImgUpload.run()
        })

        this.scriptEditor.addEventListener('script-updated', e => {
            const script = (e as any).detail.script
            if (script !== null) {
                console.log("New script: ", script)
                this.card.script = script
                this.updateDefinition(false)
                this.saveScriptLocally()
            }
        })
        this.scriptButton.addEventListener("click", this.showScriptDialog.bind(this));
        
        this.drawButton.addEventListener("click", this.showDrawDialog.bind(this));
        this.drawDialog.addEventListener("close", () => {
            this.cardImageSlot.appendChild(this.cardCanvas);
            this.cardCanvas.enabled = false;
            
            this.delayedImgUpload.run(true);
        })
        this.drawUploadButton.addEventListener("click", () => {
            this.drawUploadInput.click();
        })
        this.drawUploadInput.addEventListener("input", () => {
            const f = this.drawUploadInput.files?.item(0)
            if (f != null) {
                const img = new Image();
                const url = URL.createObjectURL(f);
                img.src = url;
                img.onload = () => {
                    try {
                        this.cardCanvas.load(img);
                    } finally {
                        URL.revokeObjectURL(url)
                    }
                };
                img.onerror = () => URL.revokeObjectURL(url);
            }
        });
        this.cardCanvas.enabled = false;
        
        // Click-to-edit-events
        this.cardImageSlot.addEventListener("click", this.showDrawDialog.bind(this));
        this.nameTxt.addEventListener("click", () => this.nameInput.focus());
        this.archetypeTxt.addEventListener("click", () => this.archetypeInput.focus());
        this.descTxt.addEventListener("click", this.showScriptDialog.bind(this));
        
        this.dom.querySelector(".hacky-backdrop")?.addEventListener("click", e => {
            this.scriptDialog.close()
        });
        
        for (const x of this.dom.querySelectorAll("dialog")) {
            x.addEventListener("click", e => {
                if (e.target instanceof HTMLButtonElement && e.target.classList.contains("-close-button")) {
                    x.close();
                }
            })
        }
        
        this.drawControls.link(this.cardCanvas);

        if (!gameSessionLocalInvalidated) {
            this.loadScriptLocally();
            this.loadImageLocally().then(() => console.log(`Card image loaded!`));
        }
    }

    disconnected() {
        // Upload the image and definition before entering the next phase
        this.delayedImgUpload.run(true);
        this.delayedDefUpdate.run(true);
    }

    showDrawDialog() {
        this.showFullscreen(() =>{
            this.drawDialog.showModal();
            this.drawDialogSlot.appendChild(this.cardCanvas);
            this.cardCanvas.enabled = true;
        });
    }
    
    showScriptDialog() {
        this.showFullscreen(() => {
            this.scriptDialog.show();
            this.scriptEditor.updateBlocklyDivPosition();
            this.scriptEditor.updateBlocklyDivSize();
        });
    }
    
    showFullscreen(thenShow: () => any) {
        const container = document.body;
        if (container === null || document.fullscreenElement !== null) {
            thenShow();
        } else {
            container.requestFullscreen().finally(thenShow);
        }
    }
    
    updateDefinition(dom = true) {
        if (dom) {
            this.updateDefinitionDom()
        }
        this.balanceOverview.triggerUpdatePending();
        this.scriptCredit.setAttribute("updating", "1");
        this.delayedDefUpdate.run()
    }

    updateDefinitionDom() {
        this.nameTxt.textContent = this.card.name;
        this.descTxt.textContent = this.card.description;
        this.descTxt.style.fontSize = this.descriptionFontSize(this.card.description);
        this.costTxt.textContent = this.card.cost.toString();
        this.attackTxt.textContent = this.card.attack.toString();
        this.healthTxt.textContent = this.card.health.toString();
        this.archetypeTxt.textContent = this.card.archetype ?? "";

        this.costInput.value = this.card.cost;
        this.attackInput.value = this.card.attack;
        this.healthInput.value = this.card.health;
        if (this.nameInput.value !== this.card.name) {
            this.nameInput.value = this.card.name;
        }
        if (this.archetypeInput.value !== this.card.archetype) {
            this.archetypeInput.value = this.card.archetype ?? "";
        }
    }

    async uploadDefinitionServer() {
        const result = await gameApi.cards.update(this.cardIndex, this.card)
        console.log(`Uploaded card definition ${this.cardIndex}, we got: `, result)

        this.balanceOverview.updateData({ ...result })
        this.updateScriptDialog(result.balance);
        this.card.description = result.description
        this.card.archetype = result.archetype
        this.updateDefinitionDom()
    }

    updateScriptDialog(balance: CardBalanceSummary) {
        this.scriptCreditVal.textContent = `${balance.creditsUsed}/${balance.creditsAvailable}`;
        if (balance.creditsUsed <= balance.creditsAvailable && balance.creditsUsed >= 0) {
            this.scriptCredit.className = "state-valid";
        } else {
            this.scriptCredit.className = "state-invalid";
        }
        this.scriptCredit.removeAttribute("updating");
    }

    addToStat(inputSrc: CardStatInput, delta: number) {
        if (inputSrc === this.costInput) {
            if (this.card.cost + delta > 0 && this.card.cost + delta <= 10) {
                this.card.cost += delta;
            }
        } else if (inputSrc === this.attackInput) {
            if (this.card.attack + delta >= 0) {
                this.card.attack += delta;
            }
        } else if (inputSrc === this.healthInput) {
            if (this.card.health + delta > 0) {
                this.card.health += delta;
            }
        }

        this.updateDefinition()
    }

    async uploadCardImage() {
        try {
            console.log(`Generating image for card ${this.cardIndex}...`)

            const blob = await new Promise<Blob>((resolve, reject) => {
                this.cardCanvas.canvas.toBlob(blob => {
                    if (blob === null) {
                        reject(new Error('Blob is null'));
                        return;
                    }
                    resolve(blob);
                })
            })

            console.log(`Card ${this.cardIndex} image generated, size=${blob.size}. Uploading & saving to local...`);
            const p1 = gameApi.cards.uploadImage(this.cardIndex, blob);
            const p2 = this.saveImageLocally(blob);
            await Promise.all([p1, p2]);
            console.log(`Card ${this.cardIndex} image uploaded and saved.`)
        } catch (e) {
            console.error(`Error uploading card image ${this.cardIndex}`, e)
        }
    }

    async saveImageLocally(blob: Blob) {
        const reader = new FileReader();
        reader.readAsDataURL(blob);

        return new Promise(complete => {
            reader.onloadend = () => {
                const b64 = reader.result as string;
                try {
                    gameStorageStore(this.localImgSaveKey, b64);
                } catch (e) {
                    console.error("Error saving image to local storage, likely not enough space.", e)
                }
                complete(null);
            }
        });
    }

    async loadImageLocally() {
        const b64 = gameStorageLoad(this.localImgSaveKey);
        if (b64 === null) {
            return;
        }

        const img = new Image();
        img.src = b64;
        img.onload = () => {
            this.cardCanvas.load(img);
        }
    }

    saveScriptLocally() {
        const w = this.scriptEditor.workspace;
        const saveData = Blockly.serialization.workspaces.save(w);

        try {
            gameStorageStore(this.localScriptSaveKey, JSON.stringify(saveData));
        } catch (e) {
            console.error("Error saving script to local storage, likely not enough space.", e)
        }
    }

    loadScriptLocally() {
        const saveData = gameStorageLoad(this.localScriptSaveKey);
        if (saveData === null) {
            return;
        }

        const data = JSON.parse(saveData);
        try {
            Blockly.serialization.workspaces.load(data, this.scriptEditor.workspace);
        } catch (e) {
            console.error("Error loading script from local storage", e)
        }
    }
    
    descriptionFontSize(str: string): string {
        let val = 1.2;
        val -= Math.min(0.5, 0.1*Math.floor(str.length / 40));
        return `${val}em`;
    }
    
    sanitizeArchetype(a: string): string | null {
        const s = a.trim();
        if (s == "") {
            return null;
        } else {
            return s;
        }
    }
}

customElements.define('card-editor', CardEditor);