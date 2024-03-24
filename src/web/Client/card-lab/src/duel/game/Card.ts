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
import {GameScene} from "./GameScene.ts";
import {DuelGame} from "../duel.ts";
import {duelLog, duelLogDebug, duelLogWarn} from "../log.ts";
import {placeInRectCenter} from "../util.ts";
import type {Hand} from "src/duel/game/Hand.ts";
import {InteractionData, InteractionType} from "src/duel/game/InteractionModule.ts";
import {LocalDuelCardPropositions} from "src/duel/control/state.ts";

// Game height: 1440
// Canonical card size: 100x140 (wxh), used in illustrator

const HEIGHT = 1440 * 0.3;
const WIDTH = HEIGHT / 1.392;

const SELECTED_Z_INDEX = 1000;
const SELECTED_Y_OFFSET = 10;

const DRAG_ANGLE_MIN = Math.PI / 2 - Math.PI / 4;
const DRAG_ANGLE_MAX = Math.PI / 2 + Math.PI / 4;
const DRAG_DIST_THRESH = 125; // World units

const PLAY_ANIM_TIME = 300;

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
        cost: number
        attack: number
        health: number
        description: string
        image: Texture
    }
    components: {
        name: Text,
        cost: AbstractText,
        description: Text,
        image: Sprite,
        attack: AttribComponents
        health: AttribComponents
    }
}

type CardVisuals =
    | FaceDownVisuals
    | UnitVisuals

export type CardVisualData =
    | { type: "faceDown" } & FaceDownVisuals["data"]
    | { type: "unit" } & UnitVisuals["data"]

// Card state (which is just all the states of the state machine)

type IdleCardState = { name: "idle" }
type HandCardState = {
    name: "hand";
    zIndex: number
    handPos: Point // will also be used to introduce animation later
    hand: Hand // well, the hand...
    flipped: boolean
    subState: "idle" | "hovered" | "dragged"
}
type PlayingCardState = {
    name: "playing"
    animTime: number
    scaleStart: number,
    prevHand: Hand,
    prevHandIdx: number
    destroyOnEnd: boolean
};

type CardState =
    | IdleCardState
    | HandCardState
    | PlayingCardState

export class Card extends Container {
    game: DuelGame

    // All the visual components of the card, including the card data (name, attributes...)
    visual: CardVisuals
    bg: Sprite;

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

    interactionId: number = -1
    propositions: LocalDuelCardPropositions | null = null // Propositions given by the server
    playable: boolean | null = null // True if this card can be dragged to be played, null if undeterminated

    hoverHitRect: Rectangle;
    preDragHitRect: Rectangle;

    bounds: Rectangle
    
    id: number = -1

