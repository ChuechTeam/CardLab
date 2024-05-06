import {
    AbstractText,
    BitmapText,
    Container,
    FederatedPointerEvent,
    Graphics,
    Point,
    Rectangle,
    Sprite,
    Text,
    TextStyle,
    Texture,
    Ticker
} from "pixi.js";
import {GAME_WIDTH, GameScene} from "./GameScene.ts";
import {DuelGame} from "../duel.ts";
import {duelLog, duelLogDebug, duelLogError} from "../log.ts";
import {clerp, damper, easeExp, lerp, placeInRectCenter} from "../util.ts";
import type {Hand} from "src/duel/game/Hand.ts";
import {InteractionData, InteractionState, InteractionType} from "src/duel/game/InteractionModule.ts";
import {LocalDuelCardPropositions} from "src/duel/control/state.ts";
import {SpellAction} from "src/duel/game/SpellUseOverlay.ts";
import {AttrState, attrStateCompare, attrTextColor} from "src/duel/game/AttrState.ts";

// Game height: 1440
// Canonical card size: 100x140 (wxh), used in illustrator

const HEIGHT = 1440 * 0.3;
const WIDTH = HEIGHT / 1.392;

const SELECTED_Z_INDEX = 1000;
const SELECTED_Y_OFFSET = 10;

const DRAG_ANGLE_MIN = Math.PI / 2 - Math.PI / 4;
const DRAG_ANGLE_MAX = Math.PI / 2 + Math.PI / 4;
const DRAG_DIST_THRESH = 125; // World units

const PLAY_ANIM_TIME = 0.3;
const LAY_ANIM_TIME = 0.2;
const DISCARD_ANIM_TIME = 0.5;
const ALTERATION_ANIM_TIME = 1.5;

const NAME_RECT = new Rectangle(cx(3), 0, cx(73), cy(16.5));
const COST_RECT = new Rectangle(cx(76), cy(0.5), cx(24), cy(16));

const ATTR_TEXT_STYLE = new TextStyle({
    fill: 0xFFFFFF,
    fontFamily: "ChakraPetchDigits",
    fontSize: 38
});

const COST_TEXT_STYLE = ATTR_TEXT_STYLE;

const NAME_STYLE_DEFAULT = new TextStyle({
    fill: 0x000000,
    fontFamily: "Chakra Petch",
    fontSize: 24
});

const ARCHETYPE_TEXT_STYLE = new TextStyle({
    fill: 0x000000,
    fontFamily: "Chakra Petch",
    fontSize: 18
});

// Canonical coordinates -> local coordinates
function cx(x: number) {
    return x * WIDTH / 100;
}

function cy(y: number) {
    return y * HEIGHT / 140;
}

type AttribComponents = {
    cont: Container,
    bg: Sprite,
    text: AbstractText
    textBounds: Rectangle
}

type FaceDownVisuals = {
    type: "faceDown",
    data: {},
    components: {}
}

type UnitVisuals = {
    type: "unit"
    data: {
        name: string
        author: string | null,
        archetype: string | null
        cost: number
        costState: AttrState,
        attack: number
        attackState: AttrState,
        health: number
        healthState: AttrState,
        description: string
        image: Texture
    }
    components: {
        name: Text,
        cost: AbstractText,
        description: Text,
        archetype: Text | null,
        image: Sprite,
        attack: AttribComponents
        health: AttribComponents
    }
}

type SpellVisuals = {
    type: "spell"
    data: {
        name: string
        author: string | null
        cost: number
        costState: AttrState,
        description: string
        image: Texture
    }
    components: {
        name: Text,
        cost: AbstractText,
        description: Text,
        image: Sprite,
        spellCorner: Sprite
    }
}

type CardVisuals =
    | FaceDownVisuals
    | UnitVisuals
    | SpellVisuals
type CardVisualsOf<T extends CardVisuals["type"]> = Extract<CardVisuals, { type: T }>

export type CardVisualData =
    | { type: "faceDown" } & FaceDownVisuals["data"]
    | { type: "unit" } & UnitVisuals["data"]
    | { type: "spell" } & SpellVisuals["data"]
export type CardVisualDataOf<T extends CardVisualData["type"]> = Extract<CardVisualData, { type: T }>

// Card state (which is just all the states of the state machine)

type IdleCardState = { name: "idle" }
type HandCardState = {
    name: "hand";
    zIndex: number
    handPos: Point // will also be used to introduce animation later
    hand: Hand // well, the hand...
    flipped: boolean
    subState: "idle" | "hovered" | "dragged" | "targeting"
}
type PlayingCardState = {
    name: "playing"
    scaleStart: number,
    destroyOnEnd: boolean
};
type LayingCardState = {
    name: "laying"
    scaleStart: number,
    scaleEnd: number,
    autoDestroyTime: number,
}

type CardState =
    | IdleCardState
    | HandCardState
    | PlayingCardState
    | LayingCardState

enum PostDragMode {
    SPAWN_UNIT,
    USE_TARGETLESS_SPELL
}

export enum CardControlMode {
    NONE,
    MY_HAND,
    ADV_HAND
}

enum CardAnim {
    NONE,
    PLAY,
    LAY,
    DISCARD,
    ALTERATION
}

// Note: Spell with single_slot requirement is not yet supported!
export class Card extends Container {
    game: DuelGame

