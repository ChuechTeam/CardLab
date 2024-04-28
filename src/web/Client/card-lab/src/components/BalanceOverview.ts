import {fromDom, LabElement, registerTemplate} from "../dom.ts";
import "./LabIcon.ts";
import {LabIcon} from "src/components/LabIcon.ts";

const template = registerTemplate('balance-overview-template', `
<style>
#box {
    border: 2px solid black;
    padding: 4px 6px;
}
#box.state-valid {
    border-color: darkgreen;
    background-color: #67e15c;
}
#box.state-invalid {
    border-color: darkred;
    background-color: #ee7f7f;
}
#box[update-pending] {
    opacity: 0.6;
}
.heading {
    display: flex;
    align-items: center;
}
#title {
    flex-grow: 4;
    flex-basis: 0;
    font-size: 1.2em;
    font-weight: bold;
}
.points {
    margin-right: 12px;
    font-size: 1.3em;
}

#points-display {
    margin-left: 8px;
    font-weight: bold;
    font-family: "Chakra Petch", sans-serif;
}
#issues:empty {
    display: none;
}
</style>
<div id="box">
    <header class="heading">
        <div id="title">En attente...</div>
        <div class="points">
            <lab-icon icon="credit-coin"></lab-icon>
            <span id="points-display">?</span>
        </div>
    </header>
    <section>
        <ul id="issues"></ul>
    </section>
</div>
`);

type CardData = { balance: CardBalanceSummary; validation: CardValidationSummary };

export class BalanceOverview extends LabElement {
    data: CardData | null = null;
    updatePending = false
    @fromDom("title") titleHeader: HTMLElement = null!; 
    @fromDom("box") box: HTMLElement = null!;
    @fromDom("list-container") listContainer: HTMLElement = null!
    @fromDom("points-display") pointsDisplay: HTMLElement = null!
    @fromDom("issues") issuesList: HTMLElement = null!

    constructor(data: CardData | null = null) {
        super();
        this.data = data
    }

    render() {
        this.renderTemplate(template);
    }

    connected() {
        this.updateData(this.data)
    }

    updateData(newData: CardData | null) {
        this.data = newData
        if (this.data !== null) {
            const { balance, validation } = this.data;
            
            this.pointsDisplay.textContent = `${balance.creditsUsed}/${balance.creditsAvailable}`
            
            const defOk = validation.definitionValid;
            const balOk = balance.creditsUsed <= balance.creditsAvailable;
            
            const issueNodes = [...validation.errors.map(issue => {
                const li = document.createElement('li');
                li.textContent = issue;
                return li;
            })];
            
            if (defOk && balOk) {
                this.box.className = "state-valid";
                this.titleHeader.textContent = "Carte validée !";
            } else {
                this.box.className = "state-invalid";
                
                if (!balOk) {
                    this.titleHeader.textContent = "Carte trop forte !";
                    
                    const node = document.createElement('li');
                    node.append("Votre carte a dépensé trop de crédits ");
                    node.append(new LabIcon("credit-coin"));
                    node.append(". Essayez de réduire les statistiques de votre carte, d'ajouter des conditions," +
                        " ou d'utiliser des évènements moins fréquents.");
                    issueNodes.push(node);
                } else {
                    this.titleHeader.textContent = "Carte invalide !";
                }
            }
            
            this.issuesList.replaceChildren(...issueNodes);
        }
        
        this.clearUpdatePending();
    }

    triggerUpdatePending() {
        if (this.updatePending) {
            return;
        }
        this.updatePending = true;
        this.box.setAttribute("update-pending", '1');
    }
    
    clearUpdatePending() {
        this.updatePending = false;
        this.box.removeAttribute("update-pending");
    }
    
    // renderList(): HTMLElement | null {
    //     if (this.data !== null) {
    //         return this.renderListForEntries(this.data.entries)
    //     } else {
    //         return null
    //     }
    // }
    //
    // renderListForEntries(entries: CardBalanceEntry[]): HTMLElement {
    //     const bulletList = document.createElement('ul');
    //
    //     for (let entry of entries) {
    //         const item = document.createElement('li')
    //         item.textContent = `${entry.name} -> ${entry.credits}`
    //         if (entry.subEntries.length > 0) {
    //             item.appendChild(this.renderListForEntries(entry.subEntries))
    //         }
    //         bulletList.appendChild(item)
    //     }
    //    
    //     return bulletList
    // }
}

customElements.define('balance-overview', BalanceOverview);