import {GameTask} from "src/duel/control/task.ts";
import {GameAvatars} from "src/duel/control/avatar.ts";
import {duelLogError} from "src/duel/log.ts";
import {CardVisualData, CardVisualDataOf} from "src/duel/game/Card.ts";
import {AttrCompMode, attrStateCompare} from "src/duel/game/AttrState.ts";

export class UpdateCardAttribsTask extends GameTask {
    constructor(public cardId: number, 
                public cardDef: CardDefinition,
                public attribs: Partial<NetDuelCardAttributes>,
                public avatars: GameAvatars) {
        super();
    }

    * run() {
        const avatar = this.avatars.findCard(this.cardId);
        if (avatar === undefined) {
            duelLogError("UpdateCardAttribsTask: card not found", this.cardId);
            return;
        }
        
        // we rely on the card's type to be correct (in line with the state type)
        const type = avatar.visual.type;
        const changes: Partial<CardVisualData> = {}
        if (type === "unit" || type === "spell") {
            const output = changes as Partial<CardVisualDataOf<"unit" | "spell">>
            const input = this.attribs;
            
            if (input.cost !== undefined) {
                output.cost = input.cost;
                output.costState = attrStateCompare(AttrCompMode.LESS_IS_BETTER, this.cardDef.cost, input.cost);
            }
        }
        
        if (type === "unit") {
            const output = changes as Partial<CardVisualDataOf<"unit">>
            const input = this.attribs as Partial<NetDuelUnitAttributes>
            
            if (input.attack !== undefined) {
                output.attack = input.attack;
                output.attackState = attrStateCompare(AttrCompMode.MORE_IS_BETTER, this.cardDef.attack, input.attack);
            }
            
            if (input.health !== undefined) {
                output.health = input.health;
                output.healthState = attrStateCompare(AttrCompMode.MORE_IS_BETTER, this.cardDef.health, input.health);
            }
        }
        
        avatar.updateVisuals(changes)
    }
}