    // All the visual components of the card, including the card data (name, attributes...)
    visual: CardVisuals;
    bg: Sprite;
    root: Container; // used for animation offsets
    pendingVisualData: CardVisualData | null = null

    // The state of the card
    state: CardState = {name: "idle"}

    // Pointer tracking stuff: used for dragging the card and keeping track of pointer events 
    // (card released for instance)
    pointerTracking: boolean = false
    ptId: number = -1; // Identifier of the pointer
    ptStopOnLeave: boolean = false

    dragStart = new Point(0, 0) // Reference point for finding drag angle
    dragPoint = new Point(0, 0) // Pointer location
    dragOffset = new Point(0, 0) // Offset from origin while dragging
    dragMode = PostDragMode.SPAWN_UNIT // What to do after dragging (for cards with no parameters)

    posSmoothGoal = new Point(0, 0) // Goal position for moving smoothly
    posSmoothHL = 0.08 // Half-life of damper
    posSmoothEnabled = false // Whether we're moving smoothly 

    // Same thing but with scale
    scaleSmoothGoal = 0.0 // uniform
    scaleSmoothHL = 0.08
    scaleSmoothEnabled = false

    prevHand: Hand | null = null
    prevHandIdx: number | null = null

    interactionId: number = -1
    controlMode: CardControlMode // True if the player can control the card (if it's in their hand)
    propositions: LocalDuelCardPropositions | null = null // Propositions given by the server
    playable: boolean | null = null // True if this card can be dragged to be played, null if indeterminated

    discardAnim = {pointUp: true}
    alterationAnim = {pointUp: true, positive: true, startTint: 0}
    animName = CardAnim.NONE
    animTime = 0.0

    hoverHitRect: Rectangle;
    preDragHitRect: Rectangle;

    bounds: Rectangle

    id: number = -1

    static dataFromCardRef(ref: CardAssetRef, game: DuelGame, testDesc: boolean = false): CardVisualData {
        const cardAsset = game.registry.findCard(ref)!;
        const imgAsset = game.assets.getCardTextureOrFallback(ref)!;
        const def = cardAsset.definition
        let desc = def.description;
        if (testDesc) {
            desc += "\n Paragraphe 1 Paragraphe 1 Paragraphe 1 Paragraphe 1 Paragraphe 1 Paragraphe 1" +
                "\nParagraphe 2 Paragraphe 2 Paragraphe 2 Paragraphe 2 Paragraphe 2 Paragraphe 2" +
                "\nParagraphe 3 Paragraphe 3 Paragraphe 3 Paragraphe 3 Paragraphe 3 Paragraphe 3";
        }
        return {
            type: "unit",
            name: def.name,
            cost: def.cost,
            author: def.author,
            archetype: def.archetype,
            costState: AttrState.NEUTRAL,
            attack: def.attack,
            attackState: AttrState.NEUTRAL,
            health: def.health,
            healthState: AttrState.NEUTRAL,
            description: desc,
            image: imgAsset
        }
    }

    constructor(public scene: GameScene, visData: CardVisualData, controlMode: CardControlMode) {
        super();

        const ts = performance.now();

        this.game = scene.game

        this.root = new Container();
        this.addChild(this.root);

        this.bg = new Sprite();
        this.root.addChild(this.bg);

        // Make sure the card's pivot is at the center for easy positioning
        this.pivot = new Point(WIDTH / 2, HEIGHT / 2);
        this.bounds = new Rectangle(0, 0, WIDTH, HEIGHT);
        this.boundsArea = this.bounds;

        this.hoverHitRect = this.bounds.clone().pad(0, SELECTED_Y_OFFSET + DRAG_DIST_THRESH);
        this.preDragHitRect = this.hoverHitRect.clone().pad(DRAG_DIST_THRESH, 0)

        this.controlMode = controlMode;

        this.eventMode = "static"
        this.hitArea = this.bounds;

        this.on("pointerdown", this.cardPointerDown)
        this.on("pointermove", this.cardPointerMove)
        this.on("pointertap", this.cardPointerTap, this)

        this.visual = this.replaceVisuals(visData);

        this.on("added", () => this.game.app.ticker.add(this.tick, this))
        this.on("destroyed", () => {
            this.game.app.ticker.remove(this.tick, this);
            this.switchToIdle();
            if (this.scene.laidDownCard === this) {
                this.scene.laidDownCard = null;
            }
        })

        this.listen(this.scene.interaction, "canStartUpdate", this.onInteractionCanStartUpdate);

        const te = performance.now();

        duelLogDebug("Card created in " + (te - ts).toFixed(2) + "ms");
    }

    /*
     * Various event handlers (tick, pointer)
     */

