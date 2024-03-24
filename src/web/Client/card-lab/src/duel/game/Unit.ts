import {BitmapText, Container, Graphics, Point, Rectangle, Sprite, TextStyle, Texture} from "pixi.js";
import {GameScene} from "src/duel/game/GameScene.ts";
import {placeInRectCenter} from "src/duel/util.ts";
import {UnitSlot} from "src/duel/game/UnitSlotGrid.ts";

export type UnitVisualData = {
    image: Texture,
    attack: number,
    health: number
};

// This is like background-fit: cover in CSS.
function makeArtworkFitTexture(art: Texture, tW: number, tH: number) {
    const aW = art.width;
    const aH = art.height;

    // Our end goal: artAspectRatio = targetAspectRatio; which we can write using this equation
    // aW/aH = tW/tH     (where aW = artWidth ; aH = artHeight ; tW = targetWidth ; tH = targetHeight)
    // We choose one of two solutions:
    //   aW' = aH*(tW/tH) = aH*tAR
    //   aH' = aW*(tH/tW) = aW*(1/tAR) = aW/tAR
    // However, we do not want to stretch the art, in other words, we want aW' <= aW and aH' <= aH.
    // So, when will we have aW' <= aW? That happens when the art is wider than the target area; 
    // and that occurs when tAR<aAR.
    // In the opposite situation, when tAR>aAR, we have aH' <= aH.
    //
    // However, we don't need to compute this, if we just calculate aW' and then check if it
    // fits, that works too. Since this is the most common case, it just works fine(tm).

    let artRect: Rectangle

    const tAR = tW / tH;
    const newAW = aH * tAR;
    if (newAW <= aW) {
        // The art is too wide! Crop it.
        const lostPixels = aW - newAW; // >= 0
        artRect = new Rectangle(lostPixels / 2, 0, newAW, aH);
    } else {
        // The art is too tall! Crop it.
        const newAH = aW / tAR;
        const lostPixels = aH - newAH;
        artRect = new Rectangle(0, lostPixels / 2, aW, newAH);
    }

    return new Texture({source: art.source, frame: artRect});
}

export class Unit extends Container {
    visData: UnitVisualData
    // i'm gonna be real with you, calling this "art" when will all know this will be containing
    // absolutely hideous drawings is funny
    artwork: Sprite;
    border: Graphics;
    attackAttr: UnitAttribute;
    healthAttr: UnitAttribute;
    
    occupiedSlot: UnitSlot | null = null

    constructor(public scene: GameScene, visData: UnitVisualData, slotW: number, slotH: number) {
        super();

        this.visData = visData;
        this.boundsArea = new Rectangle(0, 0, slotW, slotH);

        this.artwork = new Sprite(makeArtworkFitTexture(visData.image, slotW, slotH));
        this.artwork.width = slotW;
        this.artwork.height = slotH;
        this.addChild(this.artwork);

        const borderWidth = 3;
        const bwHalf = borderWidth / 2;
        // i have no idea why those are the correct coordinates to make an inner border
        // honestly, it makes no sense to me...
        this.border = new Graphics()
            .rect(bwHalf, bwHalf, slotW - borderWidth, slotH - borderWidth)
            .stroke({width: borderWidth, color: 0x000000});
        this.addChild(this.border);

        this.attackAttr = new UnitAttribute(scene, slotW * 0.475, visData.attack, true, UnitAttrType.ATTACK);
        const attrY = slotH - this.attackAttr.height * 0.1;

        this.attackAttr.y = attrY;
        this.attackAttr.x = this.attackAttr.width * 0.5;
        this.addChild(this.attackAttr);

        this.healthAttr = new UnitAttribute(scene, slotW * 0.475, visData.health, false, UnitAttrType.HEALTH);
        this.healthAttr.y = attrY;
        this.healthAttr.x = slotW - this.attackAttr.width * 0.5;
        this.addChild(this.healthAttr);

        this.pivot.set(slotW / 2, slotH / 2);
        
        this.on("destroyed", () => {
            this.occupiedSlot?.empty();
        })
    }
    
    spawnOn(slot: UnitSlot) {
        this.position = slot.worldPos;
        slot.occupiedBy(this);
    }
    
    updateVisualData(visData: Partial<UnitVisualData>) {
        if (visData.attack !== undefined) {
            this.attackAttr.value = visData.attack;
            this.attackAttr.updateText();
        }
        if (visData.health !== undefined) {
            this.healthAttr.value = visData.health;
            this.healthAttr.updateText();
        }
    }
}

const ATTR_TEXT_STYLE = new TextStyle({
    fontFamily: "ChakraPetchDigits",
    fontSize: 48 // will be scaled down accordingly
});

const ATTR_MARGIN = 4;

enum UnitAttrType {
    ATTACK,
    HEALTH
}

export class UnitAttribute extends Container {
    background: Sprite;
    backdrop: Sprite;
    text: BitmapText;
    value: number;

    constructor(public scene: GameScene, width: number, value: number,
                public cornerLeft: boolean,
                public type: UnitAttrType) {
        super();

        this.value = value;
        
        this.backdrop = this.makeBackground(width)
        this.backdrop.y += this.backdrop.height * 0.12;
        if (type === UnitAttrType.HEALTH) {
            this.backdrop.tint = "#b60000";
        } else if (type === UnitAttrType.ATTACK) {
            this.backdrop.tint = "#a300c8";
        }
        this.addChild(this.backdrop);
        
        this.background = this.makeBackground(width)
        this.addChild(this.background);


        this.boundsArea = new Rectangle(0, 0, width, this.background.height);
        this.pivot.set(this.boundsArea.width / 2, this.boundsArea.height / 2);

        this.text = new BitmapText({
            text: "",
            style: ATTR_TEXT_STYLE
        })
        this.addChild(this.text);

        this.updateText();
    }
    
    makeBackground(width: number) {
        const bg = new Sprite(this.scene.game.assets.base.attribBg);
        bg.tint = 0x000000;
        bg.width = width;
        bg.scale.y = bg.scale.x * 0.95;
        if (this.cornerLeft) {
            bg.scale.x = -bg.scale.x;
            bg.x += bg.width;
        }
        return bg
    }

    updateText() {
        this.text.text = this.value.toString();
        this.text.height = this.background.height - ATTR_MARGIN;
        this.text.scale.x = this.text.scale.y;
        placeInRectCenter(this.text, this.boundsArea)
    }
}