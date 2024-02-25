import {CardAsset, DuelGamePack} from "./gamePack.ts";

export class DuelGameRegistry {
    packMap: Record<string, DuelGamePack> = {}
    
    public constructor(packs: DuelGamePack[]) {
        for (const p of packs) {
            for (const c of Object.values(p.cards)) {
                this.packMap[c.id] = p
            }
        }
    }
    
    findCard(ref: CardAssetRef): CardAsset | null {
        const pack = this.packMap[ref.cardId]
        if (!pack) {
            return null;
        }
        return pack.cards[ref.cardId] || null;
    }
    
    get packs() {
        return Object.values(this.packMap)
    }
}