import {fromDom, LabElement, registerTemplate} from "src/dom.ts";

const template = registerTemplate("code-display-template", `
<style>
:host {
    --default-join-url-size: calc(2em + 2.0vw);
    --default-code-size: calc(4em + 4.0vw);;
}
:host(.overlay) {
    position: fixed;
   
    --join-url-size: calc(1em + 2.0vw);
    --code-size: calc(2em + 2.0vw);
    
    right: 32px;
    top: calc(32px + var(--code-size) / 2);
} 
@media (max-width: 1080px) {
    :host(.overlay) {
        --join-url-size: 1.5em;
        --code-size: 2.0em;
            
        z-index: -1;
        
        opacity: 0.5;
        right: 8px;
        top: 16px;
    }
}
#code {
    -webkit-user-select: text;
    user-select: text;
    font-size: var(--code-size, var(--default-code-size));
    text-align: center;
    
    font-family: "Chakra Petch", sans-serif;
    
    padding: 0 0.2em;
}
.join-instructions {
    position: relative;
    border: 2px solid black;
    border-bottom-width: 4px;
    grid-area: join;
    
    font-weight: bold;
}
.join-url-box {
    position: absolute;
    left: 0;
    right: 0;
    display: flex;
    justify-content: center;
}
.join-url-container {
    display: flex;
    align-items: center;
    
    border: 2px solid black;
    border-bottom-width: 3px;
    padding: 4px 16px;
    --h: var(--join-url-size, var(--default-join-url-size));
    height: var(--h);
    margin-top: calc(var(--h) / -1.4);
    font-size: calc(var(--h) / 2.25);
    box-sizing: border-box;
    background-color: white;
    
    -webkit-user-select: text;
    user-select: text;
}
</style>
<div class="join-instructions">
    <div class="join-url-box">
        <div class="join-url-container">
            <div id="join-url"></div>
        </div>
    </div>
    <div id="code">Truc</div>
</div>
`)

export class CodeDisplay extends LabElement {
    @fromDom("code") code!: HTMLDivElement;
    @fromDom("join-url") joinUrl!: HTMLDivElement;
    
    constructor() {
        super();
    }
    
    static get observedAttributes() {
        return ["code"];
    }
    
    render() {
        this.renderTemplate(template);
    }
    
    connected() {
        this.joinUrl.textContent = window.location.host;
        this.update();
    }
    
    attributeChanged() {
        if (this.connectedOnce) {
            this.update();
        }
    }
    
    update() {
        this.code.textContent = this.getAttribute("code") ?? "";
    }
}

customElements.define("code-display", CodeDisplay);