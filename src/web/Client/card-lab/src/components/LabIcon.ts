import {LabElement, LabStyle} from "src/dom.ts";
import creditCoin from "src/res/credit-coin.svg";
import upload from "src/res/upload.svg"
import fullscreen from "src/res/fullscreen.svg"
import arrowRight from "src/res/arrow-right.svg"
import undo from "src/res/undo.svg"
import close from "src/res/close.svg"
export type IconType = "credit-coin" | "upload" | "fullscreen" | "arrow-right" | "undo" | "close";

const style = new LabStyle(`
img {
    width: 100%;
    vertical-align: text-bottom;
}
:host {
    display: inline-block;
    width: 1em;
}
:host(.-block) {
    display: block;
    width: unset;
}
:host(.-block) > img {
    display: block;
    height: 100%;
}
`);

// Use the -block class to not use inline display.
export class LabIcon extends LabElement {
    img: HTMLImageElement = null!;
    icon: IconType | null = null;
    
    useDefaultHostStyle = false
    
    constructor(icon: IconType | null = null) {
        super();
        this.icon = icon;
    }
    
    render() {
        style.apply(this);
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
                case "arrow-right":
                    this.img.src = arrowRight;
                    break;
                case "undo":
                    this.img.src = undo;
                    break;
                case "close":
                    this.img.src = close;
                    break;
                default:
                    this.img.src = "";
                    break;
            }
        }
    }
}

customElements.define('lab-icon', LabIcon);