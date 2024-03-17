import {GameTask} from "src/duel/control/task.ts";
import {GameAvatars} from "src/duel/control/avatar.ts";
import {toLocalCard} from "src/duel/control/state.ts";

// For now, it doesn't handle hiding cards.
export class RevealCardsTask extends GameTask {
    constructor(public revealedCards: NetDuelCard[], public avatars: GameAvatars) {
        super();
    }

    *run() {
        // This is not very efficient rn when the card isn't visible in the viewport,
        // like if it's in the deck, but that case almost never happens so who cares?
        for (const rev of this.revealedCards) {
            const avatar = this.avatars.findCard(rev.id);
           
            const local = toLocalCard(rev);
            if (avatar === undefined) {
                // The card will be spawned outside the viewport.
                this.avatars.spawnCard(local);
            } else {
                // TODO: animate the card flipping
                avatar.replaceVisuals(this.avatars.makeCardVisualData(local));
            }
        }
    }
    
    toString(): string {
        return `RevealCardsTask(${this.revealedCards.length} cards)`;
    }
}