    tick(t: Ticker) {
        if (this.state.name === "hand" && this.state.subState === "dragged") {
            // those are framerate-dependant just to get the job done, it's not high priority rn
            this.dragOffset = this.dragOffset.multiplyScalar(0.75);
            this.scale = 0.8 * this.scale.x + 0.2 * 0.4;
            this.position = this.dragPoint.subtract(this.dragOffset);
        } else if (this.state.name === "hand" && this.state.subState === "targeting"
            && this.posSmoothEnabled) {
            this.scene.targetSelect.updateStart(this.position);
        }

        if (this.animName !== CardAnim.NONE) {
            this.animTime += t.deltaMS / 1000;

            if (this.animName === CardAnim.PLAY) {
                this.continuePlayAnim()
            } else if (this.animName === CardAnim.LAY) {
                this.continueLayAnim()
            } else if (this.animName === CardAnim.DISCARD) {
                this.continueDiscardAnim()
            } else if (this.animName === CardAnim.ALTERATION) {
                this.continueAlterationAnim()
            }
        }

        function damp(from: number, to: number, hl: number) {
            return damper(from, to, hl, t.deltaMS / 1000);
        }

        if (!this.destroyed && this.posSmoothEnabled) {
            const hl = this.posSmoothHL

            this.position = new Point(
                damp(this.position.x, this.posSmoothGoal.x, hl),
                damp(this.position.y, this.posSmoothGoal.y, hl)
            )

            if (this.position.subtract(this.posSmoothGoal).magnitudeSquared() < 0.2) {
                this.position = this.posSmoothGoal;
                this.posSmoothEnabled = false;
            }
        }

        if (!this.destroyed && this.scaleSmoothEnabled) {
            const hl = this.scaleSmoothHL

            this.scale.set(damp(this.scale.x, this.scaleSmoothGoal, hl))
            if (Math.abs(this.scale.x - this.scaleSmoothGoal) < 0.005) {
                this.scale = this.scaleSmoothGoal;
                this.scaleSmoothEnabled = false;
            }
        }
    }

    cardPointerDown = (e: FederatedPointerEvent) => {
        if (this.controlMode === CardControlMode.MY_HAND
            && this.state.name === "hand"
            && this.state.subState === "idle"
            && this.scene.interaction.hoveringHandId === -1
            && this.scene.interaction.type !== InteractionType.DRAGGING_CARD) {
            this.handSwitchHover(e);
        }
    }

    cardPointerMove = (e: FederatedPointerEvent) => {
        // Make sure the mouse is clicked (left or right) OR that we're in a touch screen
        if (this.controlMode === CardControlMode.MY_HAND
            && (e.buttons & (1 | 2)) !== 0
            && this.state.name === "hand"
            && this.state.subState === "idle"
            && this.scene.interaction.hoveringHandId === e.pointerId
            && this.scene.interaction.type !== InteractionType.DRAGGING_CARD) {
            this.handSwitchHover(e);
        }
    }

    cardPointerTap() {
        if (this.controlMode === CardControlMode.ADV_HAND
            && this.state.name === "hand"
            && this.state.subState === "idle") {
            this.scene.cardPreviewOverlay.show({type: this.visual.type, ...this.visual.data} as any, true);
        }
    }

    ptStarted(worldPos: Point) {
        if (this.state.name === "hand" && this.state.subState === "hovered"
            && this.playable === true) {
            this.dragStart = worldPos;
        }
    }

    ptMoved(worldPos: Point) {
        if (this.state.name === "hand" && this.state.subState === "hovered") {
            if (this.playable === true) {
                const posRel = worldPos.subtract(this.dragStart)
                // This coordinate system is fairly stupid so we got to reverse y
                // to get a real trigonometric circle
                const angle = Math.atan2(-posRel.y, posRel.x);

                if (angle > DRAG_ANGLE_MIN && angle < DRAG_ANGLE_MAX) {
                    if (posRel.magnitude() > DRAG_DIST_THRESH) {
                        if (this.propositions?.requirement === "singleEntity") {
                            this.handSwitchTarget(worldPos);
                        } else {
                            this.handSwitchDrag(worldPos);
                        }
                    } else {
                        this.hitArea = this.preDragHitRect;
                    }
                } else {
                    this.dragStart = worldPos;
                    this.hitArea = this.hoverHitRect;
                }
            } else {
                this.dragStart = worldPos;
            }
        } else if (this.state.name === "hand" && this.state.subState === "dragged") {
            this.dragPoint = worldPos;
            if (this.dragMode === PostDragMode.USE_TARGETLESS_SPELL) {
                this.scene.spellUseOverlay.updateSelectedPos(worldPos);
            }
        } else if (this.state.name === "hand" && this.state.subState === "targeting") {
            this.targetingUpdate(worldPos);
        }
    }

    ptStopped(pointerUp: boolean, cancel = false) {
        if (cancel) {
            // Already switching to idle
            return;
        }

        const layOpt = {
            autoDestroyTime: 1000,
            scale: 0.55,
            hl: this.dragMode === PostDragMode.USE_TARGETLESS_SPELL ? 0.06 : 0.10
        };

        if (this.state.name === "hand" && this.state.subState === "hovered") {
            this.handSwitchIdle(!pointerUp)
        } else if (this.state.name === "hand"
            && (this.state.subState === "dragged" || this.state.subState === "targeting")) {
            // check if we can submit anything
            if (this.state.subState === "dragged"
                && this.dragMode == PostDragMode.USE_TARGETLESS_SPELL
                && this.scene.spellUseOverlay.chosenAction === SpellAction.CANCEL) {
                this.handSwitchIdle(false);
            } else if (this.trySubmitInteraction()) {
                if (this.state.subState === "dragged" && this.dragMode === PostDragMode.SPAWN_UNIT) {
                    this.switchToPlaying();
                } else {
                    this.switchToLaying(this.spellLayDownPos(false), layOpt);
                }
            } else {
                this.handSwitchIdle(false)
            }
        }
    }

