﻿import {fromDom, LabElement, registerTemplate} from "src/dom.ts";
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
    justify-content: stretch;
    align-items: center;
}
#root > div {
    flex: 1;
}
h1, button {
text-align: center;
}
#duels {
    display: flex; 
    flex-wrap: wrap;
    gap: 16px;
    margin: 0 auto;
    justify-content: center;
    
    padding: 8px 32px;
}
.duel-status {
    border: 2px solid black;
    border-bottom-width: 3px;
    padding: 8px;
    background-color: #f83e1c;
    
   
    display: flex;

    color: white;
    font-size: 2em;
    font-family: "Chakra Petch", sans-serif;
    gap: 16px;
}
.duel-status.-winner-left, .duel-status.-winner-right {
    background-color: #0b589f;
}
.duel-status.-winner-left > .-offset, .duel-status.-winner-right > .-offset {
    transform: translateX(var(--offset));
}
.duel-status.-winner-left .-player2, .duel-status.-winner-right .-player1{
    opacity: 0.5;
    text-decoration: line-through;
}
.duel-status.-winner-right .-player1 {
    opacity: 0.5;
}
</style>
<div id="root">
    <div>
        <h1>Battez-vous !</h1>
        <div id="duels"></div>
        <ul id="leaderboard"></ul>
        <button id="start-round">Commencer un round</button>
        <button id="end-round">Terminer le round</button>
    </div>
</div>
`)

const duelStatusTemplate = registerTemplate("duel-status-template", `
<div class="duel-status">
    <div class="-player1">J1</div>
    <div class="-icon">⚔️</div>
    <div class="-player2">J2</div>
</div>
`);

const leaderboardEntryTemplate = registerTemplate("leaderboard-entry-template", `
<li class="leaderboard-entry">
    <span class="-player"></span>
    <span class="-score"></span>
</li>
`);

export class DuelHostView extends LabElement {
    @fromDom("root") root: HTMLElement = null!;
    @fromDom("start-round") startRound: HTMLButtonElement = null!;
    @fromDom("end-round") endRound: HTMLButtonElement = null!;
    @fromDom("duels") duels: HTMLElement = null!;
    @fromDom("leaderboard") leaderboard: HTMLElement = null!;

    constructor(public cardLab: CardLab) {
        super();
    }

    render() {
        this.renderTemplate(template);
    }

    connected() {
        this.startRound.addEventListener("click", async () => {
            await gameApi.host.duelsStartRound();
        });

        this.endRound.addEventListener("click", async () => {
            await gameApi.host.duelsEndRound();
        });
        
        this.update(this.state);
    }

    disconnected() {
    }
    
    labMessageReceived(msg: LabMessage) {
        if (msg.type === "phaseStateUpdated") {
            this.update(this.state);
        }
    }
    
    labStateRestore() {
        this.update(this.state);
    }
    
    update(state: DuelsPhaseState) {
        const duels = [];
        for (let { id, player1, player2, ongoing, whoWon } of state.duels) {
            const duel = duelStatusTemplate.content.cloneNode(true) as HTMLElement;
            duel.querySelector(".-player1")!.textContent = player1;
            duel.querySelector(".-player2")!.textContent = player2;
            
            if (!ongoing) {
                if (whoWon === 0) { duel.firstElementChild!.classList.add("-winner-left") }
                else if (whoWon === 1) { duel.firstElementChild!.classList.add("-winner-right") }
                
                if (whoWon !== -1) {
                    duel.querySelector(".-icon")!.textContent = '🏆';
                }
            }
            
            duels.push(duel);
        }
        
        const leaderEntries = [];
        for (let { player, score } of state.leaderboard) {
            const entry = leaderboardEntryTemplate.content.cloneNode(true) as HTMLElement;
            entry.querySelector(".-player")!.textContent = player;
            entry.querySelector(".-score")!.textContent = score.toString();
            leaderEntries.push(entry);
        }
        
        this.duels.replaceChildren(...duels);
        this.leaderboard.replaceChildren(...leaderEntries);
    }
    
    get state() {
        return (this.cardLab.phaseState as DuelsPhaseState)
    }
}

customElements.define("duel-host-view", DuelHostView);