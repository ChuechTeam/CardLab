import {GameTask} from "src/duel/control/task.ts";
import {GameAvatars} from "src/duel/control/avatar.ts";
import {toLocalCard} from "src/duel/control/state.ts";
import {CardPlayScopeTask} from "src/duel/control/tasks/CardPlayScopeTask.ts";

// For now, it doesn't handle hiding cards.
export class RevealCardsTask extends GameTask {
    constructor(public revealedCards: NetDuelCard[], public avatars: GameAvatars) {
        super();
    }

    *run() {
        for (const rev of this.revealedCards) {
            const avatar = this.avatars.findCard(rev.id);
           
            const local = toLocalCard(rev);
            if (avatar === undefined) {
                // Don't spawn it. Other tasks will do it.
            } else {
                // TODO: animate the card flipping
                if (this.parent instanceof CardPlayScopeTask && this.parent.shouldLay(rev.id)) {
                    avatar.pendingVisualData = this.avatars.makeCardVisualData(local);
                }
                else {
                    avatar.replaceVisuals(this.avatars.makeCardVisualData(local));
                }
            }
        }
    }
    
    toString(): string {
        return `RevealCardsTask(${this.revealedCards.length} cards)`;
    }
}