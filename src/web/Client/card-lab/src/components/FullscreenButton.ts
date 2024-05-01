import {LabElement, registerTemplate} from "src/dom.ts";
import "src/components/LabIcon.ts";

const template = registerTemplate("fullscreen-button-template", `
<style>
button {
    background: rgba(128, 128, 128, 0.7);
    border: 1px solid rgba(128, 128, 128, 0.9);
    padding: 3px;
    margin: 0;
    
    border-radius: 6px;
    appearance: none;
}
lab-icon, lab-icon::part(img) {
    display: block;
    width: 28px;
}
</style>
<button><lab-icon icon="fullscreen"></lab-icon></button>
`);

const fullscreenSupported = "fullscreenEnabled" in document && document.fullscreenEnabled;

export class FullscreenButton extends LabElement {
    constructor() {
        super();
    }
    
    render() {
        if (fullscreenSupported) {
            this.renderTemplate(template);
        }
    }
    
    connected() {
        this.dom.addEventListener("click", () => {
            if (document.fullscreenElement) {
                document.exitFullscreen();
            } else {
                document.body.requestFullscreen();
            }
        });
    }
}

customElements.define("fullscreen-button", FullscreenButton);