    startPointerTracking(e: FederatedPointerEvent, stopOnLeave: boolean) {
        if (this.pointerTracking) {
            return
        }

        this.pointerTracking = true;
        this.ptId = e.pointerId;
        this.ptStopOnLeave = stopOnLeave;

        const stage = this.game.app.stage
        stage.on("pointermove", this.ptHandleStageMove)
        stage.on("pointerup", this.ptHandleStageUp)
        stage.on("pointerupoutside", this.ptHandleStageUp)
        if (stopOnLeave) {
            this.on("pointerleave", this.ptHandleCardLeave)
        }

        this.ptStarted(this.scene.viewport.toWorld(e.global))
    }

    ptHandleStageUp = (e: FederatedPointerEvent) => {
        if (e.pointerId === this.ptId) {
            this.stopPointerTracking(true);
        }
    }

    ptHandleCardLeave = (e: FederatedPointerEvent) => {
        if (e.pointerId === this.ptId && this.ptStopOnLeave) {
            this.stopPointerTracking(false);
        }
    }

    ptHandleStageMove = (e: FederatedPointerEvent) => {
        if (e.pointerId === this.ptId) {
            this.ptMoved(this.scene.viewport.toWorld(e.global));
        }
    }

    stopPointerTracking(pointerUp: boolean, cancel = false) {
        if (!this.pointerTracking) {
            return
        }

        this.pointerTracking = false;
        this.ptId = -1;

        const stage = this.game.app.stage
        stage.off("pointermove", this.ptHandleStageMove)
        stage.off("pointerup", this.ptHandleStageUp)
        stage.off("pointerupoutside", this.ptHandleStageUp)
        if (this.ptStopOnLeave) {
            this.off("pointerleave", this.ptHandleCardLeave)
        }

        this.ptStopped(pointerUp, cancel)
    }

    onInteractionStop(type: InteractionType, data: InteractionData, id: number, cancel: boolean) {
        this.scene.interaction.off("stop", this.onInteractionStop, this);

        if (cancel && id === this.interactionId) {
            if ((this.state.name === "playing" || this.state.name === "laying")) {
                // Revert what we did.
                if (this.prevHand === null) {
                    duelLogError("Previous hand is null while trying to revert interaction!");
                    return;
                }
                this.prevHand.addCard(this, false, this.prevHandIdx!)
                this.prevHand.repositionCards(true)
                this.updatePlayableState();
            } else {
                this.handSwitchIdle(false);
            }
        }
        this.prevHand = null;
    }

    onInteractionCanStartUpdate() {
        this.updatePlayableState();
    }

    /*
     * Client/Server things
     */

    updateControlMode(mode: CardControlMode) {
        this.controlMode = mode;
        this.updatePlayableState(true);
        this.updateTint();
    }

    updatePropositions(props: LocalDuelCardPropositions | null | undefined) {
        this.propositions = props ?? null;

        if (this.controlMode !== CardControlMode.MY_HAND && props) {
            // then it is in my hand.
            this.updateControlMode(CardControlMode.MY_HAND);
        } else {
            this.updatePlayableState();
        }
    }

    updatePlayableState(skipTintUpdate = false) {
        const prevPlayable = this.playable;
        this.playable = this.propositions !== null
            && this.controlMode === CardControlMode.MY_HAND
            && !this.scene.interaction.blocked
            && (this.scene.interaction.state === InteractionState.IDLE || this.scene.interaction.id === this.interactionId);

        if (!skipTintUpdate && prevPlayable !== this.playable) {
            this.updateTint();
        }
    }

    updateTint(white?: boolean) {
        if (white === undefined) {
            white = (this.playable || this.state.name === "laying" || this.controlMode != CardControlMode.MY_HAND);
        }

        const tint = white ? "#ffffff" : "#999999";
        this.tint = tint;
        // Darken the components
        // for (const comp of this.children) {
        //     // Little hack so we don't get odd visuals for dark elements.
        //     if (comp.label === "attr") {
        //         comp.children.filter(x => x instanceof AbstractText).forEach(x => x.tint = tint);
        //         continue;
        //     }
        //     comp.tint = tint;
        // }
    }

    trySubmitInteraction(): boolean {
        if (this.propositions !== null) {
            if (this.propositions.requirement === "singleSlot") {
                for (const grid of this.scene.unitSlotGrids) {
                    if (grid.selectedSlot !== null) {
                        this.scene.interaction.submit(InteractionType.DRAGGING_CARD, {
                            slots: [grid.selectedSlot.gamePos],
                            entities: []
                        });
                        return true;
                    }
                }
            } else if (this.propositions.requirement === "singleEntity") {
                const target = this.scene.entitySelectOverlay.findSelectedEntity(this.scene.targetSelect.targetPos);
                if (target !== null) {
                    this.scene.interaction.submit(InteractionType.DRAGGING_CARD, {
                        slots: [],
                        entities: [target[0]]
                    });
                    return true;
                }
            } else if (this.propositions.requirement === "none") {
                this.scene.interaction.submit(InteractionType.DRAGGING_CARD, {
                    slots: [],
                    entities: []
                });
                return true;
            }
        }

        return false;
    }

    /*
     * Animations
     */

