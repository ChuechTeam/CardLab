import {fromDom, LabElement, registerTemplate} from "src/dom.ts";
import type {CardLab} from "src/game.ts";
import {gameApi} from "src/api.ts";

const template = registerTemplate("duel-host-view-template", `
<style>
:host {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    top: 0;
    
    display: flex !important;
    flex-direction: column;
    align-items: center;
    
    padding: 16px 8px;
}
:host > * {
    flex: 0 0 auto;
}
h1, button {
    text-align: center;
}
h1 {
    margin: 0;
}
#duels {
    display: flex; 
    flex-wrap: wrap;
    flex-direction: row;
    gap: 16px;
    width: 100%;
    
    flex-grow: 40;
    flex-basis: 0;
    
    align-items: center;
    justify-content: center;
    
    padding: 16px 32px;
    
    overflow: auto;
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
.duel-status.-winner-left .-player2, .duel-status.-winner-right .-player1{
    opacity: 0.5;
    text-decoration: line-through;
}
.duel-status.-winner-right .-player1 {
    opacity: 0.5;
}
#leaderboard {
    width: 80%;
    list-style: none;
    padding: 0;
   
    max-height: 40vh;
    overflow: scroll;
        
    flex-grow: 25;
    flex-basis: 0;
    
    display: flex;
    flex-direction: column;
    flex-wrap: wrap;
    column-gap: 16px;
    row-gap: 2px;
}
.leaderboard-entry {
    display: flex;
    font-family: "Chakra Petch", sans-serif;
    font-size: 1em;
    background-color: #f5f5f5;
    align-items: center;
    padding: 2px 16px;
    
    border-radius: 4px;
    
    border: 1px solid lightgray;
    
    min-width: 200px;
}
.leaderboard-entry:nth-child(-n+3) {
    padding: 4px 16px;
}
.leaderboard-entry:nth-child(1) {
    background-color: #e4d321;
    font-size: 2.0em;
}
.leaderboard-entry:nth-child(2) {
    background-color: #ababab;
    font-size: 1.75em;
}
.leaderboard-entry:nth-child(3) {
    background-color: #c9830b;
    font-size: 1.5em;
}
.leaderboard-entry > .-player {
    flex-grow: 1;
   
    padding: 8px 2px;
    margin-right: 16px;
}
.leaderboard-entry > .-score {
    font-size: 1.2em;
}

#controls {
    display: flex;
    gap: 16px;
    width: 85%;
}
#controls > button {
    flex-grow: 1;
}
</style>
<h1 id="title">Battez-vous !</h1>
<div id="duels"></div>
<ul id="leaderboard"></ul>
<div id="controls">
<button id="start-round" class="cl-button">Commencer un round</button>
<button id="end-round" class="cl-button">Terminer le round</button>
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
        this.importGlobalStyles = true;
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