    static dataFromCardRef(ref: CardAssetRef, game: DuelGame, testDesc: boolean = false): CardVisualData {
        const cardAsset = game.registry.findCard(ref)!;
        const imgAsset = game.assets.getCardTexture(ref)!;
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
            attack: def.attack,
            health: def.health,
            description: desc,
            image: imgAsset
        }
    }

    constructor(public scene: GameScene, visData: CardVisualData, public readonly interactable: boolean) {
        super();

        const ts = performance.now();

        this.game = scene.game

        this.bg = new Sprite();
        this.addChild(this.bg);

        // Make sure the card's pivot is at the center for easy positioning
        this.pivot = new Point(WIDTH / 2, HEIGHT / 2);
        this.bounds = new Rectangle(0, 0, WIDTH, HEIGHT);

        this.hoverHitRect = this.bounds.clone().pad(0, SELECTED_Y_OFFSET + DRAG_DIST_THRESH);
        this.preDragHitRect = this.hoverHitRect.clone().pad(DRAG_DIST_THRESH, 0)

        if (interactable) {
            this.eventMode = "static"
            this.hitArea = this.bounds;

            this.on("pointerdown", this.cardPointerDown)
            this.on("pointermove", this.cardPointerMove)
        } else {
            this.eventMode = "none"
        }

        this.visual = this.replaceVisuals(visData);

        this.on("added", () => this.game.app.ticker.add(this.tick))
        this.on("destroyed", () => {
            this.game.app.ticker.remove(this.tick);
            this.switchToIdle();
        })

        this.listen(this.scene.interaction, "block", this.onInteractionBlockUpdate);
        this.listen(this.scene.interaction, "unblock", this.onInteractionBlockUpdate);

        const te = performance.now();

        duelLogDebug("Card created in " + (te - ts).toFixed(2) + "ms");
    }

    /*
     * Various event handlers (tick, pointer)
     */

    tick = (t: Ticker) => {
        if (this.state.name === "hand" && this.state.subState === "dragged") {
            // those are framerate-dependant just to get the job done, it's not high priority rn
            this.dragOffset = this.dragOffset.multiplyScalar(0.75);
            this.scale = 0.8 * this.scale.x + 0.2 * 0.4;
            this.position = this.dragPoint.subtract(this.dragOffset);
        } else if (this.state.name === "playing") {
            this.continuePlayAnim(t.deltaMS, this.state);
        }
        // todo: some movement animations
    }

    cardPointerDown = (e: FederatedPointerEvent) => {
        if (this.state.name === "hand" && this.state.subState === "idle"
            && this.scene.interaction.hoveringHandId === -1
            && this.scene.interaction.type !== InteractionType.DRAGGING_CARD) {
            this.handSwitchHover(e);
        }
    }

    cardPointerMove = (e: FederatedPointerEvent) => {
        // Make sure the mouse is clicked (left or right) OR that we're in a touch screen
        if ((e.buttons & (1 | 2)) !== 0
            && this.state.name === "hand"
            && this.state.subState === "idle"
            && this.scene.interaction.hoveringHandId === e.pointerId
            && this.scene.interaction.type !== InteractionType.DRAGGING_CARD) {
            this.handSwitchHover(e);
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
                        this.handSwitchDrag(worldPos);
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
        }
    }

    ptStopped(pointerUp: boolean) {
        if (this.state.name === "hand" && this.state.subState === "hovered") {
            this.handSwitchIdle(!pointerUp)
        } else if (this.state.name === "hand" && this.state.subState === "dragged") {
            // check if we can submit anything
            if (this.trySubmitInteraction()) {
                this.switchToPlaying();
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

    stopPointerTracking(pointerUp: boolean) {
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

        this.ptStopped(pointerUp)
    }

    onInteractionStop(type: InteractionType, data: InteractionData, id: number, cancel: boolean) {
        this.scene.interaction.off("stop", this.onInteractionStop, this);

        if (cancel && id === this.interactionId) {
            if (this.state.name === "playing") {
                // Revert what we did.
                this.state.prevHand.addCard(this, true, this.state.prevHandIdx)
            } else {
                this.handSwitchIdle(false);
            }
        }
    }

    onInteractionBlockUpdate() {
        this.updatePlayableState();
    }

    /*
     * Client/Server things
     */

    updatePropositions(props: LocalDuelCardPropositions | null | undefined) {
        if (!this.interactable && props) {
            duelLogWarn("Propositions given to a non-interactable card!", props);
        }

        this.propositions = props ?? null;
        this.updatePlayableState();
    }

    updatePlayableState() {
        if (!this.interactable) {
            // Always null.
            return;
        }

        const prevPlayable = this.playable;
        this.playable = this.propositions !== null &&
            !this.scene.interaction.blocked;

        if (prevPlayable !== this.playable) {
            const tint = !this.playable ? "#999999" : "#ffffff";

            // Darken the components
            for (const comp of this.children) {
                // Little hack so we don't get odd visuals for dark elements.
                if (comp.label === "attr") {
                    comp.children.filter(x => x instanceof AbstractText).forEach(x => x.tint = tint);
                    continue;
                }
                comp.tint = tint;
            }
        }
    }

    trySubmitInteraction(): boolean {
        for (const grid of this.scene.unitSlotGrids) {
            if (grid.selectedSlot !== null) {
                this.scene.interaction.submit(InteractionType.DRAGGING_CARD, {
                    slots: [grid.selectedSlot.gamePos],
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
    
    continuePlayAnim(dt: number, state: PlayingCardState) {
        const nt = state.animTime = Math.min(PLAY_ANIM_TIME, state.animTime + dt);

        if (nt >= PLAY_ANIM_TIME && state.destroyOnEnd) {
            this.destroy();
            return;
        }
        
        function lerp(a: number, b: number, t: number) { return (1-t)*a + t*b;  }
        
        this.scale = lerp(state.scaleStart, 1.3, nt/PLAY_ANIM_TIME);
        this.alpha = lerp(1, 0, nt/PLAY_ANIM_TIME);
    }
    
    queueDestroy() {
        if (this.state.name === "playing") {
            if (this.state.animTime >= PLAY_ANIM_TIME) {
                this.destroy();
            }
            else if (!this.state.destroyOnEnd) {
                this.state.destroyOnEnd = true;
                this.scene.unregisterCardEarly(this);
            }
        } else {
            this.destroy();
        }
    }

    /*
     * State management
     */

    moveToHand(pos: Point, zIndex: number, flipped: boolean, hand: Hand) {
        if (this.state.name === "hand") {
            // Already in hand. 
            // todo: what do if hovering? 
            this.state.zIndex = zIndex;
            this.state.handPos = pos;
            this.state.flipped = flipped;
        } else {
            if (this.state.name === "playing") {
                // cancel animation
                this.scale = 1;
                this.alpha = 1;
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
        this.position.set(pos.x, pos.y);
        this.zIndex = zIndex;
        if (flipped) {
            this.rotation = Math.PI;
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
        
        this.handExit();
        this.state = {
            name: "playing", 
            animTime: 0.0,
            scaleStart: this.scale.x,
            prevHand: this.state.hand,
            prevHandIdx: this.state.hand.cards.indexOf(this),
            destroyOnEnd: false
        };
    }

    cancelHover() {
        if (this.state.name === "hand" && this.state.subState === "hovered") {
            this.handSwitchIdle(false);
        }
    }

    private handExit() {
        if (this.state.name === "hand") {
            this.state.hand.cardGone(this);
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
                throw new Error("Cannot switch to drag state without the card being playable!");
            }

            this.interactionId = this.scene.interaction.start(InteractionType.DRAGGING_CARD, {
                card: this,
                propositions: this.propositions
            });

            this.state.subState = "dragged";

            this.scene.interaction.endHandHover();

            this.ptStopOnLeave = false;
            this.dragOffset = pos.subtract(this.position);
            this.dragPoint = pos;

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
        this.stopPointerTracking(true)
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
    }

    /*
     * Visual stuff 
     */

    private dismountVisuals() {
        for (const c of this.children) {
            if (c !== this.bg) {
                c.destroy();
                this.removeChild(c);
            }
        }
    }

    // Dismount all visual components and rebuilds all the components using the visual data.
    // Only used when changing the card type, or when creating the card.
    replaceVisuals(data: CardVisualData): CardVisuals {
        this.dismountVisuals();

        // Update the background first
        this.bg.texture = data.type == "faceDown" ?
            this.game.assets.base.cardDownBg :
            this.game.assets.base.cardUpBg;

        this.bg.height = HEIGHT;
        this.bg.width = WIDTH;

        const resolution = this.game.app.renderer.resolution
        if (data.type == "unit") {
            // todo: reduce font size to fit large names
            const name = new Text({
                text: data.name,
                style: NAME_STYLE_DEFAULT,
                resolution: resolution * 1.5
            });
            this.addChild(name)
            placeInRectCenter(name, new Rectangle(0, 0, cx(78), cy(16.5)));

            const cost = new BitmapText({
                text: data.cost.toString(),
                style: COST_TEXT_STYLE,
                resolution: resolution * 1.5
            });
            this.addChild(cost)
            placeInRectCenter(cost, new Rectangle(cx(76), cy(0.5), cx(24), cy(16)));

            const attack = this.createAttribute(data.attack, cx(4), cy(118), true);
            const health = this.createAttribute(data.health, cx(73), cy(118), false);

            const desc = new Text({
                text: data.description,
                style: {
                    fill: 0x000000,
                    wordWrap: true,
                    wordWrapWidth: cx(92),
                    align: "center",
                    fontFamily: "Chakra Petch",
                    fontSize: 13
                },
                resolution: resolution * 2
            });
            this.addChild(desc);
            placeInRectCenter(desc, new Rectangle(cx(4), cy(78), cx(92), cy(37)));

            const img = new Sprite(data.image);
            this.addChild(img);

            img.x = cx(4.8);
            img.y = cy(20);
            img.width = cx(90);
            img.height = cy(55);

            const bord = new Graphics()
                .rect(0, 0, img.width, img.height)
                .stroke({width: 1, color: 0x000000});
            this.addChild(bord)

            bord.x = img.x;
            bord.y = img.y;

            return {
                type: "unit",
                components: {
                    name,
                    cost,
                    attack,
                    health,
                    description: desc,
                    image: img
                },
                data: data
            }
        } else {
            return {type: "faceDown", data: {}, components: {}};
        }
    }

    createAttribute(value: number, x: number, y: number, reversed: boolean): AttribComponents {
        const cont = new Container();
        this.addChild(cont)
        cont.x = x;
        cont.y = y;
        cont.label = "attr";

        const bg = new Sprite(this.game.assets.base.attribBg);
        cont.addChild(bg);
        bg.tint = 0x000000;
        bg.height = cy(16);
        bg.scale.set(bg.scale.y)
        if (reversed) {
            bg.anchor.x = 1;
            bg.scale.x *= -1;
        }

        const text = new BitmapText({
            text: value.toString(),
            style: ATTR_TEXT_STYLE,
            resolution: this.game.app.renderer.resolution * 1.5
        });
        cont.addChild(text)

        // we have to adjust the Y coordinate here a little because ehh i don't know it's not centered
        // to my taste you know
        const bounds = cont.getLocalBounds().rectangle;
        bounds.y -= 1.3;
        placeInRectCenter(text, bounds);

        return {cont, bg, text}
    }
}