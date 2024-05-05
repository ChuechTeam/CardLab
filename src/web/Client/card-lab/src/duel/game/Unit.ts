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
import {clerp, easeExp, easeExpRev, lerp, placeInRectCenter, PointerTracker} from "src/duel/util.ts";
import {UnitSlot} from "src/duel/game/UnitSlotGrid.ts";
import {LocalDuelUnitPropositions} from "src/duel/control/state.ts";
import {InteractionData, InteractionType} from "src/duel/game/InteractionModule.ts";
import {StateAnimation, StateAnimPlayer} from "src/duel/anim.ts";
import {PulsatingRect} from "src/duel/game/PulsatingRect.ts";
import {GlossyRect} from "src/duel/game/GlossyRect.ts";
import {AttrChangeIndicator} from "src/duel/game/AttrChangeIndicator.ts";
import {CardVisualData} from "src/duel/game/Card.ts";
import {AttrState, attrTextColor} from "src/duel/game/AttrState.ts";

const SELECT_DIST_THRESH = 25;
const ATK_COLOR = 0xa300c8;

export type UnitVisualData = {
    image: Texture,
    attack: number,
    attackState: AttrState,
    health: number,
    healthState: AttrState,
    actionsShown: boolean,
    actionsLeft: number // < 0 --> waiting
    associatedCardData: CardVisualData
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

type UnitAnimProps = typeof Unit.prototype.animatableProps;

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
    whiteFlash: Graphics;
    redFlash: Graphics;
    pulseRect: PulsatingRect;
    glossyRect: GlossyRect;
    actionIndicator: UnitActionIndicator;

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
    selectPos = new Point(0, 0);

    attackAnim = {
        target: new Point(0, 0),

        prepTime: 0.45,
        rushTime: 0.0,

        goBackTime: 0.0,
        goBackOffset: new Point(0, 0),

        dir: new Point(0, 0),
        dist: 0.0,
        // Phase 0: preparation
        // Phase 1: rush to target
        // Phase 2: go back
        phase: 0 as 0 | 1 | 2,
        pauseAfterPhase0: false,

        onPhase1Done: (u: Unit) => {
        },
        onPhase2Done: (u: Unit) => {
        }
    }
    deathAnim = {
        destroyDelay: 0.2,
        maxTime: 0.4,
        randRot: 0
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

    animatableProps = {
        rootPos: new Point(0, 0),
        rootRot: 0.0,
        rootScale: 1.0,
        flashVisible: false,
        flashTint: 0xffffff,
        flashAlpha: 1.0,
        flash2Visible: false,
        flash2Alpha: 1.0,
        borderWidth: 3,
        borderTint: 0x000000 // Also affects the change indicator
    }
    animPropsDirty = false
    superimposedAnimator = new StateAnimPlayer<UnitAnimProps>()
    superHadAnimated = false

    superHurtAnim = this.superAnimMakeHurt()
    superPlayableAnim = this.superAnimMakePlayable()
    superTriggerAnim = this.superAnimMakeTrigger()
    superImpactAnim = this.superAnimMakeImpact()

    queuedTriggerAnimDone = false

    onTriggerAnimDone: (() => void) | null = null

    constructor(public scene: GameScene, visData: UnitVisualData, slotW: number, slotH: number) {
        super();

        this.visData = visData;
        this.boundsArea = new Rectangle(-slotW/2, -slotH/2, slotW, slotH*1.16);
        
        this.root = new Container();
        this.addChild(this.root);

        this.artwork = new Sprite(makeArtworkFitTexture(visData.image, slotW, slotH));
        this.artwork.width = slotW;
        this.artwork.height = slotH;
        this.root.addChild(this.artwork);

        this.border = new Graphics()
            .rect(0, 0, slotW, slotH)
            .stroke({width: this.animatableProps.borderWidth, color: 0xffffff, alignment: 1});
        this.border.tint = this.animatableProps.borderTint;
        this.root.addChild(this.border);

        const actW = slotW*0.25;
        const actH = slotH*0.25;
        this.actionIndicator = new UnitActionIndicator(scene, actW, actH, visData.actionsLeft);
        this.actionIndicator.visible = visData.actionsShown;
        this.actionIndicator.position.set(slotW - actW/2*0.8, actH/2*0.8);
        this.root.addChild(this.actionIndicator);

        this.whiteFlash = new Graphics()
            .rect(0, 0, slotW, slotH)
            .fill({color: 0xffffff});
        this.whiteFlash.visible = false;
        this.whiteFlash.blendMode = "add";
        this.root.addChild(this.whiteFlash)

        this.redFlash = new Graphics()
            .rect(0, 0, slotW, slotH)
            .fill({color: 0xffffff});
        this.redFlash.visible = false;
        this.redFlash.blendMode = "normal";
        this.redFlash.tint = 0xff0000;
        this.root.addChild(this.redFlash)

        this.pulseRect = new PulsatingRect(scene, {
            innerWidth: slotW,
            innerHeight: slotH,
            thickness: 5,
            endThicknessScale: 0.6,
            distance: 40,
            pulseTime: 0.6,
            interval: 2.5 + Math.random(),
            color: ATK_COLOR
        });
        this.root.addChild(this.pulseRect)

        this.glossyRect = new GlossyRect(scene, {
            width: slotW,
            height: slotH,
            glossSize: Math.sqrt(slotW * slotW + slotH * slotH),
            time: 0.6,
            alpha: 0.8,
            autoMask: true
        });
        //this.glossyRect.gloss.blendMode = "add";
        this.root.addChild(this.glossyRect)

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

        this.superAnimRegister()
        
        this.root.eventMode = "static";
        this.root.pivot.set(slotW / 2, slotH / 2);
        this.root.hitArea = new Rectangle(0, 0, slotW, slotH);

        this.pointerTracker = new PointerTracker(this, scene);
        this.pointerTracker.onStart = this.onTrackedPointerStart.bind(this);
        this.pointerTracker.onMove = this.onTrackedPointerMove.bind(this);
        this.pointerTracker.onStop = this.onTrackedPointerQuit.bind(this);

        this.listen(this.scene.interaction, "stop", this.onInteractionStop);
        this.listen(this.scene.interaction, "canStartUpdate", this.onInteractionCanStartUpdate);
        this.scene.game.app.ticker.add(this.tick, this);
        this.root.on("pointerdown", this.onUnitPointerDown, this);
        this.root.on("pointertap", this.onUnitPointerTap, this);
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
            this.visData.attack = visData.attack;
            this.attackAttr.value = visData.attack;
            if (visData.attackState !== undefined) {
                this.visData.attackState = visData.attackState;
                this.attackAttr.attrState = visData.attackState;
            }
            this.attackAttr.updateText();
        }

        if (visData.health !== undefined) {
            this.visData.health = visData.health;
            this.healthAttr.value = visData.health;
            if (visData.healthState !== undefined) {
                this.visData.healthState = visData.healthState;
                this.healthAttr.attrState = visData.healthState;
            }
            this.healthAttr.updateText();
        }
        
        if (visData.actionsLeft !== undefined) {
            this.visData.actionsLeft = visData.actionsLeft;
            this.actionIndicator.update(visData.actionsLeft);
        }
        
        if (visData.actionsShown !== undefined) {
            this.actionIndicator.visible = visData.actionsShown;
        }
    }

    /*
     * Animations
     */

    tick(timer: Ticker) {
        const dt = timer.deltaMS / 1000;

        if (this.animName !== UnitAnim.NONE && !this.animPaused) {
            this.animTime += dt;
        }

        if (this.animName !== UnitAnim.NONE) {
            this.animPropsDirty = true; // a bit hacky too
        }
        
        switch (this.animName) {
            case UnitAnim.ATTACK:
                this.continueAttackAnim();
                break;
            case UnitAnim.DEATH:
                this.continueDeathAnim();
                break;
            case UnitAnim.SPAWN:
                this.continueSpawnAnim();
                break;
        }

        if (!this.destroyed) {
            this.superAnimUpdate(dt)
        }
    }

    startAttackAnim(target: Point, pauseAfterPrep=false) {
        if (this.animName !== UnitAnim.NONE) {
            this.clearAnim();
        }

        this.animName = UnitAnim.ATTACK;

        this.attackAnim.phase = 0;
        this.attackAnim.target = target;
        const posToTarget = this.attackAnim.target.subtract(this.position);
        this.attackAnim.dir = posToTarget.normalize();
        this.attackAnim.dist = posToTarget.magnitude();
        this.attackAnim.prepTime = 0.375;
        this.attackAnim.rushTime = 0.15 + this.attackAnim.dist * 0.0001;
        this.attackAnim.goBackTime = 0.5 + this.attackAnim.dist * 0.0002;
        this.attackAnim.pauseAfterPhase0 = pauseAfterPrep;
        this.attackAnim.onPhase1Done = () => {
        };
        this.attackAnim.onPhase2Done = () => {
        };

        this.zIndex = 1;
    }
    
    startOrResumeAttackAnim(target: Point) {
        if (this.animName === UnitAnim.ATTACK) {
            this.animPaused = false;
            this.attackAnim.pauseAfterPhase0 = false;
        } else {
            this.startAttackAnim(target, false);
        }
    }

    private continueAttackAnim() {
        const prepDist = 50;
        const {prepTime, rushTime, dir, dist} = this.attackAnim;

        let t = this.animTime;

        if (this.attackAnim.phase === 0 && t > prepTime) {
            t = prepTime;
            this.attackAnim.phase = 1;
            
            if (this.attackAnim.pauseAfterPhase0) {
                this.animPaused = true;
                this.animTime = t;
            }
        }

        if (this.attackAnim.phase === 0) {
            function calcMagnitude(time: number) {
                const progress = time / prepTime;
                return -prepDist * easeExp(progress, -4.0)
            }

            const magnitude = calcMagnitude(t);
            this.animatableProps.rootPos = dir.multiplyScalar(magnitude);
        } else if (this.attackAnim.phase === 1) {
            t = t - prepTime;
            const calcMagnitude = (time: number) => {
                const progress = time / rushTime;
                // The radius of the (imaginary) circle hurtbox.
                // (multiply it by .8 so we penetrate it a bit)
                const offset = Math.min(this.border.height, this.border.width) * .8;

                const maxDist = dist - offset + prepDist;
                return -prepDist + maxDist * easeExp(progress, 3);
            }

            if (t > rushTime) {
                // animTime is untouched.
                t = rushTime;
                this.animPaused = true;
                this.attackAnim.onPhase1Done(this);
            }

            const magnitude = calcMagnitude(t);
            this.animatableProps.rootPos = dir.multiplyScalar(magnitude);
        } else if (this.attackAnim.phase === 2) {
            t = t - prepTime - rushTime;
            if (t > this.attackAnim.goBackTime) {
                this.clearAnim();
                this.becomeIdle();
                this.attackAnim.onPhase2Done(this);
            } else {
                const progress = t / this.attackAnim.goBackTime;
                this.animatableProps.rootPos = this.attackAnim.goBackOffset.multiplyScalar(
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

        const randRotMag = 0.05 + Math.random() * 0.05;
        const randSgn = Math.sign(Math.random() - 0.5);

        this.deathAnim.randRot = randRotMag * randSgn;
    }

    continueDeathAnim() {
        const {destroyDelay, maxTime, randRot} = this.deathAnim;
        if (this.animTime <= maxTime) {
            const offset = new Point(
                (Math.random() - 0.5) * 10,
                (Math.random() - 0.5) * 10
            );
            if (this.animTime > destroyDelay) {
                const dp = (this.animTime - destroyDelay) / (maxTime - destroyDelay);
                offset.y += lerp(0, 25, dp);

                this.animatableProps.rootRot = lerp(0, randRot, dp);
                this.animPropsDirty = true;
                this.root.alpha = lerp(1, 0, dp);
            }

            this.animatableProps.rootPos = offset;
        } else {
            this.clearAnim();
            this.destroy();
        }
    }

    startSpawnAnim() {
        if (this.animName !== UnitAnim.NONE) {
            this.clearAnim();
        }

        this.spawnAnim.onDone = () => {
        };
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
        this.animatableProps.rootPos.y = easeExpRev(entryProgress, -2) * this.height * 0.4;
        this.root.alpha = easeExp(entryProgress, -2);

        const attrSlideProgress = Math.min(1, (t - entryTime + attrSlideOffset) / attrSlideTime);

        const mid = 0.5;
        const w = this.healthAttr.width;
        const h = this.healthAttr.height;

        function attrX(progress: number) {
            if (progress < mid) {
                return (mid - progress) / mid * w * 0.3;
            } else {
                return 0;
            }
        }

        function attrY(progress: number) {
            if (progress < mid) {
                return h * 0.4;
            } else {
                return h * 0.4 * (1 - (progress - mid) / mid);
            }
        }

        const alphaMid = 0.6;

        function attrAlpha(progress: number) {
            return progress > alphaMid ? 1 : progress / alphaMid;
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
        this.animatableProps.rootPos = new Point(0, 0);
        this.animatableProps.rootRot = 0;
        this.animPropsDirty = true;
        this.zIndex = 0;
    }

    /*
     * Superimposed animations
     */

    superAnimMakeHurt() {
        return new StateAnimation<UnitAnimProps>({
            maxTime: 0.14,
            randomRot: 0.0,
            update(time: number, state: UnitAnimProps) {
                if (time === 0) {
                    const r = Math.random();
                    this.randomRot = Math.sign(0.5 - r) * (r * 0.05 + 0.125);
                }

                const flashD = 0.06
                state.flashTint = 0xffffff;
                state.flashVisible = true;
                state.flashAlpha = lerp(0.5, 0, Math.min(1, (time - flashD) / (this.maxTime - flashD)));

                state.flash2Visible = true;
                state.flash2Alpha = lerp(1, 0, (time) / (this.maxTime));

                const half = this.maxTime / 2;
                state.rootRot = lerp(0, this.randomRot, (half - Math.abs(time - half)) / half);
            }
        });
    }

    superAnimMakePlayable() {
        return new StateAnimation<UnitAnimProps>({
            maxTime: 0.25,
            applyOnEnd: true,
            update(time: number, state: UnitAnimProps) {
                state.borderWidth = lerp(3, 6, time / this.maxTime);
                state.borderTint = clerp(0x000000, ATK_COLOR, time / this.maxTime);
            }
        })
    }

    superAnimMakeTrigger() {
        const me = this;
        return new StateAnimation<UnitAnimProps>({
            maxTime: 0.35,
            neverEnd: true,
            update(time: number, state: UnitAnimProps, end: boolean, anim: StateAnimation<UnitAnimProps>) {
                const rev = anim.reverse ? -1 : 1;

                const p = time / this.maxTime;
                const p2 = easeExp(p, rev * -4);
                state.rootScale = lerp(1, 1.2, p2);
                state.borderWidth = lerp(3, 4, p2);
                state.borderTint = clerp(0x000000, 0xe4a900, Math.min(1, (time) / 0.08));

                if (end) {
                    me.queuedTriggerAnimDone = true;
                }
            }
        })
    }
    
    superAnimMakeImpact() {
        const def = {
            maxTime: 0.26,
            impactDir: new Point(0, 0), // normalized
            impactDist: 0,
            update(time: number, state: UnitAnimProps) {
                const p = Math.sin(time/this.maxTime * Math.PI);
                state.rootPos = state.rootPos.add(this.impactDir.multiplyScalar(p*this.impactDist));
            },
            config(dir: Point, dmg: number) {
                this.impactDir = dir;
                this.impactDist = Math.min(150, dmg*10);
            }
        }
        return new StateAnimation<UnitAnimProps, typeof def>(def)
    }

    superAnimRegister() {
        this.superimposedAnimator.register(this.superHurtAnim)
        this.superimposedAnimator.register(this.superPlayableAnim)
        this.superimposedAnimator.register(this.superTriggerAnim)
        this.superimposedAnimator.register(this.superImpactAnim)
        
        this.superimposedAnimator.cloner = (a: UnitAnimProps) => {
            const copy = structuredClone(a);
            copy.rootPos = a.rootPos.clone();
            return copy;
        }
    }

    superAnimUpdate(dt: number) {
        const newState = this.superimposedAnimator.apply(dt, this.animatableProps);

        if (this.superHadAnimated || newState !== this.animatableProps || this.animPropsDirty) {
            this.whiteFlash.visible = newState.flashVisible
            this.whiteFlash.tint = newState.flashTint
            this.whiteFlash.alpha = newState.flashAlpha
            this.redFlash.visible = newState.flash2Visible
            this.redFlash.alpha = newState.flash2Alpha
            this.root.position = newState.rootPos;
            this.root.rotation = newState.rootRot;
            this.root.scale.set(newState.rootScale);

            if (this.superHadAnimated
                || newState.borderWidth !== this.animatableProps.borderWidth
                || newState.borderTint !== this.animatableProps.borderTint) {
                this.renderBorder(newState.borderWidth, newState.borderTint)
                this.actionIndicator.updateTint(newState.borderTint)
            }
        }

        this.superHadAnimated = newState !== this.animatableProps
        this.animPropsDirty = false

        if (this.queuedTriggerAnimDone) {
            const f = this.onTriggerAnimDone;
            this.onTriggerAnimDone = null;
            this.queuedTriggerAnimDone = false
            if (f !== null) {
                f()
            }
        }
    }

    reactToHurt() {
        this.superHurtAnim.start()
    }

    reactToHeal() {
        this.glossyRect.show(0x5fd312)
    }

    /*
     * Miscellaneous visual stuff
     */

    renderBorder(width: number, tint: number) {
        this.border.clear()
            .rect(0, 0, this.artwork.width, this.artwork.height)
            .stroke({width, color: 0xffffff, alignment: 1});
        this.border.tint = tint;
    }

    glossTrigger() {
        this.glossyRect.show(0xffd527);
    }

    glossAlteration(positive: boolean) {
        this.glossyRect.show(positive ? 0x0C3CC6 : 0xDF3636, !positive);
    }

    /*
     * Pointer events
     */

    onUnitPointerDown(e: FederatedPointerEvent) {
        if (this.state === UnitState.IDLE && this.playable && !this.pointerTracker.running) {
            this.pointerTracker.start(e);
        }
    }

    onUnitPointerTap() {
        if (!this.playable) {
            this.scene.cardPreviewOverlay.show(this.visData.associatedCardData, true)
        }
    }

    onTrackedPointerStart(pos: Point) {
        this.selectStart = pos;
    }

    onTrackedPointerMove(pos: Point) {
        this.selectPos = pos;
        if (this.state === UnitState.IDLE) {
            if (pos.subtract(this.selectStart).magnitude() > SELECT_DIST_THRESH) {
                this.becomeSelected(pos);
            }
        } else if (this.state === UnitState.SELECTED) {
            this.scene.targetSelect.update(pos);
        }
    }

    onTrackedPointerQuit() {
        this.selectStart = new Point(0, 0);
        if (this.state === UnitState.SELECTED) {
            const result = this.scene.entitySelectOverlay.findSelectedEntity(this.scene.targetSelect.targetPos);
            if (result !== null &&
                this.scene.interaction.canSubmit(InteractionType.ATTACKING_UNIT, {targetId: result[0]})) {
                this.scene.interaction.submit(InteractionType.ATTACKING_UNIT, {targetId: result[0]})
                
                const entity = this.scene.findEntity(result[0])!;
                this.startPreAttacking(entity.position);
            } else {
                this.becomeIdle();
            }
        } else if (this.state === UnitState.IDLE) {
            this.scene.cardPreviewOverlay.show(this.visData.associatedCardData, true)
        }
    }

    /*
     * Interaction & playable events
     */

    onInteractionStop(type: InteractionType, data: InteractionData, id: number, cancel: boolean) {
        if (this.interactionId === id) {
            // assuming type == ATTACKING_UNIT
            this.interactionId = -1;
            // If the interaction has been cancelled, then we must be in either the SELECTED or PRE_ATTACKING state.
            // Either way, we need to revert. In case of the PRE_ATTACKING state, becomeIdle will cancel the
            // animation
            if (cancel) {
                this.becomeIdle();
            }
        }
    }

    onInteractionCanStartUpdate(canStart: boolean) {
        this.updatePlayableState(canStart);
    }

    onVisuallyPlayableUpdate(value: boolean) {
        //this.border.tint = value ? ATK_COLOR : 0x000000;
        this.superPlayableAnim.start(!value);
    }

    onPlayableUpdate(value: boolean) {
        if (value) {
            this.pulseRect.startPeriodic()
        } else {
            this.pointerTracker.stop(true);
            if (this.state === UnitState.SELECTED) {
                this.becomeIdle();
            }
            this.pulseRect.endPeriodic()
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
            this.scene.targetSelect.show(this.position, target);
            this.scene.entitySelectOverlay.show(this.propositions.allowedEntities)

            this.pulseRect.endPeriodic();
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
        this.scene.targetSelect.hide();
        this.scene.entitySelectOverlay.hide();

        if (this.playable) {
            this.pulseRect.startPeriodic();
        }
    }

    becomeIdle() {
        if (this.state === UnitState.SELECTED) {
            this.exitSelected();
        }
        if (this.state === UnitState.PRE_ATTACKING) {
            if (this.animName === UnitAnim.ATTACK) {
                this.clearAnim()
            }
        }

        if (this.state !== UnitState.IDLE) {
            this.state = UnitState.IDLE;
        }
    }

    startPreAttacking(target: Point) {
        if (this.state === UnitState.SELECTED) {
            this.exitSelected(false);
            this.state = UnitState.PRE_ATTACKING;
            this.startAttackAnim(target, true)
        }
    }

    beginAttacking(target: Point) {
        if (this.state === UnitState.IDLE || this.state === UnitState.PRE_ATTACKING) {
            this.state = UnitState.ATTACKING;
            this.startOrResumeAttackAnim(target);
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
    fontSize: 48, // will be scaled down accordingly
    fill: 0xffffff
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
    attrState: AttrState;
    backgroundBounds: Rectangle

    changeIndicator: AttrChangeIndicator

    constructor(public scene: GameScene, width: number,
                public cornerLeft: boolean,
                public type: UnitAttrType) {
        super();

        this.value = -1;
        this.attrState = AttrState.NEUTRAL;

        this.backdrop = this.makeBackground(width)
        this.backdrop.y += this.backdrop.height * 0.12;
        if (type === UnitAttrType.HEALTH) {
            this.backdrop.tint = 0xb60000;
        } else if (type === UnitAttrType.ATTACK) {
            this.backdrop.tint = ATK_COLOR;
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

        this.changeIndicator = new AttrChangeIndicator(scene, width, this.cornerLeft, this.backdrop.tint);
        this.changeIndicator.x = this.cornerLeft ? 10 : width - 10;
        this.changeIndicator.y = -this.boundsArea.height * 0.1;
        this.addChild(this.changeIndicator);
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
        this.text.tint = attrTextColor(this.attrState);
        this.text.height = this.background.height - ATTR_MARGIN;
        this.text.scale.x = this.text.scale.y;
        placeInRectCenter(this.text, this.backgroundBounds)
    }
}

type UAIAnimProps = typeof UnitActionIndicator.prototype.animProps;

export class UnitActionIndicator extends Container {
    root: Container;
    background: Graphics;
    text: BitmapText;
    wait: Graphics
    
    actions: number; // < 0 --> waiting
    
    animProps = {
        scale: 1.0
    }
    animator = new StateAnimPlayer<UAIAnimProps>()
    changeAnim: ReturnType<typeof this.makeChangeAnim>

    constructor(public scene: GameScene, width: number, height: number, actions: number) {
        super();

        this.actions = actions;
        this.root = new Container()
        this.addChild(this.root);
        
        this.boundsArea = new Rectangle(0, 0, width, height);
        
        this.background = new Graphics()
            .rect(0, 0, width, height)
            .fill({ color: 0xffffff })
        this.background.tint = 0x000000;
        this.root.addChild(this.background);
        
        this.wait = new Graphics(this.scene.game.assets.base.waitIcon);
        this.wait.tint = 0xffffff;
        placeInRectCenter(this.wait, this.boundsArea.clone().pad(-3, -3), true);
        this.root.addChild(this.wait);
        
        this.text = new BitmapText({
            style: ATTR_TEXT_STYLE
        });
        this.text.tint = 0xffffff;
        this.root.addChild(this.text);
        
        this.root.pivot.set(width / 2, height / 2);
        
        this.changeAnim = this.makeChangeAnim();
        this.animator.register(this.changeAnim);
        
        this.update(actions);
        
        this.scene.game.app.ticker.add(this.tick, this);
        this.on("destroyed", () => {
            this.scene.game.app.ticker.remove(this.tick, this);
        });
    }
    
    tick(t: Ticker) {
        const props = this.animator.apply(t.deltaMS/1000, this.animProps);
        this.root.scale = props.scale;
    }
    
    update(actions: number) {
        this.actions = actions;
        if (this.actions < 0) {
            this.wait.visible = true;
            this.text.visible = false;
        } else {
            this.wait.visible = false;
            this.text.visible = true;
            
            this.text.text = this.actions.toString();
            placeInRectCenter(this.text, this.boundsArea, true);

            this.text.alpha = this.actions > 0 ? 1.0 : 0.6;
        }
        
    }
    
    updateTint(tint: number) {
        this.background.tint = tint;
    }
    
    makeChangeAnim() {
        return new StateAnimation<UAIAnimProps>({
            maxTime: 0.3,
            update(time: number, state: UAIAnimProps) {
                state.scale = 1.0 + 0.25*Math.sin(time / this.maxTime * Math.PI);
            }
        })
    }
}