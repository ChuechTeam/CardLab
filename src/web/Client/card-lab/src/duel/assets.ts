import {DuelGameRegistry} from "./gameRegistry.ts";
import {CardAsset} from "./gamePack.ts";
import {Assets, BitmapFont, GraphicsContext, Texture} from "pixi.js";
import cardUpBgUrl from "./assets/card-up-bg.png";
import cardDownBgUrl from "./assets/card-down-bg.png";
import attribBgUrl from "./assets/attrib-bg.png";
import attribBgBlackUrl from "./assets/attrib-bg-black.png";
import healthIconUrl from "./assets/health-icon.svg";
import boardCoreUrl from "./assets/board-core-filled.png";
import largeAttrBgUrl from "./assets/large-attr-bg.svg";
import verticalGradientUrl from "./assets/vertical-gradient.png";
import attackTargetUrl from "./assets/attack-target.png";
import glossUrl from "./assets/gloss.png";
import boardCoreMaskUrl from "./assets/board-core-mask.png";
import waitIconUrl from "./assets/wait-icon.svg";
import whiteUrl from "./assets/white.png";
import spellCornerUrl from "./assets/spell-corner.png";
import waitIconWhite from "./assets/wait-icon-white.png";
import {duelLog} from "./log.ts";

type BaseBundleType = typeof baseBundle;

type BaseAssetType<T extends keyof BaseBundleType>
    = BaseBundleType[T] extends ReturnType<typeof svgAsset> ? GraphicsContext : Texture;

export type BaseAssets = {
    [T in keyof typeof baseBundle]: BaseAssetType<T>
}

function svgAsset(url: string) {
    return {
        src: url,
        data: {
            parseAsGraphicsContext: true
        }
    }
}

const baseBundle = {
    "cardUpBg": cardUpBgUrl,
    "cardDownBg": cardDownBgUrl,
    "attribBg": attribBgUrl,
    "attribBgBlack": attribBgBlackUrl,
    "boardCore": boardCoreUrl,
    "boardCoreMask": boardCoreMaskUrl,
    "verticalGradient": verticalGradientUrl,
    "healthIcon": svgAsset(healthIconUrl),
    "largeAttrBg": svgAsset(largeAttrBgUrl),
    "attackTarget": attackTargetUrl,
    "waitIcon": svgAsset(waitIconUrl),
    "waitIconWhite": waitIconWhite,
    "gloss": glossUrl,
    "white": whiteUrl,
    "spellCorner": spellCornerUrl
};

let bundleAdded = false;
let fontsLoaded = false;

export async function loadDuelAssets(gameRegistry: DuelGameRegistry) {
    const begin = performance.now()
    
    if (!bundleAdded) {
        Assets.addBundle("baseBundle", baseBundle)
        bundleAdded = true;
    }
    const bundlePromise = Assets.loadBundle("baseBundle").then(x => x as BaseAssets)

    const assetPromises: Promise<[string, CardAsset, ImageBitmap] | null>[] = []
    for (const pack of gameRegistry.packs) {
        for (const card of pack.cards.values()) {
            if (card.image !== null) {
                assetPromises.push(createImageBitmap(card.image)
                    .then<[string, CardAsset, ImageBitmap] | null>(img => [pack.id, card, img])
                    .catch(e => {
                        console.error("Failed to read image bitmap for card", card, " Reason:", e)
                        return null
                    })
                )
            }
        }
    }

    duelLog(`Loading assets:
    - ${assetPromises.length} card bitmaps
    - ${Object.keys(baseBundle).length} base assets`);
    const cardAssets = await Promise.all(assetPromises)

    const map = {} as Record<string, Record<number, Texture>>
    for (const x of cardAssets) {
        if (x === null) { continue; }
        
        const [packId, card, img] = x
        if (!map[packId]) {
            map[packId] = {}
        }
        map[packId][card.id] = Texture.from(img)
    }

    const baseAssets = await bundlePromise

    // this requires the style.css file to be loaded in the page!
    if (!fontsLoaded) {
        await document.fonts.load("12px Chakra Petch")
        BitmapFont.install({
            name: "ChakraPetchDigits",
            chars: "0123456789!.,;/+-",
            style: {
                fontSize: 120,
                fill: 0xffffff,
                fontFamily: "Chakra Petch"
            },
            resolution: 1
        });
        
        fontsLoaded = true;
    }

    const end = performance.now()
    duelLog(`Assets loaded in ${(end - begin).toFixed(2)}ms`)

    return new DuelAssets(baseAssets, map)
}

export class DuelAssets {
    constructor(public base: BaseAssets, public cardImages: Record<string, Record<number, Texture>>) {
    }

    getCardTextureOrFallback({packId, cardId}: CardAssetRef) {
        const p = this.cardImages[packId]
        if (!p) {
            return this.fallbackTexture;
        }
        return p[cardId] ?? this.fallbackTexture;
    }

    get fallbackTexture() {
        return this.base.white;
    }
}