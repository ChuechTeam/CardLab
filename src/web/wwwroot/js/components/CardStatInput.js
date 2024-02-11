import {importGlobalStyles, registerTemplate} from "../dom.js";
class CardStatInput extends HTMLElement {
    constructor() {
        super();
        
        this.valueNode = null;
    }
    
    static get observedAttributes() {
        return ['value'];
    }
    
    static template = registerTemplate('card-stat-input-template',`
<style>
:host {
    font-family: "Chakra Petch", system-ui;
}
.input {
    display: flex;
    border: 2px solid black;
    border-bottom-width: 6px;
}
#value {
    flex-grow: 1;
    text-align: center;
    font-size: 1.5em;
}
button {
    width: 27.5%;
    
    appearance: none;
    border: none;
    background: none;
    
    font-weight: bold;
    font-size: 1.2em;
    padding: 0;
}
#decrement {
    border-right: 2px solid black;
}
#increment {
    border-left: 2px solid black;
}
</style>
<div class="input">
    <button id="decrement">−</button>
    <div id="value">99</div>
    <button id="increment">+</button>
</div>
`)
    
    connectedCallback() {
        const dom = this.attachShadow({ mode: 'open' });
        const template = document.getElementById('card-stat-input-template');
        
        importGlobalStyles(dom)
        dom.appendChild(template.content.cloneNode(true))
        
        this.valueNode = dom.getElementById('value');
        this.decrementButton = dom.getElementById('decrement');
        this.incrementButton = dom.getElementById('increment');
        
        if (!this.hasAttribute('value')) {
            this.setAttribute('value', '1');
        }
        
        this.updateValueText(this.getAttribute('value'));
        
        this.decrementButton.addEventListener('click', () => {
            this.dispatchEvent(new Event("decrement"))
        });
        
        this.incrementButton.addEventListener('click', () => {
            this.dispatchEvent(new Event("increment"))
        });
    }
    
    updateValueText(val) {
        this.valueNode.textContent = val;
    }
    
    attributeChangedCallback(name, oldValue, newValue) {
        if (name === 'value' && this.valueNode !== null) {
            this.updateValueText(newValue);
        }
    }
    
    get value() {
        return parseInt(this.getAttribute('value'));
    }
    
    set value(val) {
        this.setAttribute('value', val);
    }
}

customElements.define('card-stat-input', CardStatInput);