    startPlayAnim() {
        this.clearAnim();

        this.animName = CardAnim.PLAY;
        this.animTime = 0.0;
    }

    continuePlayAnim() {
        const t = Math.min(PLAY_ANIM_TIME, this.animTime);

        const s = this.state;
        if (s.name !== "playing") {
            duelLogError("Play animation triggered while not in play state!")
            this.clearAnim();
            return;
        }

        if (t >= PLAY_ANIM_TIME && s.destroyOnEnd) {
            this.destroy();
            return;
        }

        this.scale = lerp(s.scaleStart, 1.3, t / PLAY_ANIM_TIME);
        this.alpha = lerp(1, 0, t / PLAY_ANIM_TIME);
    }

    startLayAnim() {
        this.clearAnim();

        this.animName = CardAnim.LAY;
        this.animTime = 0.0;
    }

    continueLayAnim() {
        const s = this.state
        if (s.name !== "laying") {
            duelLogError("Play animation triggered while not in play state!")
            this.clearAnim();
            return;
        }

        const capped = Math.min(LAY_ANIM_TIME, this.animTime);

        this.scale = lerp(s.scaleStart, s.scaleEnd, capped / LAY_ANIM_TIME);
        if (this.pendingVisualData !== null && capped >= LAY_ANIM_TIME / 2) {
            this.replaceVisuals(this.pendingVisualData)
            this.pendingVisualData = null;
        }

        if (this.animTime >= s.autoDestroyTime) {
            this.startDiscardAnim(true, true);
        }
    }

    startDiscardAnim(pointUp = true, keepScale = false) {
        const scale = this.scale.x;
        this.clearAnim();
        if (keepScale) {
            this.scale.set(scale)
        }

        this.switchToIdle();
        this.scene.unregisterCardEarly(this);
        this.discardAnim.pointUp = pointUp;
        this.animName = CardAnim.DISCARD;
        this.animTime = 0.0;
    }

    continueDiscardAnim() {
        if (this.animTime >= DISCARD_ANIM_TIME) {
            this.destroy();
            return;
        }

        const p = this.animTime / DISCARD_ANIM_TIME;
        this.root.position.y = (this.discardAnim.pointUp ? -1 : 1) * lerp(0, HEIGHT * 0.4, p);
        this.alpha = lerp(1, 0, p);
    }

    startAlterationAnim(positive: boolean, pointUp: boolean) {
        this.clearAnim();

        duelLog(`Starting alteration anim (positive=${positive}, pointUp=${pointUp})`);
        this.alterationAnim.pointUp = pointUp;
        this.alterationAnim.positive = positive;
        this.alterationAnim.startTint = this.tint;
        this.animName = CardAnim.ALTERATION;
        this.animTime = 0.0;
    }

    continueAlterationAnim() {
        if (this.animTime >= ALTERATION_ANIM_TIME) {
            this.clearAnim();
            return;
        }

        const p = this.animTime / ALTERATION_ANIM_TIME;
        const pPingPong = easeExp(Math.sin(p * Math.PI), p < 0.5 ? -3.4 : -1);
        const pointUp = this.alterationAnim.pointUp;
        // The y coordinate is reversed since the card is rotated 180 degrees.
        this.root.position.y = -lerp(0, pointUp ? 450 : 90, pPingPong);

        const col = this.alterationAnim.positive ? 0xaaaaFF : 0xFFaaaa;
        this.tint = clerp(this.alterationAnim.startTint, col, pPingPong);
    }

    clearAnim() {
        if (this.animName === CardAnim.PLAY) {
            this.scale = 1.0;
            this.alpha = 1.0;
        } else if (this.animName === CardAnim.LAY) {
            this.scale = 1.0;
        } else if (this.animName === CardAnim.DISCARD) {
            this.alpha = 1.0;
            this.root.position.set(0.0, 0.0);
        } else if (this.animName === CardAnim.ALTERATION) {
            this.root.position.set(0.0, 0.0);
            this.updateTint();
        }

        this.animName = CardAnim.NONE;
        this.animTime = 0.0;
    }

    queueDestroy() {
        if (this.state.name === "playing") {
            if (this.animTime >= PLAY_ANIM_TIME) {
                this.destroy();
            } else if (!this.state.destroyOnEnd) {
                this.state.destroyOnEnd = true;
                this.scene.unregisterCardEarly(this);
            }
        } else {
            this.destroy();
        }
    }

    moveSmooth(dest: Point, hl: number) {
        this.posSmoothEnabled = true
        this.posSmoothHL = hl
        this.posSmoothGoal = dest
    }

    scaleSmooth(scale: number, hl: number) {
        this.scaleSmoothEnabled = true
        this.scaleSmoothHL = hl
        this.scaleSmoothGoal = scale
    }

    /*
     * Hover & Targeting
     */

    private spellLayDownPos(targeting: boolean) {
        if (targeting) {
            return new Point(GAME_WIDTH / 2, this.scene.myCore.y - 15)
        } else {
            return new Point(GAME_WIDTH / 2, this.scene.myCore.y - 33)
        }
    }

    private targetingStart(pos: Point) {
        this.moveSmooth(this.spellLayDownPos(true), 0.10);
        this.scaleSmooth(0.65, 0.08);
        this.scene.entitySelectOverlay.show(this.propositions!.allowedEntities);
        this.scene.targetSelect.show(this.position, pos);
    }

