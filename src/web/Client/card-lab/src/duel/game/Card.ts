import {Container, Graphics, Rectangle, Sprite, Text, Texture} from "pixi.js";
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
        attack: Text,
        description: Text,
        image: Sprite
        attackBg?: Sprite,
        health: Text,
        healthBg?: Sprite,
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

    static dataFromCardRef(ref: CardAssetRef, game: DuelGame): CardVisualData {
        const cardAsset = game.registry.findCard(ref)!;
        const imgAsset = game.assets.getCardTexture(ref)!;
        const def = cardAsset.definition
        return {
            type: "unit",
            name: def.name,
            cost: def.cost,
            attack: def.attack,
            health: def.health,
            description: def.description 
                + " Et aussi, lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.",
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

        if (visData.type == "unit") {
            const name = new Text(visData.name, {
                fill: 0x000000
            });
            this.addChild(name)
            this.placeTextCentered(name, new Rectangle(0, 0, cx(78), cy(17)));

            const cost = new Text(visData.cost.toString(), {fill: 0xFFFFFF});
            this.addChild(cost)
            this.placeTextCentered(cost, new Rectangle(cx(76), cy(1), cx(24), cy(14)));

            const attack = new Text(visData.attack.toString(), {fill: 0x000000});
            this.addChild(attack)
            this.placeTextCentered(attack, new Rectangle(cx(4), cy(117), cx(23), cy(16)));

            const health = new Text(visData.health.toString(), {fill: 0x000000});
            this.addChild(health);
            this.placeTextCentered(health, new Rectangle(cx(71), cy(117), cx(23), cy(16)));

            const desc = new Text(visData.description, {
                fill: 0x000000,
                wordWrap: true,
                wordWrapWidth: this.toGlobal({ x: cx(80), y: 0 }).x*2,
                align: "center",
                fontSize: 26,
            });
            this.addChild(desc);
            desc.scale.set(0.5)
            this.placeTextCentered(desc, new Rectangle(cx(9), cy(85), cx(82), cy(30)));
            
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
        } else {
            this.state = {type: "faceDown", data: {}, components: {}};
        }
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