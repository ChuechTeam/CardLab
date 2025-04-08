import {registerTemplate, LabElement, fromDom} from "../dom.ts";
import type {CardLab} from "../game.ts";
import {ApiError, gameApi, redirectToQuitGame} from "src/api.ts";
import {LobbyPlayer} from "src/components/LobbyPlayer.ts";
import "src/components/CodeDisplay.ts";

const template = registerTemplate('lobby-view-template', `
<style>
:host {
    padding: 8px;
    min-height: 100vh;
    max-width: 1220px;
    margin: 0 auto;
    box-sizing: border-box;
}
#players {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    margin: 8px 0;
    grid-area: players;
}
#commands-slot {
    grid-area: commands;
}
#commands-slot  > div {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
}
.grid {
    width: 100%;
    display: grid;
    
    gap: 20px;
    
    grid-template:
        "logo"
        "join"
        "players"
        "commands"
        "settings";
}
.logo {
grid-area: logo;
width: 50%;
margin-bottom: 20px;
max-height: 100%;
aspect-ratio: 146/68;
align-self: center;
justify-self: center;
}

#settings {
    grid-area: settings;
    & > .-header {
        display: flex;
        justify-content: flex-start;
        align-items: stretch;
        gap: 20px;
        
        margin-bottom: 0.5em;
    }
    
    #edit-btn {
        box-sizing: border-box;
        font-size: 1rem;
    }
}

#edit-settings-dialog {
    padding: 0;
    border: 0;
    
    & > form {
        padding: 1em 2em;
        border: 1px solid black;
        
        & label {
            display: block;
            font-weight: bold;
            font-size: 1em;
            margin-bottom: 0.1em;
        }
        
        & .-tot-header {
            margin-top: 1em;
            margin-bottom: 0.3em;
            font-weight: bold;
            text-align: center;
        }
        
        & .-block {
            margin: 0.8em 0;
        }
        
        & .-fill {
            width: 100%;
            box-sizing: border-box;
        }
        
        
        & .-labeled-slide {
            display: flex;
            gap: 0.5em;
            
            & input {
                flex-grow: 1;
            }
            
            & span {
                min-width: 3em;
                text-align: right;
            }
        }
        
        & input[type="number"] {
            font-size: 1em;
            font-family: inherit;
            padding: 4px 2px;
        }
        
        & .-inl {
            display: inline;
        }
        
        & .-buttons {
            display: flex;
            flex-direction: column;
            
            gap: 0.5em;
        }
    }
}
#st-dlg-total-cards {
    font-weight: bold;
    text-align: center;
    font-size: 1.5em;
    display: block;
}
#st-dlg-total-cards-players {
    text-align: center;
    display: block;
    color: rgba(75, 75, 75);
    font-size: 0.8em;
}
@media (min-width: 720px) {
    :host {
        display: flex !important;
        align-items: center;
        justify-content: stretch;
    }
    .grid {
        grid-template:
        "logo join"
        "players players"
        "commands commands"
        "settings settings";
    }
    .logo {
        width: 80%;
        margin: 0;
    }
}
@media (max-width: 720px) {
    #edit-settings-dialog form {
        padding: 1.25em;
    }
}
</style>
<div class="grid">
    <img class="logo" src="logo.svg"/>
    <code-display id="code-display"></code-display>
    <div id="players"></div>
    <div id="commands-slot"></div>
    <div id="settings">
        <h2 class="-header">Règles de la partie <button id="edit-btn" class="cl-button" style="display: none;">Modifier</button></h2>
        <ul>
            <li><span>Cartes créées par joueur : </span><span id="st-card-per-player">X</span>
            <li><span>Copies des cartes des joueurs : </span><span id="st-card-copies">X</span></li>
            <li><span>Proportion de sorts dans le deck : </span><span id="st-spell-prop">X</span></li>
            <li><span>Cartes du même archétype d'affilée : </span><span id="st-archetype-seq">X</span></li>
            <li><span>Coûts des cartes verrouillés : </span><span id="st-enforce-cost">X</span></li>
            <li><span>Système d'équilibrage : </span><span id="st-enable-balance">X</span></li>
        </ul>
        <p>Nombre total de cartes dans le deck : <span id="total-cards">X</span></p>
    </div>
    <dialog id="edit-settings-dialog">
        <form id="edit-settings-form" method="dialog">
            <h2>Règles de la partie</h2>
            <div class="-block">
                <label for="st-dlg-card-per-player">Cartes créées par joueur</label>
                <input type="number" class="-fill" id="st-dlg-card-per-player" min="1" max="10" required>
            </div>
            <div class="-block">
                <label for="st-dlg-card-copies">Copies des cartes des joueurs</label>
                <input type="number" class="-fill" id="st-dlg-card-copies" min="1" max="5" required>
            </div>
            <div class="-block">
                <label for="st-dlg-spell-prop-perc">Proportion de sorts dans le deck</label>
                <div class="-labeled-slide">
                    <input type="range" min="0" max="0.75" step="0.01" value="0.1" id="st-dlg-spell-prop">
                    <span id="st-dlg-spell-prop-perc">X%</span>
                </div>
            </div>
            <div class="-block">
                <label for="st-dlg-archetype-seq">Cartes du même archétype d'affilée</label>
                <input type="number" class="-fill" id="st-dlg-archetype-seq" min="1" max="8" required>
            </div>
            <div class="-block">
                <input type="checkbox" id="st-dlg-enforce-cost">
                <label for="st-dlg-enforce-cost" class="-inl">Coûts des cartes verrouillés</label>
            </div>
            <div class="-block">
                <input type="checkbox" id="st-dlg-enable-balance">
                <label for="st-dlg-enable-balance" class="-inl">Utiliser le système d'équilibrage</label>
            </div>
            <div class="-block">
                <h3 class="-tot-header">Nombre de cartes dans le deck</h3>
                <span id="st-dlg-total-cards">X</span>
                <span id="st-dlg-total-cards-players">avec X joueurs</span>
            </div>
            <div class="-buttons -block">
                <button type="submit" class="cl-button" id="st-dlg-submit-btn">Enregistrer</button>
                <button value="cancel" class="cl-button -negative">Fermer</button>
            </div>
        </form>
    </dialog>
</div>
`);

