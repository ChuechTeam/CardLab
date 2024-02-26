import {CardAsset, DuelGamePack} from "./gamePack.ts";

export class DuelGameRegistry {
    packMap = new Map<string, DuelGamePack>()
    packs: readonly DuelGamePack[]
    
    public constructor(packs: DuelGamePack[]) {
        for (const p of packs) {
            this.packMap.set(p.id, p)
        }
        this.packs = Object.freeze(packs);
    }
    
    findCard(ref: CardAssetRef): CardAsset | null {
        const pack = this.packMap.get(ref.packId)
        if (!pack) {
            return null;
        }
        return pack.cards.get(ref.cardId) || null;
    }
}