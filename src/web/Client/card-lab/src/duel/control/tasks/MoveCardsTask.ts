import {GameTask} from "src/duel/control/task.ts";
import {GameAvatars} from "src/duel/control/avatar.ts";
import type {LocalDuelCard} from "src/duel/control/state.ts";
import {Point} from "pixi.js";
import {CardPlayScopeTask} from "src/duel/control/tasks/CardPlayScopeTask.ts";
import {GAME_HEIGHT, GAME_WIDTH} from "src/duel/game/GameScene.ts";
import {CardDrawScopeTask} from "src/duel/control/tasks/CardDrawScopeTask.ts";
import {CardControlMode} from "src/duel/game/Card.ts";

export type MoveCardChange = {
    cardId: number;
    cardSnapshot: LocalDuelCard;
    prevLocation: DuelCardLocation;
    newLocation: DuelCardLocation;
    index: number | null;
}

export class MoveCardsTask extends GameTask {
    constructor(public mePlayerIndex: LocalDuelPlayerIndex,
                public changes: MoveCardChange[],
                public avatars: GameAvatars) {
        super();
    }

    * run() {
        for (const c of this.changes) {
            let avatar = this.avatars.findCard(c.cardId);

            // First: remove the card from old locations (same location transition is impossible)
            if (avatar && avatar.state.name === "hand") {
                avatar.switchToIdle();
            }

            if (c.newLocation === "discarded" &&
                (c.prevLocation === "deckP1" || c.prevLocation === "deckP2")) {
                // Spawn the avatar so we get an "oh no the card's gone!" animation
                avatar = this.avatars.spawnCard(c.cardSnapshot);
            }

            // When drawing cards:
            // Make the card slide from the right side of the screen 
            let positionOverride: Point | null = null
            const prevLocDeck = c.prevLocation === "deckP1" ?
                0 : c.prevLocation === "deckP2" ? 1 : -1;
            if (prevLocDeck !== -1) {
                const xSide = prevLocDeck === this.mePlayerIndex ? -1 : 1;
                positionOverride = new Point(
                    (1+xSide) * GAME_WIDTH / 2,
                    GAME_HEIGHT / 2
                );
                if (avatar !== undefined) {
                    avatar.position = positionOverride;
                }
            }

            if (c.newLocation === "discarded") {
                if (avatar !== undefined) {
                    if (avatar.state.name === "playing") {
                        avatar.queueDestroy();
                    } else if (this.parent instanceof CardPlayScopeTask && this.parent.shouldLay(c.cardId)) {
                        const pos = new Point(
                            GAME_WIDTH / 2,
                            this.avatars.scene.advCore.y
                        )
                        avatar.switchToLaying(pos, {
                            autoDestroyTime: 1000,
                            scale: 0.55,
                            hl: 0.1
                        })
                        if (c.cardSnapshot.type !== "unknown") {
                            const asset = this.avatars.scene.game.registry.findCard(c.cardSnapshot.defAssetRef)!;
                            this.avatars.scene.cardInfoTooltip.show(
                                asset.definition.name,
                                asset.definition.description);
                        }
                    } else if (avatar.state.name !== "laying") {
                        // Play some kind of animation to show both players that the card... disappears
                        avatar.switchToIdle();
                        avatar.updateTint(true); // feels like a hack...
                        avatar.moveSmooth(new Point(
                            GAME_WIDTH / 2,
                            GAME_HEIGHT / 2), 0.1);
                        avatar.scaleSmooth(1.5, 0.15);
                        yield GameTask.wait(1.5);
                        avatar.startDiscardAnim(true);
                        yield GameTask.callback(complete => avatar!.on("destroyed", complete));
                    }
                }
            } else if (c.newLocation === "deckP1" || c.newLocation === "deckP2") {
                if (avatar !== undefined) {
                    avatar.destroy(); // todo: move animation instead of *poof*
                }
            } else if (c.newLocation === "temp") {
                // todo... hide the card and put it in a special place?
            } else {
                if (avatar === undefined) {
                    avatar = this.avatars.spawnCard(c.cardSnapshot);
                }
                if (positionOverride !== null) {
                    avatar.position = positionOverride;
                }

                const handIndex = c.newLocation === "handP1" ? 0 : 1;
                this.avatars.scene.hands[handIndex].addCard(avatar);

                if (!(this.parent instanceof CardDrawScopeTask)) {
                    // Add a consequent delay if we're just moving cards between hands or something
                    yield GameTask.wait(0.2);
                } else {
                    // Else, use a smaller delay
                    yield GameTask.wait(0.1);
                }
            }
        }
    }
}