    private targetingUpdate(cursor: Point) {
        this.scene.targetSelect.update(cursor);
    }

    private targetingStop(willLay: boolean) {
        this.posSmoothEnabled = false;
        this.scaleSmoothEnabled = false;
        // Keep the scale the same if we're going to lay down the card.
        if (!willLay) {
            this.scale = 1.0;
        }
        this.scene.targetSelect.hide();
        this.scene.entitySelectOverlay.hide();
    }

    private playingStop() {
        this.clearAnim();
    }

    private layingStop() {
        this.clearAnim();
        this.scale = 1.0;
        this.posSmoothEnabled = false;
        this.scaleSmoothEnabled = false;
        if (this.scene.laidDownCard === this) {
            this.scene.laidDownCard = null;
        }
    }

    cancelHover() {
        if (this.state.name === "hand" && this.state.subState === "hovered") {
            this.handSwitchIdle(false);
        }
    }

    /*
     * State management
     */

    // Allowed states: Idle, Laying, Playing, Hand
    moveToHand(pos: Point, zIndex: number, flipped: boolean, hand: Hand, instant = false) {
        if (this.state.name === "hand") {
            // Already in hand. 
            // todo: what do if hovering? 
            this.state.zIndex = zIndex;
            this.state.handPos = pos;
            this.state.flipped = flipped;
        } else {
            if (this.state.name === "laying") {
                this.layingStop()
            } else if (this.state.name === "playing") {
                this.playingStop();
            }

            // Switch state
            this.state = {
                name: "hand",
                zIndex,
                handPos: pos,
                flipped,
                hand,
                subState: "idle"
            };
        }
        if (instant) {
            this.posSmoothEnabled = false;
            this.position.set(pos.x, pos.y);
        } else {
            this.moveSmooth(pos, 0.10);
        }
        this.zIndex = zIndex;
        if (flipped) {
            this.rotation = Math.PI;
        } else {
            this.rotation = 0;
        }
    }

    switchToIdle() {
        if (this.state.name === "hand") {
            this.stopAllInteractions(false)
            this.handExit();
        }
        this.state = {name: "idle"};
    }

    switchToPlaying() {
        if (this.state.name !== "hand" || this.state.subState !== "dragged") {
            return;
        }

        this.prevHand = this.state.hand;
        this.prevHandIdx = this.state.hand.cards.indexOf(this);
        this.handExit();
        this.state = {
            name: "playing",
            scaleStart: this.scale.x,
            destroyOnEnd: false
        };

        this.startPlayAnim();
    }

    switchToLaying(targetPos: Point, {autoDestroyTime, scale, hl}: { [x: string]: number }) {
        if (this.state.name === "hand") {
            if (this.state.subState === "targeting") {
                this.targetingStop(true);
            } else if (this.state.subState === "dragged" && this.dragMode === PostDragMode.USE_TARGETLESS_SPELL) {
                this.scene.spellUseOverlay.hide();
            }

            this.prevHand = this.state.hand;
            this.prevHandIdx = this.state.hand.cards.indexOf(this);
            this.handExit();
        }

        if (this.scene.laidDownCard !== null) {
            this.scene.laidDownCard.destroy();
            this.scene.laidDownCard = null;
        }

        this.state = {
            name: "laying",
            scaleStart: this.scale.x,
            scaleEnd: scale,
            autoDestroyTime: autoDestroyTime * 1000
        };

        this.scene.laidDownCard = this;
        this.zIndex = 2000;
        this.moveSmooth(targetPos, hl);
        this.startLayAnim()
    }

    private handExit() {
        if (this.state.name === "hand") {
            this.state.hand.cardGone(this);
        }
        this.rotation = 0;
        this.posSmoothEnabled = false;
        if (this.animName === CardAnim.ALTERATION) {
            this.clearAnim();
        }
    }

    private handSwitchHover(e: FederatedPointerEvent) {
        if (this.state.name === "hand" && this.state.subState === "idle") {
            this.state.subState = "hovered";

            // find an offset large enough so that we can see the entire card
            // (assuming the card is at the bottom of the screen!)

            // (viewport space calculations)
            // y + boundHeight/2 = viewportHeight - offset
            // <==> y = viewportHeight - offset - boundHeight/2
            // and then convert into world space

            const offset = SELECTED_Y_OFFSET;
            // we're not using toScreen because that functions applies origin offset.
            // Instead, we use the Y scale from the world transform matrix (assuming it is not rotated).
            const vpBoundHeight = this.worldTransform.d * this.bounds.height;
            const viewportHeight = this.scene.viewport.screenHeight;

            const vpCardY = viewportHeight - offset - vpBoundHeight / 2;
            const worldCardY = this.scene.viewport.toWorld(0, vpCardY).y;

            this.position.y = worldCardY;
            this.zIndex = SELECTED_Z_INDEX;

            // Enlarge the hit area to avoid the case where there's a bit of bottom empty space that's not
            // considered as part of the card
            // Also add a bit more for dragging threshold
            this.hitArea = this.hoverHitRect;

            if (this.scene.interaction.hoveringHandId !== -1) {
                this.scene.interaction.switchHandHoverCard(this);
            } else {
                this.scene.interaction.beginHandHover(e.pointerId, this)
            }
            this.startPointerTracking(e, true);
        }
    }

