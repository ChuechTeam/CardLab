import {
    Container,
    FederatedPointerEvent,
    Graphics, IHitArea,
    Point,
    Rectangle,
    Sprite,
    Text,
    TextMetrics,
    Texture
} from "pixi.js";
import {GameScene} from "./GameScene.ts";
import {DuelGame} from "../duel.ts";

// Game height: 1440
// Canonical card size: 100x140 (wxh), used in illustrator

const HEIGHT = 1440 * 0.3;
const WIDTH = HEIGHT / 1.392;

const SELECTED_Z_INDEX = 1000;
const SELECTED_Y_OFFSET = 140;

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
    text: Text
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
        cost: Text,
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
    flipped: boolean
    subState: "idle" | "hovered"
}

type CardState =
    | IdleCardState
    | HandCardState

export class Card extends Container {
    game: DuelGame
    bg: Sprite;

    // All the visual components of the card, including the card data (name, attributes...)
    visual: CardVisuals

    // The state of the card
    state: CardState = {name: "idle"}

    // Pointer tracking stuff: used for dragging the card and keeping track of pointer events 
    // (card released for instance)
    pointerTracking: boolean = false
    ptId: number = -1; // Identifier of the pointer
    ptStopOnLeave: boolean = false
    
    bounds: Rectangle

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

        this.game = scene.game

        this.bg = new Sprite(visData.type == "faceDown" ?
            this.game.assets.base.cardDownBg :
            this.game.assets.base.cardUpBg);
        this.bg.height = HEIGHT;
        this.bg.width = WIDTH;
        this.addChild(this.bg);

        // Make sure the card's pivot is at the center for easy positioning
        this.pivot = new Point(WIDTH / 2, HEIGHT / 2);
        this.bounds = new Rectangle(0, 0, this.bg.width, this.bg.height);

        if (interactable) {
            this.eventMode = "static"
            this.hitArea = this.bounds;
        } else {
            this.eventMode = "none"
        }

