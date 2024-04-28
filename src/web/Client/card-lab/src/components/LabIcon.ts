import {LabElement} from "src/dom.ts";
import {string} from "blockly/core/utils";
import creditCoin from "src/res/credit-coin.svg";
export type IconType = "credit-coin";

const style = new CSSStyleSheet()
style.insertRule("img { width: 100%; vertical-align: text-bottom; }");
style.insertRule(":host { display: inline-block; width: 1em; }");

export class LabIcon extends LabElement {
    img: HTMLImageElement = null!;
    icon: IconType | null = null;
    
    useDefaultHostStyle = false
    
    constructor(icon: IconType | null = null) {
        super();
        this.icon = icon;
    }
    
    render() {
        this.dom.adoptedStyleSheets.push(style)
        this.img = this.dom.appendChild(document.createElement("img"));
    }
    
    connected() {
        this.update();
    }
    
    static observedAttributes = ["icon"];
    
    attributeChanged(name: string, oldValue: string, newValue: string) {
        this.icon = newValue as IconType;
        this.update();
    }
    
    update() {
        if (this.ownerDocument.defaultView !== null && this.connectedOnce) {
            switch (this.icon) {
                case "credit-coin":
                    this.img.src = creditCoin;
                    break;
                default:
                    this.img.src = "";
                    break;
            }
        }
    }
}

customElements.define('lab-icon', LabIcon);