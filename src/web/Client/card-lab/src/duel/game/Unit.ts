import {
    BitmapText,
    Container,
    FederatedPointerEvent,
    Graphics,
    Point,
    Rectangle,
    Sprite,
    TextStyle,
    Texture,
    Ticker
} from "pixi.js";
import {GameScene} from "src/duel/game/GameScene.ts";
import {easeExp, easeExpRev, placeInRectCenter, PointerTracker} from "src/duel/util.ts";
import {UnitSlot} from "src/duel/game/UnitSlotGrid.ts";
import {LocalDuelUnitPropositions} from "src/duel/control/state.ts";
import {InteractionData, InteractionType} from "src/duel/game/InteractionModule.ts";

const SELECT_DIST_THRESH = 25;

export type UnitVisualData = {
    image: Texture,
    attack: number,
    health: number,
    wounded: boolean
};

export enum UnitState {
    IDLE,
    SELECTED,
    PRE_ATTACKING,
    ATTACKING,
    DEAD
}

enum UnitAnim {
    NONE,
    ATTACK,
    DEATH,
    SPAWN
}

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
    root: Container;
    id: number = -1;
    visData: UnitVisualData
    // i'm gonna be real with you, calling this "art" when will all know this will be containing
    // absolutely hideous drawings is funny
    artwork: Sprite;
    border: Graphics;
    attackAttr: UnitAttribute;
    healthAttr: UnitAttribute;

    attackAttrParent: Container;
    healthAttrParent: Container;

    state = UnitState.IDLE
    occupiedSlot: UnitSlot | null = null
    propositions: LocalDuelUnitPropositions | null = null
    visuallyPlayable: boolean = false
    playable: boolean = false
    interactionId = -1
    pointerTracker: PointerTracker

    selectStart = new Point(0, 0);

    attackAnim = {
        target: new Point(0, 0),

        prepTime: 0.4,
        rushTime: 0.0,
        phase1Time: 0.0,

        goBackTime: 0.0,
        goBackOffset: new Point(0, 0),

        dir: new Point(0, 0),
        dist: 0.0,
        phase: 1 as 1 | 2,

        onPhase1Done: (u: Unit) => {
        },
        onPhase2Done: (u: Unit) => {
        }
    }
    deathAnim = {
        destroyDelay: 0.2,
        maxTime: 0.35
    }
    spawnAnim = {
        entryTime: 0.35,
        attrSlideTime: 0.4,
        attrSlideOffset: 0.2,
        get maxTime() {
            return this.entryTime + this.attrSlideTime - this.attrSlideOffset
        },
        onDone: (u: Unit) => {
        }
    }
    animTime = 0.0
    animPaused = false
    animName = UnitAnim.NONE

    constructor(public scene: GameScene, visData: UnitVisualData, slotW: number, slotH: number) {
        super();

        this.visData = visData;
        this.hitArea = new Rectangle(0, 0, slotW, slotH);
        this.root = new Container();
        this.addChild(this.root);

        this.artwork = new Sprite(makeArtworkFitTexture(visData.image, slotW, slotH));
        this.artwork.width = slotW;
        this.artwork.height = slotH;
        this.root.addChild(this.artwork);

        const borderWidth = 3;
        const bwHalf = borderWidth / 2;
        // i have no idea why those are the correct coordinates to make an inner border
        // honestly, it makes no sense to me...
        this.border = new Graphics()
            .rect(bwHalf, bwHalf, slotW - borderWidth, slotH - borderWidth)
            .stroke({width: borderWidth, color: 0xffffff});
        this.border.tint = 0x000000;
        this.root.addChild(this.border);

        this.attackAttrParent = new Container();
        this.healthAttrParent = new Container();
        this.root.addChild(this.attackAttrParent);
        this.root.addChild(this.healthAttrParent);

        this.attackAttr = new UnitAttribute(scene, slotW * 0.475, true, UnitAttrType.ATTACK);
        const attrY = slotH - this.attackAttr.height * 0.1;

        this.attackAttr.y = attrY;
        this.attackAttr.x = this.attackAttr.width * 0.5;
        this.attackAttrParent.addChild(this.attackAttr);

        this.healthAttr = new UnitAttribute(scene, slotW * 0.475, false, UnitAttrType.HEALTH);
        this.healthAttr.y = attrY;
        this.healthAttr.x = slotW - this.attackAttr.width * 0.5;
        this.healthAttrParent.addChild(this.healthAttr);

        this.updateVisualData(visData);

        const local = this.getLocalBounds();
        this.boundsArea = new Rectangle(local.x, local.y, local.width, local.height);

        this.eventMode = "static";
        this.pivot.set(slotW / 2, slotH / 2);

        this.pointerTracker = new PointerTracker(this, scene);
        this.pointerTracker.onStart = this.onTrackedPointerStart.bind(this);
        this.pointerTracker.onMove = this.onTrackedPointerMove.bind(this);
        this.pointerTracker.onStop = this.onTrackedPointerQuit.bind(this);

        this.listen(this.scene.interaction, "stop", this.onInteractionStop);
        this.listen(this.scene.interaction, "canStartUpdate", this.onInteractionCanStartUpdate);
        this.scene.game.app.ticker.add(this.tick, this);
        this.on("pointerdown", this.onUnitPointerDown, this);
        this.on("destroyed", () => {
            this.occupiedSlot?.empty();
            this.becomeIdle();
            this.scene.game.app.ticker.remove(this.tick, this);
        })
    }

    spawnOn(slot: UnitSlot) {
        this.position = slot.worldPos;
        slot.occupiedBy(this);
    }

    updatePropositions(propositions: LocalDuelUnitPropositions | null | undefined = null) {
        this.propositions = propositions ?? null;
        this.updatePlayableState()
    }

    updatePlayableState(canStart: boolean = this.scene.interaction.canStart()) {
        const vPrev = this.visuallyPlayable
        this.visuallyPlayable = this.propositions !== null && !this.scene.interaction.blocked;

        if (vPrev != this.visuallyPlayable) {
            this.onVisuallyPlayableUpdate(this.visuallyPlayable)
        }

        const pPrev = this.playable
        this.playable = this.visuallyPlayable && (canStart || this.scene.interaction.id === this.interactionId)

        if (pPrev !== this.playable) {
            this.onPlayableUpdate(this.playable)
        }
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
        if (visData.wounded !== undefined) {
            this.healthAttr.text.tint = visData.wounded ? "#ea1121" : 0xffffff;
        }
    }

    /*
     * Animations
     */

    tick(timer: Ticker) {
        if (this.animName !== UnitAnim.NONE && !this.animPaused) {
            this.animTime += timer.deltaMS / 1000;
        }

        if (this.animName === UnitAnim.ATTACK) {
            this.continueAttackAnim();
        } else if (this.animName === UnitAnim.DEATH) {
            this.continueDeathAnim();
        } else if (this.animName === UnitAnim.SPAWN) {
            this.continueSpawnAnim();
        }
    }

    startAttackAnim(target: Point) {
        if (this.animName !== UnitAnim.NONE) {
            this.clearAnim();
        }

        this.animName = UnitAnim.ATTACK;

        this.attackAnim.phase = 1;
        this.attackAnim.target = target;
        const posToTarget = this.attackAnim.target.subtract(this.position);
        this.attackAnim.dir = posToTarget.normalize();
        this.attackAnim.dist = posToTarget.magnitude();
        this.attackAnim.prepTime = 0.375;
        this.attackAnim.rushTime = 0.15 + this.attackAnim.dist * 0.0001;
        this.attackAnim.phase1Time = this.attackAnim.prepTime + this.attackAnim.rushTime;
        this.attackAnim.goBackTime = 0.5 + this.attackAnim.dist * 0.0002;
        this.attackAnim.onPhase1Done = () => {
        };
        this.attackAnim.onPhase2Done = () => {
        };

        this.zIndex = 1;
    }

    private continueAttackAnim() {
        const prepDist = 50;
        const {prepTime, rushTime, phase1Time, dir, dist} = this.attackAnim;

        let t = this.animTime;

        if (this.attackAnim.phase === 1) {
            const calcMagnitude = (time: number) => {
                if (time <= prepTime) {
                    const progress = time / prepTime;
                    return -prepDist * easeExp(progress, -4.0)
                } else {
                    const progress = (time - prepTime) / rushTime;
                    // The radius of the (imaginary) circle hurtbox.
                    // (multiply it by .8 so we penetrate it a bit)
                    const offset = Math.min(this.border.height, this.border.width) * .8;

                    const maxDist = dist - offset + prepDist;
                    return -prepDist + maxDist * easeExp(progress, 3);
                }
            }

            if (t > phase1Time) {
                // animTime is untouched.
                t = phase1Time;
                this.animPaused = true;
                this.attackAnim.onPhase1Done(this);
            }
            const magnitude = calcMagnitude(t);
            this.root.position = dir.multiplyScalar(magnitude);
        } else if (this.attackAnim.phase === 2) {
            t = t - phase1Time;
            if (t > this.attackAnim.goBackTime) {
                this.clearAnim();
                this.becomeIdle();
                this.attackAnim.onPhase2Done(this);
            } else {
                const progress = t / this.attackAnim.goBackTime;
                this.root.position = this.attackAnim.goBackOffset.multiplyScalar(
                    easeExpRev(progress, -4)
                );
            }
        }
    }

    launchAttackAnimPhase2() {
        this.animPaused = false;
        this.attackAnim.phase = 2;
        this.attackAnim.goBackOffset = new Point(this.root.position.x, this.root.position.y);
        this.continueAttackAnim();
    }

    startDeathAnim() {
        if (this.animName !== UnitAnim.NONE) {
            this.clearAnim();
        }
        
        this.animName = UnitAnim.DEATH;
        this.animTime = 0.0;
    }

    continueDeathAnim() {
        const {destroyDelay, maxTime} = this.deathAnim;
        if (this.animTime <= maxTime) {
            this.root.position = new Point(
                (Math.random() - 0.5) * 10,
                (Math.random() - 0.5) * 10
            );
        } else {
            this.clearAnim();
            this.destroy();
        }
    }

    startSpawnAnim() {
        if (this.animName !== UnitAnim.NONE) {
            this.clearAnim();
        }

        this.spawnAnim.onDone = () => {};
        this.animName = UnitAnim.SPAWN;
        this.animTime = 0.0;
        this.zIndex = 1;
    }

    continueSpawnAnim() {
        const {entryTime, attrSlideTime, maxTime, attrSlideOffset} = this.spawnAnim;
        
        if (this.animTime > maxTime) {
            this.spawnAnim.onDone(this);
            this.clearAnim();
            return;
        }

        const t = this.animTime;

        const entryProgress = Math.min(1, t / entryTime);
        this.root.position.y = easeExpRev(entryProgress, -2) * this.height * 0.4;
        this.root.alpha = easeExp(entryProgress, -2);

        const attrSlideProgress = Math.min(1, (t - entryTime + attrSlideOffset) / attrSlideTime);

        const mid = 0.5;
        const w = this.healthAttr.width;
        const h = this.healthAttr.height;
        function attrX(progress: number) {
            if (progress < mid) {
                return (mid-progress)/mid*w*0.3;
            } else {
                return 0;
            }
        }
        function attrY(progress: number) {
            if (progress < mid) {
                return h*0.4;
            } else {
                return h*0.4*(1-(progress-mid)/mid);
            }
        }
        const alphaMid = 0.6;
        function attrAlpha(progress: number) {
            return progress > alphaMid ? 1 : progress/alphaMid;
        }
        
        if (attrSlideProgress < 0) {
            this.healthAttrParent.alpha = 0
            this.attackAttrParent.alpha = 0
        } else {
            this.healthAttrParent.alpha = attrAlpha(attrSlideProgress)
            this.attackAttrParent.alpha = attrAlpha(attrSlideProgress)
            this.healthAttrParent.position.set(attrX(attrSlideProgress), attrY(attrSlideProgress));
            this.attackAttrParent.position.set(-attrX(attrSlideProgress), attrY(attrSlideProgress));
        }
    }

    clearAnim() {
        this.animName = UnitAnim.NONE;
        this.animTime = 0.0;
        this.animPaused = false;
        for (const c of [this.root, this.healthAttrParent, this.attackAttrParent]) {
            c.position.set(0, 0);
            c.scale.set(1, 1);
            c.rotation = 0;
            c.alpha = 1;
        }
        this.zIndex = 0;
    }

    /*
     * Pointer events
     */

    onUnitPointerDown(e: FederatedPointerEvent) {
        if (this.state === UnitState.IDLE && this.playable && !this.pointerTracker.running) {
            this.pointerTracker.start(e);
        }
    }

    onTrackedPointerStart(pos: Point) {
        this.selectStart = pos;
    }

    onTrackedPointerMove(pos: Point) {
        if (this.state === UnitState.IDLE) {
            if (pos.subtract(this.selectStart).magnitude() > SELECT_DIST_THRESH) {
                this.becomeSelected(pos);
            }
        } else if (this.state === UnitState.SELECTED) {
            this.scene.targetArrow.update(pos);
        }
    }

    onTrackedPointerQuit() {
        this.selectStart = new Point(0, 0);
        if (this.state === UnitState.SELECTED) {
            const targetId = this.findEntityAtPointer();
            if (targetId !== null &&
                this.scene.interaction.canSubmit(InteractionType.ATTACKING_UNIT, {targetId})) {
                this.scene.interaction.submit(InteractionType.ATTACKING_UNIT, {targetId})
                this.startPreAttacking();
            } else {
                this.becomeIdle();
            }
        }
    }

    /*
     * Interaction actions
     */

    findEntityAtPointer() {
        const pos = this.scene.targetArrow.targetPos;

        for (const id of this.propositions!.allowedEntities) {
            const entity = this.scene.findEntity(id);
            if (entity === undefined) {
                continue;
            }

            const bounds = entity.getLocalBounds();
            bounds.x = entity.x - entity.pivot.x;
            bounds.y = entity.y - entity.pivot.y;
            if (bounds.containsPoint(pos.x, pos.y)) {
                return id
            }
        }

        return null
    }

    /*
     * Interaction & playable events
     */

    onInteractionStop(type: InteractionType, data: InteractionData, id: number, cancel: boolean) {
        if (this.interactionId === id) {
            this.interactionId = -1;
            if (this.state !== UnitState.PRE_ATTACKING) {
                this.becomeIdle();
            }
        }
    }

    onInteractionCanStartUpdate(canStart: boolean) {
        this.updatePlayableState(canStart);
    }

    onVisuallyPlayableUpdate(value: boolean) {
        this.border.tint = value ? 0xa300c8 : 0x000000;
    }

    onPlayableUpdate(value: boolean) {
        if (!value) {
            this.pointerTracker.stop(true);
            if (this.state === UnitState.SELECTED) {
                this.becomeIdle();
            }
        }
    }

    /*
     * State management
     */

    becomeSelected(target: Point) {
        if (this.state !== UnitState.SELECTED && this.playable && this.propositions !== null) {
            this.scene.interaction.start(InteractionType.ATTACKING_UNIT, {
                unit: this,
                propositions: this.propositions
            }, i => this.interactionId = i);

            this.state = UnitState.SELECTED;
            this.scene.targetArrow.show(this.position, target);
            this.scene.entitySelectOverlay.show(this.propositions.allowedEntities)
        }
    }

    exitSelected(stopInteraction = true) {
        if (this.interactionId !== -1
            && this.interactionId === this.scene.interaction.id
            && stopInteraction) {
            this.interactionId = -1;
            this.scene.interaction.stop(true);
        }

        this.pointerTracker.stop(true);
        this.scene.targetArrow.hide();
        this.scene.entitySelectOverlay.hide();
    }

    becomeIdle() {
        if (this.state === UnitState.SELECTED) {
            this.exitSelected();
        }
        if (this.state === UnitState.PRE_ATTACKING) {
            // what do?
        }

        if (this.state !== UnitState.IDLE) {
            this.state = UnitState.IDLE;
        }
    }

    startPreAttacking() {
        if (this.state === UnitState.SELECTED) {
            this.exitSelected(false);
            this.state = UnitState.PRE_ATTACKING;
            // todo: start attack anim, but stop early in phase 1
        }
    }

    beginAttacking(target: Point) {
        if (this.state === UnitState.IDLE || this.state === UnitState.PRE_ATTACKING) {
            this.state = UnitState.ATTACKING;
            this.startAttackAnim(target);
        }
    }

    becomeDead() {
        if (this.state !== UnitState.DEAD) {
            this.state = UnitState.DEAD;
            this.startDeathAnim();
            this.scene.unregisterUnitEarly(this);
        }
    }
}

