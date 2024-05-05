import {fromDom, LabElement, registerTemplate} from "src/dom.ts";
import {gameApi} from "src/api.ts";

const template = registerTemplate("lobby-player-template", `
<style>
:host {
border: 2px solid black;
border-left-width: 12px;
padding: 8px;
}
#name {
font-weight: bold;
}
#kick {
font-size: 0.6em;
margin-top: 5px;
--push-border-width: 4px;
}

:host(.its-you) {
background-color: #0b589f;
color: white;
border-color: #042a4e;

box-shadow: 0 0 8px 4px rgba(11,88,159,0.25);
}
</style>
<div id="name">Joueur 1</div>
<button id="kick" class="cl-button -negative">Expulser</button>
`);

export type PlayerData = { id: number, name: string };

export class LobbyPlayer extends LabElement {
    @fromDom("name") name: HTMLDivElement = null!;
    @fromDom("kick") kickButton: HTMLButtonElement = null!;
    
    constructor (public data: PlayerData, public isHost: boolean, public isYou: boolean) {
        super();
        
        this.importGlobalStyles = true;
    }
    
    render() {
        this.renderTemplate(template);
    }
    
    connected() {
        if (!this.isHost) {
            this.kickButton.remove();
        } else {
            this.kickButton.addEventListener("click", async e => {
                this.kickButton.disabled = true;
                try {
                    await gameApi.host.kickPlayer(this.data.id);
                } finally {
                    this.kickButton.disabled = false;
                }
            })
        }
        
        if (this.isYou) {
            this.classList.add("its-you");
        }
        
        this.update();
    }
    
    update(data?: PlayerData) {
        if (data !== undefined)
            this.data = data;
        
        this.name.textContent = this.data.name;
    }
}

customElements.define("lobby-player", LobbyPlayer);