import {BitmapText, Container, Graphics, Point, Rectangle, Sprite, TextStyle, Ticker} from "pixi.js";
import {GameScene} from "./GameScene.ts";
import {AttrChangeIndicator} from "src/duel/game/AttrChangeIndicator.ts";
import {StateAnimation, StateAnimPlayer} from "src/duel/anim.ts";
import {clerp, lerp} from "src/duel/util.ts";
import {GlossyRect} from "src/duel/game/GlossyRect.ts";

const SPRITE_WIDTH = 160;

const TEXT_STYLE = new TextStyle({
    fontFamily: "ChakraPetchDigits",
    fontSize: 38,
    fill: 0xffffff
});

type AnimProps = typeof Core.prototype.animProps;

export class Core extends Container {
    coreSprite: Sprite
    coreMask: Sprite
    attribBack: Graphics
    hpIcon: Graphics
    hpText: BitmapText
    glossRect: GlossyRect

    hpChangeIndicator: AttrChangeIndicator

    animProps = {
        spriteTint: 0xffffff,
        rootRot: 0.0
    }

    animator = new StateAnimPlayer<AnimProps>()

    hurtAnim = this.makeHurtAnim()

    constructor(public scene: GameScene, health: number) {
        super();

        this.coreSprite = new Sprite(scene.game.assets.base.boardCore);
        this.coreSprite.width = SPRITE_WIDTH;
        this.coreSprite.scale.y = this.coreSprite.scale.x;
        this.addChild(this.coreSprite);

        this.coreMask = new Sprite(scene.game.assets.base.boardCoreMask);
        this.coreMask.width = SPRITE_WIDTH;
        this.coreMask.scale.y = this.coreSprite.scale.x;
        this.coreMask.x += 4 // i don't know why but else it doesn't align properly
        this.addChild(this.coreMask);

        const w = this.coreSprite.width, h = this.coreSprite.height;
        
        this.glossRect = new GlossyRect(scene, {
            width: w,
            height: h,
            glossSize: Math.sqrt(w*w+h*h),
            time: 0.7,
            alpha: 0.8,
            autoMask: false
        });
        this.glossRect.gloss.mask = this.coreMask;
        this.addChild(this.glossRect);

        this.attribBack = new Graphics(scene.game.assets.base.largeAttrBg)
            .fill({color: 0x000000});

        const off = 12;
        this.attribBack.width = this.coreSprite.width + off;
        this.attribBack.height = 48;
        this.attribBack.x = 0;
        this.attribBack.y = this.coreSprite.height - 44;
        this.addChild(this.attribBack);

        this.coreSprite.x += off / 2;

        this.hpText = new BitmapText({text: "", style: TEXT_STYLE});
        this.hpText.tint = 0xFFFFFF;
        this.addChild(this.hpText);

        this.hpIcon = new Graphics(scene.game.assets.base.healthIcon).fill(0xFFFFFF);
        this.hpIcon.scale.set(0.5);
        this.addChild(this.hpIcon);

        const bounds = this.getLocalBounds();
        this.boundsArea = new Rectangle(0, 0, bounds.width, bounds.height);

        this.hpChangeIndicator = new AttrChangeIndicator(scene, 70, false, 0xb60000);
        this.hpChangeIndicator.x = this.attribBack.width
        this.hpChangeIndicator.y = this.attribBack.y
        this.addChild(this.hpChangeIndicator);

        this.update(health);

        this.pivot.set(this.width / 2, this.height / 2);

        this.animator.register(this.hurtAnim);

        this.scene.game.app.ticker.add(this.tick, this);
        this.on("destroyed", () => {
            this.scene.game.app.ticker.remove(this.tick, this);
        });
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

    tick(t: Ticker) {
        const s = this.animator.apply(t.deltaMS / 1000, this.animProps);

        this.rotation = s.rootRot;
        this.coreSprite.tint = s.spriteTint;
    }

    makeHurtAnim() {
        return new StateAnimation<AnimProps>({
            maxTime: 0.14,
            rot: 0.0,
            update(time: number, state: AnimProps) {
                if (time === 0) {
                    const r = Math.random();
                    this.rot = Math.sign(0.5 - r) * (r * 0.05 + 0.125);
                }

                const half = this.maxTime / 2;
                this.updatePart(time > half ? half - (time - half) : time, half, state);
            },
            updatePart(t: number, max: number, state: AnimProps) {
                const prog = t / max;
                state.rootRot = lerp(0, this.rot, prog);
                state.spriteTint = clerp(0xffffff, 0xff9999, prog);
            }
        })
    }

    reactToHurt() {
        this.hurtAnim.start();
        if (this.scene.myCore === this && "vibrate" in navigator) {
            navigator.vibrate(90); // gotta make the player feel like they're getting hurt!
        }
    }

    reactToHeal() {
        this.glossRect.show(0x5fd312);
    }
}