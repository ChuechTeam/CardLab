import {DuelGameRegistry} from "./gameRegistry.ts";
import {CardAsset} from "./gamePack.ts";
import {Assets, Texture} from "pixi.js";

export interface BaseAssets {

}

const baseBundle = {}

export async function loadDuelAssets(gameRegistry: DuelGameRegistry) {
    const begin = performance.now()

    Assets.addBundle("baseBundle", baseBundle)
    const bundlePromise = Assets.loadBundle("baseBundle")
        .then(x => {
            console.log(`DUEL: base bundle loaded`);
            return x as BaseAssets
        })

    const assetPromises: Promise<[string, CardAsset, ImageBitmap]>[] = []
    for (const pack of gameRegistry.packs) {
        for (const card of Object.values(pack.cards)) {
            assetPromises.push(createImageBitmap(card.image).then(img => [pack.id, card, img]))
        }
    }
    
    console.log(`DUEL: creating ${assetPromises.length} card bitmaps`)
    const cardAssets = await Promise.all(assetPromises)
    console.log(`DUEL: card bitmaps created`)

    const map = {} as Record<string, Record<number, Texture>>
    for (const [packId, card, img] of cardAssets) {
        if (!map[packId]) {
            map[packId] = {}
        }
        map[packId][card.id] = Texture.from(img)
    }

    const baseAssets = await bundlePromise

    const end = performance.now()
    console.log(`DUEL: assets loaded in ${end - begin}ms`)

    return new DuelAssets(baseAssets, map)
}

export class DuelAssets {
    constructor(public base: BaseAssets, public cardImages: Record<string, Record<number, Texture>>) {
    }

    getCardTexture({packId, cardId}: CardAssetRef) {
        const p = this.cardImages[packId]
        if (!p) {
            return null
        }
        return p[cardId] ?? null;
    }
}