import {GameTask} from "src/duel/control/task.ts";
import {GameAvatars} from "src/duel/control/avatar.ts";
import type {LocalDuelCard} from "src/duel/control/state.ts";

export type MoveCardChange = { 
    cardId: number;
    cardSnapshot: LocalDuelCard;
    newLocation: DuelCardLocation; 
    index: number | null;
}

export class MoveCardsTask extends GameTask {
    constructor(public changes: MoveCardChange[],
                public avatars: GameAvatars) {
        super();
    }

    *run() {
        for (const c of this.changes) {
            let avatar = this.avatars.findCard(c.cardId);
            
            // First: remove the card from old locations (same location transition is impossible)
            if (avatar && avatar.state.name === "hand") {
                avatar.switchToIdle();
            }
            
            if (c.newLocation === "discarded") {
                if (avatar !== undefined) {
                    avatar.destroy(); // todo: destroy animation
                }
            } else if (c.newLocation === "deckP1" || c.newLocation === "deckP2") {
                if (avatar !== undefined) {
                    avatar.destroy(); // todo: move animation instead of *poof*
                }
            } else if (c.newLocation === "temp") {
                // todo... hide the card and put it in a special place?
            }
            else {
                if (avatar === undefined) {
                    avatar = this.avatars.spawnCard(c.cardSnapshot);
                }

                if (c.newLocation === "handP1") {
                    this.avatars.scene.hands[0].addCard(avatar);
                } else if (c.newLocation === "handP2") {
                    this.avatars.scene.hands[1].addCard(avatar);
                }
            }
        }
    }
}