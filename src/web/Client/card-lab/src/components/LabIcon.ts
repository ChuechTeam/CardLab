import {LabElement} from "src/dom.ts";
import creditCoin from "src/res/credit-coin.svg";
import upload from "src/res/upload.svg"
import fullscreen from "src/res/fullscreen.svg"
export type IconType = "credit-coin" | "upload" | "fullscreen";

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
        if ("part" in this.img)
            this.img.part.add("img");
    }
    
    connected() {
        this.update();
    }
    
    static observedAttributes = ["icon"];
    
    attributeChanged(name: string, oldValue: string | null, newValue: string | null) {
        this.icon = newValue as IconType | null;
        this.update();
    }
    
    update() {
        if (this.ownerDocument.defaultView !== null && this.connectedOnce) {
            switch (this.icon) {
                case "credit-coin":
                    this.img.src = creditCoin;
                    break;
                case "upload":
                    this.img.src = upload;
                    break;
                case "fullscreen":
                    this.img.src = fullscreen;
                    break;
                default:
                    this.img.src = "";
                    break;
            }
        }
    }
}

customElements.define('lab-icon', LabIcon);