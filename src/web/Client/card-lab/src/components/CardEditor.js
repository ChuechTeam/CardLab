import "./DrawCanvas.js";
import "./CardStatInput.js";
import "./CardScriptEditor.js"; // TODO: import async (correctly without it being ugly as hell)
import {importGlobalStyles, registerTemplate} from "../dom.js";
import {gameApi} from "../api.js";
import {runAfterDelay} from "../async.js";

export class CardEditor extends HTMLElement {
    constructor(card, index) {
        super();

        this.card = card;
        this.cardIndex = index;

        this.delayedImgUpload = runAfterDelay({
            func: () => this.uploadCardImage(),
            delay: 3000
        })
        this.delayedDefUpdate = runAfterDelay({
            func: () => this.uploadDefinitionServer(),
            delay: 400
        })
    }

    static template = registerTemplate('card-editor-template', `
<svg xmlns="http://www.w3.org/2000/svg" style="display: none;">
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
    margin: 16px 8px;
}
.game-card {
    margin-bottom: 8px;
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
}
#name-input {

}
.name-input-block {
    display: flex;
    
    margin-bottom: 8px;
    margin-right: 6px;
}
.name-input-block span {
    margin-right: 12px;
    align-self: center;
    font-weight: bold;
    flex-shrink: 0;
}
#name-input {
    flex-grow: 1;
    font-size: 1.2em;
    font-family: "Chakra Petch", sans-serif;
    padding-right:0;    
    width: 100%;
}
#script-editor {
    margin-bottom: 8px;
    
    height: 450px;
}

</style>
<div class="card-editor">
    <div class="game-card">
        <svg class="-bg" viewBox="0 0 104.85 144.56">
            <use href="#card-svg-bg"/>
            <foreignObject height="100%" width="100%">
                <div xmlns="http://www.w3.org/1999/xhtml" class="game-card-fields">
                    <div class="-header">
                        <div class="-name" id="card-name">Carte sympa</div>
                        <div class="-cost" id="card-cost">8</div>
                    </div>
                    <div class="-image">
                        <draw-canvas class="-draw-canvas" id="card-canvas"></draw-canvas>
                    </div>
                    <div class="-desc">
                        <div>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nulla nec purus feugiat, molestie
                            ipsum et, consequat nibh. Etiam non elit dui. Nullam vel eros sit amet arcu vestibulum
                            accumsan in in leo.
                        </div>
                    </div>
                    <div class="-attribs">
                        <div class="-attack">
                            <svg class="-shape" viewBox="0 0 23 16.36">
                                <use href="#card-svg-attr"/>
                            </svg>
                            <div class="-val" id="card-attack">5</div>
                        </div>
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
    <div class="name-input-block">
        <span>Nom :</span>
        <input type="text" id="name-input"/>
    </div>
    <div class="stats-inputs">
       <span>Coût</span>
       <card-stat-input id="cost-input" value="8"></card-stat-input>
       
       <span>Attaque</span>
       <card-stat-input id="attack-input" value="7"></card-stat-input>
       
       <span>Santé</span>
       <card-stat-input id="health-input" value="6"></card-stat-input>
    </div>
    <card-script-editor id="script-editor"></card-script-editor>
</div>
`)

    connectedCallback() {
        const dom = this.attachShadow({mode: 'open'});
        const template = document.getElementById('card-editor-template');

        importGlobalStyles(dom)

        dom.appendChild(template.content.cloneNode(true))

        this.nameTxt = dom.getElementById("card-name");
        this.costTxt = dom.getElementById("card-cost");
        this.attackTxt = dom.getElementById("card-attack");
        this.healthTxt = dom.getElementById("card-health");

        this.nameInput = dom.getElementById("name-input");
        this.costInput = dom.getElementById("cost-input");
        this.attackInput = dom.getElementById("attack-input");
        this.healthInput = dom.getElementById("health-input");

        /**
         * @type {DrawCanvas}
         */
        this.cardCanvas = dom.getElementById("card-canvas");
        this.scriptEditor = dom.getElementById("script-editor");

        for (const input of [this.costInput, this.attackInput, this.healthInput]) {
            input.addEventListener('decrement', () => this.addToStat(input, -1))
            input.addEventListener('increment', () => this.addToStat(input, 1))
        }
        this.nameInput.addEventListener('input', () => {
            this.card.name = this.nameInput.value
            this.updateDefinition()
        })

        this.cardCanvas.addEventListener("stroke-ended", e => {
            this.updateDefinition(false)
        })
        
        this.scriptEditor.addEventListener('script-updated', e => {
            const script = e.detail.script
            if (script !== null) {
                console.log("New script: ", script)
                this.card.script = script
                this.updateDefinition(false)
            }
        })
        
        this.updateDefinitionDom()
    }

    disconnectedCallback() {
        // Upload the image before entering the next phase
        // ...It's a bit fragile though, we'll sort it later
        this.uploadCardImage().then(() => {
            console.log("cool!")
        })
    }

    updateDefinition(dom=true) {
        if (dom) {
            this.updateDefinitionDom()
        }
        this.delayedDefUpdate.run()
    }    
    
    updateDefinitionDom() {
        this.nameTxt.textContent = this.card.name;
        this.costTxt.textContent = this.card.cost;
        this.attackTxt.textContent = this.card.attack;
        this.healthTxt.textContent = this.card.health;

        this.costInput.value = this.card.cost;
        this.attackInput.value = this.card.attack;
        this.healthInput.value = this.card.health;
        if (this.nameInput.value !== this.card.name) {
            this.nameInput.value = this.card.name;
        }
    }

    async uploadDefinitionServer() {
        const result = await gameApi.cards.update(this.cardIndex, this.card)
        console.log(`Uploaded card definition ${this.cardIndex}, we got: `, result)
    }
    
    addToStat(inputSrc, delta) {
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

            /**
             * @type {Blob}
             */
            const blob = await new Promise((resolve, reject) => {
                this.cardCanvas.canvas.toBlob(blob => {
                    if (blob === null) {
                        reject(new Error('Blob is null'));
                        return;
                    }
                    resolve(blob);
                })
            })

            console.log(`Card ${this.cardIndex} image generated, size=${blob.size}. Uploading...`);
            await gameApi.cards.uploadImage(this.cardIndex, blob);
            console.log(`Card ${this.cardIndex} image uploaded.`)
        } catch (e) {
            console.error(`Error uploading card image ${this.cardIndex}`, e)
        }
    }

    
}

customElements.define('card-editor', CardEditor);