const ATTR_TEXT_STYLE = new TextStyle({
    fontFamily: "ChakraPetchDigits",
    fontSize: 48 // will be scaled down accordingly
});

const ATTR_MARGIN = 2;

enum UnitAttrType {
    ATTACK,
    HEALTH
}

export class UnitAttribute extends Container {
    background: Sprite;
    backdrop: Sprite;
    text: BitmapText;
    value: number;
    backgroundBounds: Rectangle

    constructor(public scene: GameScene, width: number,
                public cornerLeft: boolean,
                public type: UnitAttrType) {
        super();

        this.value = -1;

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

        const bounds = this.getLocalBounds();
        this.backgroundBounds = new Rectangle(0, 0, width, this.background.height);
        this.boundsArea = new Rectangle(bounds.x, bounds.y, bounds.width, bounds.height);
        this.pivot.set(this.boundsArea.width / 2, this.boundsArea.height / 2);

        this.text = new BitmapText({
            text: "",
            style: ATTR_TEXT_STYLE
        })
        this.addChild(this.text);
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
        placeInRectCenter(this.text, this.backgroundBounds)
    }
}

export class UnitTargetArrow extends Container {
    line: Graphics;
    target: Sprite;
    active = false;
    startPos = new Point();
    targetPos = new Point();

