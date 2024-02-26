export async function loadGamePack(defUrl: string, resUrl: string) {
    const start = performance.now()
    
    console.log("DUEL: loading game pack from:", defUrl, resUrl)
    
    const defProm = fetch(defUrl).then(x => x.json())
    const resProm = fetch(resUrl).then(x => x.blob())
    
    const [def, res] = await Promise.all([defProm, resProm])
    console.log(`DUEL: game pack loaded in ${performance.now() - start}ms`)
    
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