const hostCommandsTemplate = registerTemplate('lobby-view-host-commands-template', `
<div id="host-commands">
    <button id="start-game" class="cl-button">Lancer la partie !</button>
    <button id="stop-game" class="cl-button -negative">Annuler la partie</button>
</div>
`);

const playerCommandsTemplate = registerTemplate('lobby-view-player-commands-template', `
<div id="player-commands">
    <button id="quit-game" class="cl-button -negative">Quitter la partie</button>
</div>
`)

export class LobbyView extends LabElement {
    cardLab: CardLab
    phaseState: WaitingForPlayersPhaseState
    @fromDom("players") playersNode: HTMLElement = null!
    @fromDom("code-display") codeDisplay: HTMLElement = null!
    @fromDom("start-game") startGameButton: HTMLElement | null = null
    @fromDom("stop-game") stopGameButton: HTMLElement | null = null
    @fromDom("quit-game") quitGameButton: HTMLElement | null = null
    @fromDom("join-url") joinUrl: HTMLElement = null!

    // Settings
    @fromDom("edit-btn") editSettingsButton: HTMLElement = null!
    @fromDom("edit-settings-dialog") editSettingsDialog: HTMLDialogElement = null!

    @fromDom("st-card-per-player") cardsPerPlayerVal: HTMLElement = null!
    @fromDom("st-spell-prop") spellPropVal: HTMLElement = null!
    @fromDom("st-archetype-seq") archetypeSeqVal: HTMLElement = null!
    @fromDom("st-card-copies") cardCopiesVal: HTMLElement = null!
    @fromDom("st-enforce-cost") enforceCostVal: HTMLElement = null!
    @fromDom("st-enable-balance") enableBalanceVal: HTMLElement = null!

    @fromDom("total-cards") totalCardsVal: HTMLElement = null!

