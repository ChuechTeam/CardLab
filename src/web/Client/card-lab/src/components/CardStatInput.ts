import {fromDom, LabElement, registerTemplate} from "../dom.ts";

const template = registerTemplate('card-stat-input-template',`
<style>
:host {
    font-family: "Chakra Petch", system-ui;
}
.input {
    display: flex;
}
#value {
    flex-grow: 1;
    text-align: center;
    font-size: 1.5em;
    border: 2px black;
    border-style: solid none;
    border-bottom-width: 4px;
}
button {
    width: 27.5%;
    
    appearance: none;
    background: none;
    
    font-weight: bold;
    font-size: 1.2em;
    padding: 0;

    border: 2px solid black;
    border-bottom-width: 4px;
}
button:active {
    position: relative;
    margin-top: 2px;
    border-bottom-width: 2px;
}
button:active::before {
	content: " ";
	position: absolute;
	z-index: -1;
	top: -4px;
	height: 2px;
	background: rgba(0, 0, 0, 0.125);
	left: -2px;
	right: -2px;
}
</style>
<div class="input">
    <button id="decrement">−</button>
    <div id="value">99</div>
    <button id="increment">+</button>
</div>
`)

export class CardStatInput extends LabElement {
    @fromDom("value") valueNode: HTMLElement = null!
    @fromDom("decrement") decrementButton: HTMLElement = null!
    @fromDom("increment") incrementButton: HTMLElement = null!
    
    constructor() {
        super();
    }
    
    static get observedAttributes() {
        return ['value'];
    }
    
    init() {
        if (!this.hasAttribute('value')) {
            this.setAttribute('value', '1');
        }
    }
    
    render() {
        this.renderTemplate(template)
    }
    
    connected() {
        this.updateValueText(this.getAttribute('value'));
        
        this.decrementButton.addEventListener('click', () => {
            this.dispatchEvent(new Event("decrement"))
        });
        
        this.incrementButton.addEventListener('click', () => {
            this.dispatchEvent(new Event("increment"))
        });
    }
    
    updateValueText(val: string | null) {
        this.valueNode.textContent = val;
    }
    
    attributeChanged(name: string, oldValue: string, newValue: string) {
        if (name === 'value' && this.valueNode !== null) {
            this.updateValueText(newValue);
        }
    }
    
    get value() {
        return parseInt(this.getAttribute('value')!);
    }
    
    set value(val: number) {
        this.setAttribute('value', val.toString());
    }
}

customElements.define('card-stat-input', CardStatInput);