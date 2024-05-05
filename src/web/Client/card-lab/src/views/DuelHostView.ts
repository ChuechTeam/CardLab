import {fromDom, LabElement, registerTemplate} from "src/dom.ts";
import type {CardLab} from "src/game.ts";
import {gameApi} from "src/api.ts";

const template = registerTemplate("duel-host-view-template", `
<style>
#root {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    top: 0;
    
    display: flex;
    justify-content: center;
    align-items: center;
}
#pre-start, #post-start {
display: none;
}
#root.waiting #pre-start {
    display: block;
}
#root.started #post-start {
    display: block;
}
</style>
<div id="root">
    <div>
        <h1>Battez-vous !</h1>
    </div>
</div>
`)

export class DuelHostView extends LabElement {
    @fromDom("start") startBtn: HTMLButtonElement = null!;
    @fromDom("next") nextBtn: HTMLElement = null!;
    @fromDom("root") root: HTMLElement = null!;
    requestPending: boolean = false;

    constructor(public cardLab: CardLab) {
        super();
    }

    render() {
        this.renderTemplate(template);
    }

    connected() {
        this.update((this.cardLab.phaseState as TutorialPhaseState).started);
        this.startBtn.addEventListener("click", async () => {
            if (this.requestPending) {
                return;
            }
            
            this.requestPending = true;
            try {
                await gameApi.host.startTutorialDuels();
            } finally {
                this.requestPending = false;
            }
        });

        this.nextBtn.addEventListener("click", async () => {
            if (this.requestPending) {
                return;
            }

            this.requestPending = true;
            try {
                await gameApi.host.endTutorial();
            } finally {
                this.requestPending = false;
            }
        });
    }

    disconnected() {
    }
    
    update(tutStarted: boolean) {
        this.root.className = tutStarted ? "started" : "waiting";
    }
    
    labMessageReceived(msg: LabMessage) {
        if (msg.type === "tutorialStarted") {
            this.update(true);
        }
    }
}

customElements.define("duel-host-view", DuelHostView);