    private handSwitchDrag(pos: Point) {
        if (this.state.name === "hand" && this.state.subState === "hovered") {
            if (!this.playable || this.propositions === null) {
                throw new Error("Cannot switch to drag state without propositions!");
            }

            this.scene.interaction.start(InteractionType.DRAGGING_CARD, {
                card: this,
                propositions: this.propositions
            }, id => this.interactionId = id);

            this.state.subState = "dragged";
            if (this.visual.type === "unit") {
                this.dragMode = PostDragMode.SPAWN_UNIT
            } else {
                this.dragMode = PostDragMode.USE_TARGETLESS_SPELL
                this.scene.spellUseOverlay.show();
            }

            this.scene.interaction.endHandHover();

            this.posSmoothEnabled = false;
            this.ptStopOnLeave = false;
            this.dragOffset = pos.subtract(this.position);
            this.dragPoint = pos;

            this.scene.interaction.on("stop", this.onInteractionStop, this);
        }
    }

    private handSwitchTarget(pos: Point) {
        if (this.state.name === "hand" && this.state.subState === "hovered") {
            if (!this.playable || this.propositions === null || this.propositions.allowedEntities.length === 0) {
                throw new Error("Cannot switch to target state without the card being playable with entities!");
            }

            this.scene.interaction.start(InteractionType.DRAGGING_CARD, {
                card: this,
                propositions: this.propositions
            }, id => this.interactionId = id);

            this.state.subState = "targeting";

            this.scene.interaction.endHandHover();
            this.ptStopOnLeave = false;

            this.targetingStart(pos);
            this.scene.interaction.on("stop", this.onInteractionStop, this);
        }
    }

    private handSwitchIdle(continueHandHover: boolean) {
        if (this.state.name === "hand" && this.state.subState !== "idle") {
            this.position = this.state.handPos;
            this.zIndex = this.state.zIndex;
            this.hitArea = this.bounds;
            this.scale = new Point(1, 1);

            this.stopAllInteractions(continueHandHover);

            this.state.subState = "idle";
        }
    }

    private stopAllInteractions(continueHandHover: boolean) {
        if (this.interactionId != -1 && this.scene.interaction.id === this.interactionId) {
            this.scene.interaction.stop(true);
            this.interactionId = -1;
        }
        this.stopPointerTracking(true, true)
        if (this.state.name === "hand"
            && this.state.subState === "hovered"
            && this.scene.interaction.hoveringHandId !== -1) {

            if (this.scene.interaction.hoveredCard === this) {
                this.scene.interaction.switchHandHoverCard(null);
            }
            if (!continueHandHover) {
                this.scene.interaction.endHandHover();
            }
        }
        if (this.state.name === "hand" && this.state.subState === "dragged") {
            this.scene.spellUseOverlay.hide();
        }
        if (this.state.name === "hand" && this.state.subState === "targeting") {
            this.targetingStop(false);
        }
    }

    /*
     * Random utilities
     */

    findHider(): Card | null {
        if (this.state.name === "hand") {
            const hand = this.state.hand
            const idx = hand.cards.indexOf(this)
            const hiderIdx = idx - 1;

            if (hiderIdx >= 0 && hiderIdx < hand.cards.length) {
                return hand.cards[hiderIdx];
            }
        }

        return null
    }

    findVisibleRect() {
        const rect = new Rectangle(this.x - this.pivot.x * this.scale.x, this.y - this.pivot.y * this.scale.y,
            this.bounds.width * this.scale.x, this.bounds.height * this.scale.y);

        if (this instanceof Card && this.state.name === "hand") {
            const hider = this.findHider();

            if (hider !== null) {
                const dist = Math.abs(hider.x - this.x);
                const hiddenWidth = this.bounds.width - Math.abs(dist);
                rect.x += hiddenWidth * (this.state.hand.flipped ? 0 : 1);
                if (this.state.hand.flipped) {
                    rect.x += 6; // quite the hack
                }
                rect.width -= hiddenWidth;
            }
        }

        return rect;
    }

    /*
     * Visual stuff 
     */

    private dismountVisuals() {
        for (const c of this.root.children) {
            if (c != null && c !== this.bg) {
                c.destroy();
                this.removeChild(c);
            }
        }
    }

