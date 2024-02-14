import {fromDom, LabElement, registerTemplate} from "../dom.ts";

const template = registerTemplate('balance-overview-template',`
<style>
#box {
    border: 2px solid black;
}
#title {
    margin: 0;
    padding: 4px;
    text-align: center;
}
hr {
    margin: 4px 6px;
}
</style>
<div id="box">
    <h3 id="title">Points : <span id="points-display">?</span></h3>
    <hr>
    <div id="list-container"></div>
</div>
`);

export class BalanceOverview extends LabElement {
    data: CardBalanceSummary | null = null;
    @fromDom("list-container") listContainer: HTMLElement = null!
    @fromDom("points-display") pointsDisplay: HTMLElement = null!
    
    constructor(data: CardBalanceSummary | null = null) {
        super();
        this.data = data
    }
    
    render() {
        this.renderTemplate(template);
    }
    
    connected() {
        this.updateData(this.data)
    }
    
    updateData(newData: CardBalanceSummary | null) {
        this.data = newData
        const list = this.renderList()
        if (list !== null) {
            this.listContainer.replaceChildren(list)
            this.pointsDisplay.textContent = `${this.data!.creditsUsed}/${this.data!.creditsAvailable}`
        } else {
            this.listContainer.replaceChildren()
        }
    }
    
    renderList(): HTMLElement | null {
        if (this.data !== null) {
            return this.renderListForEntries(this.data.entries)
        } else {
            return null
        }
    }
    
    renderListForEntries(entries: CardBalanceEntry[]): HTMLElement {
        const bulletList = document.createElement('ul');

        for (let entry of entries) {
            const item = document.createElement('li')
            item.textContent = `${entry.name} -> ${entry.credits}`
            if (entry.subEntries.length > 0) {
                item.appendChild(this.renderListForEntries(entry.subEntries))
            }
            bulletList.appendChild(item)
        }
        
        return bulletList
    }
}

customElements.define('balance-overview', BalanceOverview);