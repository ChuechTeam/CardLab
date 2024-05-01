import {LabElement, registerTemplate} from "src/dom.ts";

const template = registerTemplate('connection-issues-banner-template',`<style>
    #root {
        background-color: #eca922;
        padding: 8px;
        text-align: center;
    }
</style>
<article id="root">
    Connexion perdue, tentative de reconnexion en cours...
</article>
`)

// Just use appendChild/removeChild to add or remove elements.
export class ConnectionIssuesBanner extends LabElement {
    render() {
        this.renderTemplate(template);
    }

    connected() {
        this.hide();
    }
    
    show() {
        this.style.removeProperty("display");
    }

    hide() {
        this.style.display = "none";
    }
}

customElements.define('connection-issues-banner', ConnectionIssuesBanner);