    // Dismount all visual components and rebuilds all the components using the visual data.
    // Only used when changing the card type, or when creating the card.
    replaceVisuals(data: CardVisualData) {
        this.dismountVisuals();

        let visuals: CardVisuals

        // Update the background first
        this.bg.texture = data.type == "faceDown" ?
            this.game.assets.base.cardDownBg :
            this.game.assets.base.cardUpBg;

        this.bg.height = HEIGHT;
        this.bg.width = WIDTH;

        const resolution = this.game.app.renderer.resolution
        if (data.type === "unit" || data.type === "spell") {
            // todo: reduce font size to fit large names
            //       kinda done... but it could be better with word wrapping
            const name = new Text({
                text: data.name,
                style: NAME_STYLE_DEFAULT,
                resolution: resolution * 1.5
            });
            this.root.addChild(name)
            placeInRectCenter(name, NAME_RECT, true);

            const cost = new BitmapText({
                text: data.cost.toString(),
                style: COST_TEXT_STYLE,
                resolution: resolution * 1.5
            });
            cost.tint = attrTextColor(data.costState);
            this.root.addChild(cost)
            placeInRectCenter(cost, COST_RECT);

            const attack =
                data.type === "unit" ? this.createAttribute(data.attack, data.attackState, cx(4), cy(118), true) : undefined;
            const health =
                data.type === "unit" ? this.createAttribute(data.health, data.healthState, cx(73), cy(118), false) : undefined;

            const desc = new Text({
                text: data.description,
                style: {
                    fill: 0x000000,
                    wordWrap: true,
                    wordWrapWidth: cx(92),
                    align: "center",
                    fontFamily: "Chakra Petch",
                    fontSize: 15
                },
                resolution: resolution * 2
            });
            this.root.addChild(desc);
            placeInRectCenter(desc, new Rectangle(cx(4), cy(78), cx(92), cy(37)), true);

            let archetype: Text | null = null;
            if (data.type === "unit" && data.archetype !== null && attack !== undefined && health !== undefined) {
                const archetype = new Text({
                    text: data.archetype,
                    style: ARCHETYPE_TEXT_STYLE,
                    resolution: resolution * 1.5
                });
                archetype.pivot.set(archetype.width / 2, archetype.height / 2);
                this.root.addChild(archetype);

                archetype.x = WIDTH / 2;
                archetype.y = attack.cont.y + attack.cont.height / 2;

                const maxWidth = cx(40);
                if (archetype.width > maxWidth) {
                    archetype.scale.set(maxWidth / archetype.width);
                }
            }

            const img = new Sprite(data.image);
            this.root.addChild(img);

            img.x = cx(4.8);
            img.y = cy(20);
            img.width = cx(90);
            img.height = cy(55);

            const bord = new Graphics()
                .rect(0, 0, img.width, img.height)
                .stroke({width: 1, color: 0x000000});
            this.root.addChild(bord)

            bord.x = img.x;
            bord.y = img.y;

            let spellCorner: Sprite | null = null;
            if (data.type === "spell") {
                spellCorner = new Sprite(this.game.assets.base.spellCorner);
                this.root.addChild(spellCorner);
                spellCorner.scale.set(0.2);
                spellCorner.x = img.x + img.width - spellCorner.width;
                spellCorner.y = img.y;
            }

            visuals = {
                type: data.type,
                components: {
                    name,
                    cost,
                    attack,
                    health,
                    description: desc,
                    image: img,
                    spellCorner,
                    archetype
                },
                data: data
            } as any // trust
        } else {
            visuals = {type: "faceDown", data: {}, components: {}};
        }

        return this.visual = visuals;
    }

    // Update some attributes that can change dynamically, doesn't support changing the card type!
    updateVisuals(data: Partial<CardVisualData>) {
        const type = this.visual.type;

        // Update common attributes
        if (type === "unit" || type === "spell") {
            const up = data as Partial<CardVisualDataOf<"unit" | "spell">>
            const vis = this.visual as CardVisualsOf<"unit" | "spell">
            if (up.cost !== undefined) {
                vis.data.cost = up.cost;
                if (up.costState !== undefined) {
                    vis.data.costState = up.costState;
                }
                vis.components.cost.text = up.cost.toString();
                vis.components.cost.tint = attrTextColor(vis.data.costState);
                placeInRectCenter(vis.components.cost, COST_RECT);
            }
        }

        // Unit-specific attributes
        if (type === "unit") {
            const up = data as Partial<CardVisualDataOf<"unit">>
            const vis = this.visual as CardVisualsOf<"unit">

            if (up.attack !== undefined) {
                vis.data.attack = up.attack;
                if (up.attackState !== undefined) {
                    vis.data.attackState = up.attackState;
                }
                this.updateAttribute(vis.components.attack, vis.data.attack, vis.data.attackState);
            }
            if (up.health !== undefined) {
                vis.data.health = up.health;
                if (up.healthState !== undefined) {
                    vis.data.healthState = up.healthState;
                }
                this.updateAttribute(vis.components.health, vis.data.health, vis.data.healthState);
            }
        }
    }

    createAttribute(value: number, state: AttrState, x: number, y: number, reversed: boolean): AttribComponents {
        const cont = new Container();
        this.root.addChild(cont)
        cont.x = x;
        cont.y = y;

        const bg = new Sprite(this.game.assets.base.attribBgBlack);
        cont.addChild(bg);
        bg.height = cy(16);
        bg.scale.set(bg.scale.y)
        if (reversed) {
            bg.anchor.x = 1;
            bg.scale.x *= -1;
        }

        const text = new BitmapText({
            style: ATTR_TEXT_STYLE,
            resolution: this.game.app.renderer.resolution * 1.5
        });
        cont.addChild(text)

        // we have to adjust the Y coordinate here a little because ehh i don't know it's not centered
        // to my taste you know
        const bounds = cont.getLocalBounds().rectangle;
        bounds.y -= 1.3;

        const components = {cont, bg, text, textBounds: bounds};
        this.updateAttribute(components, value, state)
        return components;
    }

    updateAttribute(comp: AttribComponents, value: number, state: AttrState) {
        comp.text.text = value.toString();
        comp.text.tint = attrTextColor(state);
        placeInRectCenter(comp.text, comp.textBounds);
    }
}