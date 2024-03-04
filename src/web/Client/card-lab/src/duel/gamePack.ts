import {duelLog} from "./log.ts";

export async function loadGamePack(defUrl: string, resUrl: string) {
    const start = performance.now()
    
    duelLog("Downloading game pack from:", defUrl, resUrl)
    
    const defProm = fetch(defUrl).then(x => x.json())
    const resProm = fetch(resUrl).then(x => x.blob())
    
    const [def, res] = await Promise.all([defProm, resProm])
    duelLog(`Game pack "${def.name}" downloaded in ${(performance.now() - start).toFixed(2)}ms`)
    
    return new DuelGamePack(def as DuelGamePackDef, res)
}

export interface CardAsset {
    id: number
    image: Blob
    definition: CardDefinition
}

export class DuelGamePack {
    id: string
    name: string
    cards= new Map<number, CardAsset>()
    
    definition: DuelGamePackDef
    
    public constructor(def: DuelGamePackDef, res: Blob) {
        this.definition = def
        this.id = def.id
        this.name = def.name
        
        for (const card of def.cards) {
            this.cards.set(card.id, {
                id: card.id,
                image: res.slice(card.image.loc, card.image.loc + card.image.size, "image/png"),
                definition: card.definition
            });
        }
    }
}