    constructor(public scene: GameScene) {
        super();

        this.line = new Graphics();
        this.addChild(this.line);

        this.target = new Sprite(scene.game.assets.base.attackTarget);
        this.target.width = 168;
        this.target.scale.y = this.target.scale.x;
        this.target.anchor.set(0.5, 0.5);
        this.target.tint = 0xa300c8;
        this.addChild(this.target);

        this.eventMode = "none";
        this.position = new Point(0, 0);
        this.zIndex = 10000;
        this.visible = false;

        this.scene.game.app.ticker.add(this.tick, this);
    }

    show(pos: Point, target: Point) {
        this.active = true;
        this.startPos = pos;
        this.targetPos = target;
        this.redraw();
        this.visible = true;
    }

    update(target: Point) {
        if (this.active) {
            this.targetPos = target;
            this.redraw();
        }
    }

    hide() {
        this.active = false;
        this.visible = false;
        this.line.clear();
        this.target.rotation = 0.0;
    }

    redraw() {
        this.line
            .clear()
            .moveTo(this.startPos.x, this.startPos.y)
            .lineTo(this.targetPos.x, this.targetPos.y)
            .stroke({width: 12, color: 0xa300c8})
            .circle(this.startPos.x, this.startPos.y, 6)
            .fill({color: 0xa300c8});
        this.target.position = this.targetPos;
    }

    tick(t: Ticker) {
        if (this.active) {
            this.target.rotation += (t.deltaMS / 4000) * 6.28;
        }
    }
}