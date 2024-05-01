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
    color: black;
    
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

#root.immutable button {
    display: none;
}

#root.immutable #value {
    border-color: black;
    color: white;
    background-color: black;
}

</style>
<div class="input" id="root">
    <button id="decrement">−</button>
    <div id="value">99</div>
    <button id="increment">+</button>
</div>
`)

export class CardStatInput extends LabElement {
    @fromDom("root") root: HTMLElement = null!
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
        
        this.updateStyle()
    }
    
    updateValueText(val: string | null) {
        this.valueNode.textContent = val;
    }
    
    updateStyle() {
        if (this.hasAttribute("immutable")) {
            this.root.classList.add("immutable")
        } else {
            this.root.classList.remove("immutable")
        }
    }
    
    attributeChanged(name: string, oldValue: string | null, newValue: string | null) {
        if (name === 'value' && this.valueNode !== null) {
            this.updateValueText(newValue);
        }
        if (name === 'immutable' && this.valueNode !== null) {
            this.updateStyle();
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