        if (visData.type == "unit") {
            // todo: reduce font size to fit large names
            const name = new Text(visData.name, {
                fill: 0x000000,
                fontFamily: "Chakra Petch",
                fontSize: 27
            });
            name.resolution *= 1.5
            this.addChild(name)
            this.placeTextCentered(name, new Rectangle(0, 0, cx(78), cy(17)));

            const cost = new Text(visData.cost.toString(), {
                fill: 0xFFFFFF,
                fontFamily: "Chakra Petch",
                fontSize: 38
            });
            cost.resolution *= 1.5
            this.addChild(cost)
            this.placeTextCentered(cost, new Rectangle(cx(76), cy(0.5), cx(24), cy(16)));

            const attack = this.createAttribute(visData.attack, cx(4), cy(118), true);
            const health = this.createAttribute(visData.health, cx(73), cy(118), false);

            const desc = new Text(visData.description, {
                fill: 0x000000,
                wordWrap: true,
                wordWrapWidth: this.toGlobalLength(cx(92)),
                align: "center",
                fontFamily: "Chakra Petch",
                fontSize: 12,
            });
            desc.resolution *= 2;
            this.addChild(desc);
            this.placeTextCentered(desc, new Rectangle(cx(4), cy(78), cx(92), cy(37)));

            const img = new Sprite(visData.image);
            this.addChild(img);

            img.x = cx(4.5);
            img.y = cy(20);
            img.width = cx(90);
            img.height = cy(55);

            const bord = new Graphics()
            this.addChild(bord)

            bord.x = img.x;
            bord.y = img.y;

            bord.lineStyle(1, 0x000000)
            bord.drawRect(0, 0, img.width, img.height)

            this.visual = {
                type: "unit",
                components: {
                    name,
                    cost,
                    attack,
                    health,
                    description: desc,
                    image: img
                },
                data: visData
            }

            this.on("pointerdown", this.cardPointerDown)
            this.on("pointermove", this.cardPointerMove)
            this.on("added", () => this.game.app.ticker.add(this.tick))
            this.on("removed", () => this.game.app.ticker.remove(this.tick))
        } else {
            this.visual = {type: "faceDown", data: {}, components: {}};
        }
    }

    /*
     * Various event handlers (tick, pointer)
     */

    tick = (dt: number) => {
        // todo: some movement animations
    }

    cardPointerDown = (e: FederatedPointerEvent) => {
    }
    
    cardPointerMove = (e: FederatedPointerEvent) => {
        // Make sure the mouse is clicked (left or right) OR that we're in a touch screen
        if ((e.buttons & (1 | 2)) !== 0
            && this.state.name === "hand" 
            && this.state.subState === "idle") {
            
            this.state.subState = "hovered";
            this.position.y -= SELECTED_Y_OFFSET;
            this.zIndex = SELECTED_Z_INDEX;
            
            // Enlarge the hit area to avoid the case where there's a bit of bottom empty space that's not
            // considered as part of the card
            this.hitArea = this.bounds.clone().pad(0, 50);
            
            this.scene.cardPreviewOverlay.show({ type: this.visual.type, ...this.visual.data } as any);
            
            this.startPointerTracking(e, true);
        }
    }
    
    ptStarted(worldPos: Point) {
        // todo: add stuff
    }
    
    ptMoved(worldPos: Point) {
        // todo: add stuff
    }
    
    ptStopped(worldPos: Point) {
        if (this.state.name === "hand" && this.state.subState === "hovered") {
            this.state.subState = "idle";
            this.position = this.state.handPos;
            this.zIndex = this.state.zIndex;
            this.hitArea = this.bounds;
            this.scene.cardPreviewOverlay.hide();
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
        if (stopOnLeave) { this.on("pointerleave", this.ptHandleStageUp) }
        
        this.ptStarted(this.scene.viewport.toWorld(e.global))
    }

    ptHandleStageUp = (e: FederatedPointerEvent) => {
        if (e.pointerId === this.ptId) {
            this.stopPointerTracking(e);
        }
    }
    
    ptHandleStageMove = (e: FederatedPointerEvent) => {
        if (e.pointerId === this.ptId) {
            this.ptMoved(this.scene.viewport.toWorld(e.global));
        }
    }

    stopPointerTracking(e: FederatedPointerEvent) {
        if (!this.pointerTracking) {
            return
        }

        this.pointerTracking = false;
        this.ptId = -1;

        const stage = this.game.app.stage
        stage.off("pointermove", this.ptHandleStageMove)
        stage.off("pointerup", this.ptHandleStageUp)
        stage.off("pointerupoutside", this.ptHandleStageUp)
        if (this.ptStopOnLeave) { this.off("pointerleave", this.ptHandleStageUp) }
        
        this.ptStopped(this.scene.viewport.toWorld(e.global))
    }

    /*
     * State management
     */

    moveToHand(pos: Point, zIndex: number, flipped: boolean) {
        if (this.state.name === "hand") {
            // Already in hand.
            this.state.zIndex = zIndex;
            this.state.handPos = pos;
            this.state.flipped = flipped;
        } else {
            // Switch state
            this.switchState({
                name: "hand",
                zIndex,
                handPos: pos,
                flipped,
                subState: "idle"
            });
        }
        this.position.set(pos.x, pos.y);
        this.zIndex = zIndex;
        if (flipped) {
            this.rotation = Math.PI;
        }
    }

    private switchState(newState: CardState) {
        this.state = newState;
    }

    /*
     * Visual stuff 
     */

    createAttribute(value: number, x: number, y: number, reversed: boolean): AttribComponents {
        const cont = new Container();
        this.addChild(cont)
        cont.x = x;
        cont.y = y;

        const bg = new Sprite(this.game.assets.base.attribBg);
        cont.addChild(bg);
        bg.height = cy(16);
        bg.scale.set(bg.scale.y)
        if (reversed) {
            bg.anchor.x = 1;
            bg.scale.x *= -1;
        }

        const text = new Text(value.toString(), {
            fill: 0xFFFFFF,
            fontFamily: "Chakra Petch",
            fontSize: 38
        });
        text.resolution *= 1.5
        cont.addChild(text)

        // we have to adjust the Y coordinate here a little because ehh i don't know it's not centered
        // to my taste you know
        const bounds = cont.getLocalBounds();
        bounds.y -= 1.3;
        this.placeTextCentered(text, bounds);

        return {cont, bg, text}
    }

    placeTextCentered(text: Text, rect: Rectangle) {
        text.x = rect.x + (rect.width - text.width) / 2;
        text.y = rect.y + (rect.height - text.height) / 2;
    }

    toGlobalLength(l: number) {
        return this.toGlobal(new Point(l + this.pivot.x, 0)).x
    }
}