    // Settings edit dialog
    @fromDom("edit-settings-form") editSettingsForm: HTMLFormElement = null!
    @fromDom("st-dlg-card-per-player") cardsPerPlayerInput: HTMLInputElement = null!
    @fromDom("st-dlg-card-copies") cardCopiesInput: HTMLInputElement = null!
    @fromDom("st-dlg-archetype-seq") archetypeSeqInput: HTMLInputElement = null!
    @fromDom("st-dlg-spell-prop") spellPropInput: HTMLInputElement = null!
    @fromDom("st-dlg-spell-prop-perc") spellPropPerc: HTMLElement = null!
    @fromDom("st-dlg-enforce-cost") enforceCostInput: HTMLInputElement = null!
    @fromDom("st-dlg-enable-balance") enableBalanceInput: HTMLInputElement = null!
    @fromDom("st-dlg-total-cards") dlgTotalCardsDisplay: HTMLElement = null!
    @fromDom("st-dlg-total-cards-players") dlgTotalCardsPlayers: HTMLElement = null!
    @fromDom("st-dlg-submit-btn") submitSettingsButton: HTMLButtonElement = null!

    settingsDlgState: "idle" | "submitting" = "idle"

    constructor(cardLab: CardLab) {
        super();

        this.cardLab = cardLab
        this.phaseState = cardLab.phaseState as WaitingForPlayersPhaseState
        this.importGlobalStyles = true
    }

    labMessageReceived(message: LabMessage) {
        if (message.type === 'lobbyPlayerUpdated') {
            this.updatePlayers()
            this.updateSettingsCardCount()
        } else if (message.type === "settingsChanged") {
            this.updateSettings()
        }
    }

    labStateRestore() {
        this.phaseState = this.cardLab.phaseState as WaitingForPlayersPhaseState
        this.updatePlayers()
        this.updateSettings()
    }

    render() {
        this.dom.appendChild(template.content.cloneNode(true))
        const commandsSlot = this.getElement("commands-slot")!

        const commandTemplate = this.cardLab.isHost ?
            hostCommandsTemplate : playerCommandsTemplate;

        commandsSlot.replaceChildren(commandTemplate.content.cloneNode(true))

        if (this.cardLab.isHost) {
            this.getElement("edit-btn")!.style.display = '';
        }
    }

    connected() {
        this.codeDisplay.setAttribute("code", this.phaseState.code);
        this.updatePlayers()

        if (this.startGameButton !== null) {
            this.startGameButton.addEventListener('click', () => {
                if (this.phaseState.players.length >= 2) {
                    this.cardLab.startGame()
                } else {
                    alert("Pas assez de joueurs ! Il faut au moins deux joueurs pour commencer une partie.")
                }
            });
        }
        const exitBtn = this.quitGameButton ?? this.stopGameButton;
        if (exitBtn !== null) {
            exitBtn.addEventListener('click', () => {
                if (confirm("Voulez vous vraiment quitter la partie ?")) {
                    redirectToQuitGame();
                }
            });
        }

        this.editSettingsButton.addEventListener("click", () => {
            if (this.settingsDlgState === "idle") {
                this.updateSettingsDialog();
            }
            this.editSettingsDialog.showModal();
        });

        // Close when backdrop is clicked
        this.editSettingsDialog.addEventListener('pointerdown', event => {
            if (event.target === event.currentTarget) {
                (event.currentTarget as HTMLDialogElement).close()
            }
        })
        this.editSettingsForm.addEventListener("submit", e => {
            if (e.submitter && "value" in e.submitter && e.submitter.value !== "cancel") {
                e.preventDefault()
                this.submitSettings()
            }
        })

        this.spellPropInput.addEventListener("input", () => {
            this.spellPropPerc.innerText = parseFloat(this.spellPropInput.value).toLocaleString(undefined, {
                style: 'percent',
                maximumFractionDigits: 0
            })
            this.updateSettingsDialogCardCount();
        })
        this.cardsPerPlayerInput.addEventListener("input", () => this.updateSettingsDialogCardCount());
        this.cardCopiesInput.addEventListener("input", () => this.updateSettingsDialogCardCount());

        this.updateSettings()
    }

    updatePlayers() {
        this.playersNode.replaceChildren(...this.phaseState.players
            .map(p => new LobbyPlayer(p, this.cardLab.isHost, this.cardLab.player?.id === p.id)))
    }

