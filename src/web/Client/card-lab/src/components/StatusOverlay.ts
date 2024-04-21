import {LabElement, registerTemplate} from "src/dom.ts";

const template = registerTemplate('status-overlay-template',`
<style>
:host {
    position: fixed;
    bottom: 0;
    left: 0;
    width: 100%;
    display: flex !important;
    flex-direction: column;
    z-index: 1;
}
::slotted(:not(:last-child)) {
    border-bottom: 1px solid whitesmoke;
}
</style>
<slot></slot>
`)

// Just use appendChild/removeChild to add or remove elements.
export class StatusOverlay extends LabElement {
    render() {
        this.renderTemplate(template);
    }
}

customElements.define("status-overlay", StatusOverlay);