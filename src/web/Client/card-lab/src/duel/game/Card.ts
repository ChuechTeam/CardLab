import {Container, Graphics, Rectangle, Sprite, Text, TextMetrics, Texture} from "pixi.js";
import {GameScene} from "./GameScene.ts";
import {DuelGame} from "../duel.ts";

// Game height: 1440
// Canonical card size: 100x140 (wxh), used in illustrator

const HEIGHT = 1440 * 0.3;
const WIDTH = HEIGHT / 1.392;

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

type FaceDownVisState = {
    type: "faceDown",
    data: {},
    components: {}
}

type UnitVisState = {
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

type CardVisualState =
    | FaceDownVisState
    | UnitVisState

export type CardVisualData =
    | { type: "faceDown" } & FaceDownVisState["data"]
    | { type: "unit" } & UnitVisState["data"]

export class Card extends Container {
    game: DuelGame
    bg: Sprite;

    state: CardVisualState

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

    constructor(public scene: GameScene, visData: CardVisualData) {
        super();

        this.game = scene.game

        // todo: bg for face down cards
        this.bg = new Sprite(this.game.assets.base.cardUpBg);
        this.bg.height = HEIGHT;
        this.bg.width = WIDTH;
        this.addChild(this.bg);

        this.eventMode = "static"
        this.hitArea = new Rectangle(0, 0, this.bg.width, this.bg.height);

        if (visData.type == "unit") {
            const name = new Text(visData.name, {
                fill: 0x000000,
                fontFamily: "Chakra Petch",
                fontSize: 27
            });
            name.resolution = 1.5
            this.addChild(name)
            this.placeTextCentered(name, new Rectangle(0, 0, cx(78), cy(17)));

            const cost = new Text(visData.cost.toString(), {
                fill: 0xFFFFFF,
                fontFamily: "Chakra Petch",
                fontSize: 38
            });
            cost.resolution = 1.5
            this.addChild(cost)
            this.placeTextCentered(cost, new Rectangle(cx(76), cy(0.5), cx(24), cy(16)));

            const attack = this.createAttribute(visData.attack, cx(4), cy(118), true);
            const health = this.createAttribute(visData.health, cx(73), cy(118), false);

            const desc = new Text(visData.description, {
                fill: 0x000000,
                wordWrap: true,
                wordWrapWidth: this.toGlobal({x: cx(92), y: 0}).x,
                align: "center",
                fontFamily: "Chakra Petch",
                fontSize: 13,
            });
            desc.resolution = 2;
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

            this.state = {
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

            // little test for scaling & resolution
            this.on("pointerup", e => {
                this.scale.set(this.scale.x + 0.1)
                if (this.scale.x > 2.5) {
                    this.scale.set(1)
                }
            })
        } else {
            this.state = {type: "faceDown", data: {}, components: {}};
        }
    }

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
        text.resolution = 1.5
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

    // width percentage
    wp(x: number) {
        return this.bg.width * x;
    }

    // height percentage
    hp(y: number) {
        return this.bg.height * y;
    }
}