    updateSettings() {
        this.cardsPerPlayerVal.innerText = this.cardLab.settings.cardsPerPlayer.toString()
        this.spellPropVal.innerText = this.cardLab.settings.deckSpellProportion.toLocaleString(undefined, {
            style: 'percent',
            maximumFractionDigits: 0
        })
        this.archetypeSeqVal.innerText = this.cardLab.settings.deckArchetypeSequenceLength.toString()
        this.cardCopiesVal.innerText = this.cardLab.settings.deckUserCardCopies.toString()
        this.enforceCostVal.innerText = this.cardLab.settings.enforceCosts ? "Oui" : "Non";
        this.enableBalanceVal.innerText = this.cardLab.settings.enableBalance ? "Activé" : "Désactivé";

        this.updateSettingsDialog()
        this.updateSettingsCardCount()
    }

    updateSettingsCardCount() {
        // The same code from GameSessionRules.cs.
        const numTot = calcCardCount({
            cardsPerPlayer: this.cardLab.settings.cardsPerPlayer,
            playerCount: this.phaseState.players.length,
            spellProp: this.cardLab.settings.deckSpellProportion,
            copies: this.cardLab.settings.deckUserCardCopies
        })

        this.totalCardsVal.innerText = numTot.toString()
        this.dlgTotalCardsDisplay.innerText = numTot.toString()

        this.updateSettingsDialogCardCount()
    }

    updateSettingsDialog() {
        this.cardsPerPlayerInput.value = this.cardLab.settings.cardsPerPlayer.toString()
        this.spellPropInput.value = this.cardLab.settings.deckSpellProportion.toString()
        this.spellPropPerc.innerText = this.cardLab.settings.deckSpellProportion.toLocaleString(undefined, {
            style: 'percent',
            maximumFractionDigits: 0
        });
        this.cardCopiesInput.value = this.cardLab.settings.deckUserCardCopies.toString()
        this.archetypeSeqInput.value = this.cardLab.settings.deckArchetypeSequenceLength.toString()
        this.enforceCostInput.checked = this.cardLab.settings.enforceCosts
        this.enableBalanceInput.checked = this.cardLab.settings.enableBalance
        this.updateSettingsDialogCardCount()
    }

    updateSettingsDialogCardCount() {
        const numTot = calcCardCount({
            cardsPerPlayer: parseInt(this.cardsPerPlayerInput.value),
            playerCount: this.phaseState.players.length,
            spellProp: parseFloat(this.spellPropInput.value),
            copies: parseInt(this.cardCopiesInput.value)
        })

        this.dlgTotalCardsDisplay.innerText = numTot.toString()
        // En français, seules les quantités égales ou supérieures à 2 prennent la marque du pluriel. 
        this.dlgTotalCardsPlayers.innerText =
            this.phaseState.players.length < 2 ? `avec ${this.phaseState.players.length} joueur`
                : `avec ${this.phaseState.players.length} joueurs`
    }

    submitSettings() {
        if (this.settingsDlgState !== "idle") {
            return;
        }

        this.settingsDlgState = "submitting"
        this.submitSettingsButton.disabled = true;
        const settings = {
            cardsPerPlayer: parseInt(this.cardsPerPlayerInput.value),
            deckSpellProportion: parseFloat(this.spellPropInput.value),
            deckArchetypeSequenceLength: parseInt(this.archetypeSeqInput.value),
            deckUserCardCopies: parseInt(this.cardCopiesInput.value),
            enforceCosts: this.enforceCostInput.checked,
            enableBalance: this.enableBalanceInput.checked
        }
        gameApi.host.updateSettings(settings).then(() => {
            this.editSettingsDialog.close()
        }).catch(err => {
            if (err instanceof ApiError) {
                const errList = "extra" in err.body && Array.isArray(err.body.extra) ?
                    err.body.extra.map(x => "- " + x).join("\n") :
                    err.body.detail ?? err.body.title;
                alert("Erreur lors de la sauvegarde des paramètres.\n" + errList);
            }
        }).finally(() => {
            this.settingsDlgState = "idle"
            this.submitSettingsButton.disabled = false;
        })
    }
}

function calcCardCount({cardsPerPlayer, playerCount, spellProp, copies}
                           : { cardsPerPlayer: number, playerCount: number, spellProp: number, copies: number }) {
    const numSes = cardsPerPlayer * playerCount * copies;
    let numSpell = 0;
    if (spellProp > 0) {
        const numSpellFloat = (1 / (1 - spellProp) - 1) * numSes;
        numSpell = Math.max(0, Math.round(numSpellFloat));
    }
    return numSes + numSpell;
}

customElements.define('lobby-view', LobbyView);