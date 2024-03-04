import {DuelGameRegistry} from "./gameRegistry.ts";
import {CardAsset} from "./gamePack.ts";
import {Assets, Texture} from "pixi.js";
import cardUpBgUrl from "./assets/card-up-bg.png";
import cardDownBgUrl from "./assets/card-down-bg.png";
import attribBgUrl from "./assets/attrib-bg.png";
import {duelLog} from "./log.ts";

export type BaseAssets = {
    [T in keyof typeof baseBundle]: Texture
}

const baseBundle = {
    "cardUpBg": cardUpBgUrl,
    "cardDownBg": cardDownBgUrl,
    "attribBg": attribBgUrl
}

export async function loadDuelAssets(gameRegistry: DuelGameRegistry) {
    const begin = performance.now()
    
    Assets.addBundle("baseBundle", baseBundle)
    const bundlePromise = Assets.loadBundle("baseBundle").then(x => x as BaseAssets)

    const assetPromises: Promise<[string, CardAsset, ImageBitmap]>[] = []
    for (const pack of gameRegistry.packs) {
        for (const card of pack.cards.values()) {
            assetPromises.push(createImageBitmap(card.image).then(img => [pack.id, card, img]))
        }
    }

    duelLog(`Loading assets:
    - ${assetPromises.length} card bitmaps
    - ${Object.keys(baseBundle).length} base assets`);
    const cardAssets = await Promise.all(assetPromises)

    const map = {} as Record<string, Record<number, Texture>>
    for (const [packId, card, img] of cardAssets) {
        if (!map[packId]) {
            map[packId] = {}
        }
        map[packId][card.id] = Texture.from(img)
    }

    const baseAssets = await bundlePromise
    
    // this requires the style.css file to be loaded in the page! 
    await document.fonts.load("12px Chakra Petch")
    
    const end = performance.now()
    duelLog(`Assets loaded in ${(end - begin).toFixed(2)}ms`)

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