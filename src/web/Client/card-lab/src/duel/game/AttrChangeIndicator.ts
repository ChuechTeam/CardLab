import {BitmapText, ColorSource, Container, Graphics, Point, Rectangle, TextStyle, Ticker} from "pixi.js";
import {StateAnimation, StateAnimPlayer} from "src/duel/anim.ts";
import {GameScene} from "src/duel/game/GameScene.ts";
import {easeExp, lerp, placeInRectCenter} from "src/duel/util.ts";

type AnimProps = typeof AttrChangeIndicator.prototype.animProps;

const HIDE_DELAY = 1.15;

const ATTR_TEXT_STYLE = new TextStyle({
    fontFamily: "ChakraPetchDigits",
    fontSize: 48, // will be scaled down accordingly
    fill: 0xffffff
});

export class AttrChangeIndicator extends Container {
    root: Container
    bg: Graphics
    text: BitmapText
    bounds: Rectangle

    animProps = {
        scale: 1.0,
        alpha: 1.0,
        rootPos: new Point(0, 0),
        rootRot: 0.0
    }

    animator = new StateAnimPlayer<AnimProps>()
    entryAnim: ReturnType<typeof this.makeEntryAnim>
    exitAnim: ReturnType<typeof this.makeExitAnim>

    isPositive: boolean = false
    hideTimer = 0.0

    constructor(public scene: GameScene, attrWidth: number, public leftSided: boolean, color: ColorSource) {
        super();

        this.bounds = new Rectangle(0, 0, attrWidth * 1.05, attrWidth * 0.65);
        this.boundsArea = this.bounds;

        this.root = new Container()
        this.addChild(this.root)
        this.root.pivot.set(this.bounds.width / 2, this.bounds.height / 2);

        this.bg = new Graphics()
            .rect(0, 0, this.bounds.width, this.bounds.height)
            .fill({color})
        this.root.addChild(this.bg)

        this.text = new BitmapText({
            style: ATTR_TEXT_STYLE
        })
        this.root.addChild(this.text)

        this.animProps.rootRot = leftSided ? -0.35 : 0.35;

        this.visible = false;

        this.entryAnim = this.makeEntryAnim()
        this.animator.register(this.entryAnim)

        this.exitAnim = this.makeExitAnim()
        this.animator.register(this.exitAnim)

        this.scene.game.app.ticker.add(this.tick, this)
        this.on("destroyed", () => {
            this.scene.game.app.ticker.remove(this.tick, this)
        })
    }

    show(val: number) {
        if (this.visible) {
            this.hide();
        }

        this.isPositive = val > 0
        this.updateText(val)

        this.visible = true;
        this.entryAnim.def.config(this.isPositive)
        this.entryAnim.start()
    }

    hide() {
        this.visible = false;
        this.hideTimer = 0;
        this.entryAnim.stop()
        this.exitAnim.stop()
    }

    updateText(val: number) {
        this.text.text = (this.isPositive ? "+" : "") + val.toString();
        this.text.scale.set(1);
        const textBounds = this.bounds.clone().pad(-4, -2);
        placeInRectCenter(this.text, textBounds, true)
    }

    tick(t: Ticker) {
        if (!this.visible) {
            return
        }

        this.hideTimer += t.deltaMS / 1000;
        if (this.hideTimer > HIDE_DELAY && !this.exitAnim.running) {
            this.exitAnim.def.config(this.isPositive)
            this.exitAnim.start()
        }

        const props = this.animator.apply(t.deltaMS / 1000, this.animProps)

        this.scale.set(props.scale)
        this.alpha = props.alpha
        this.root.position = props.rootPos
        this.root.rotation = props.rootRot

        if (this.hideTimer > HIDE_DELAY && !this.exitAnim.running) {
            this.hide()
        }
    }

    makeEntryAnim() {
        const def = {
            maxTime: 0,
            positive: false,
            update(time: number, state: AnimProps) {
                const p = time / this.maxTime;
                const p2 = easeExp(p, this.positive ? -5 : 0);
                state.scale = lerp(1.8, 1, p2);
                state.alpha = lerp(0, 1, p2);
            },
            config(positive: boolean) {
                this.positive = positive
                this.maxTime = positive ? 0.4 : 0.16;
            }
        };
        return new StateAnimation<AnimProps, typeof def>(def)
    }

    makeExitAnim() {
        const def = {
            maxTime: 0.3,
            positive: false,
            update(time: number, state: AnimProps) {
                const p = time / this.maxTime;

                state.alpha = lerp(1, 0, p);
                if (this.positive) {
                    state.rootPos.y = -lerp(0, 10, p);
                } else {
                    state.rootPos.y = lerp(0, 25, p);
                    state.rootRot *= lerp(1, 1.5, p);
                }
            },
            config(positive: boolean) {
                this.positive = positive
            }
        };
        return new StateAnimation<AnimProps, typeof def>(def)
    }
}