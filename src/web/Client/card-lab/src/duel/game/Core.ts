import {BitmapText, Container, Graphics, Point, Rectangle, Sprite, TextStyle} from "pixi.js";
import {GameScene} from "./GameScene.ts";

const SPRITE_WIDTH = 160;

const TEXT_STYLE = new TextStyle({
    fontFamily: "ChakraPetchDigits",
    fontSize: 38
});

export class Core extends Container {
    coreSprite: Sprite
    attribBack: Graphics
    hpIcon: Graphics
    hpText: BitmapText

    constructor(public scene: GameScene, health: number) {
        super();

        this.coreSprite = new Sprite(scene.game.assets.base.boardCore);
        this.coreSprite.width = SPRITE_WIDTH;
        this.coreSprite.scale.y = this.coreSprite.scale.x;
        this.addChild(this.coreSprite);

        this.attribBack = new Graphics(scene.game.assets.base.largeAttrBg)
            .fill({color: 0x000000});

        const off = 12;
        this.attribBack.width = this.coreSprite.width + off;
        this.attribBack.height = 48;
        this.attribBack.x = 0;
        this.attribBack.y = this.coreSprite.height - 44;
        this.addChild(this.attribBack);
        
        this.coreSprite.x += off/2;

        this.hpText = new BitmapText({text: "", style: TEXT_STYLE});
        this.hpText.tint = 0xFFFFFF;
        this.addChild(this.hpText);

        this.hpIcon = new Graphics(scene.game.assets.base.healthIcon).fill(0xFFFFFF);
        this.hpIcon.scale.set(0.5);
        this.addChild(this.hpIcon);

        this.update(health);

        this.pivot.set(this.width / 2, this.height / 2);
    }

    update(hp: number) {
        const spacing = 12;

        this.hpText.didViewUpdate = false;
        this.hpText.text = hp;

        const blockSize = this.hpText.width + this.hpIcon.width + spacing;

        const csBlockStart = this.attribBack.x + (this.attribBack.width - blockSize) / 2;

        this.hpIcon.x = csBlockStart;
        this.hpIcon.y = this.attribBack.y + (this.attribBack.height - this.hpIcon.height) / 2;

        this.hpText.x = csBlockStart + spacing + this.hpIcon.width;
        this.hpText.y = this.attribBack.y + (this.attribBack.height - this.hpText.height) / 2;
    }
}