import {Container, Graphics, Point, Sprite, Texture, Ticker} from "pixi.js";
import {GameScene} from "src/duel/game/GameScene.ts";

export type GlossyRectOptions = {
    width: number,
    height: number,
    glossSize: number,
    autoMask: boolean,
    color: number,
    time: number,
    alpha: number
}

export class GlossyRect extends Container {
    options: GlossyRectOptions
    gloss: Sprite
    mask: Graphics | null = null

    running = false
    time = 0.0
    reverse = false

    start: Point
    end: Point

    constructor(public scene: GameScene, inOptions: Partial<GlossyRectOptions>) {
        super();

        this.options = {
            width: inOptions.width ?? 100,
            height: inOptions.height ?? 100,
            glossSize: inOptions.glossSize ?? 140,
            autoMask: inOptions.autoMask ?? true,
            color: inOptions.color ?? 0x000000,
            time: inOptions.time ?? 1.0,
            alpha: inOptions.alpha ?? 1.0
        }

        this.gloss = new Sprite(this.scene.game.assets.base.gloss)
        this.gloss.anchor.set(0.5, 0.5)
        this.gloss.width = this.options.glossSize;
        this.gloss.scale.y = this.gloss.scale.x;
        this.gloss.rotation = -Math.PI / 4;
        this.gloss.tint = this.options.color;
        this.gloss.alpha = this.options.alpha;

        this.addChild(this.gloss);

        if (this.options.autoMask) {
            this.mask = new Graphics()
                .rect(0, 0, this.options.width, this.options.height)
                .fill({color: 0xffffff});
            this.addChild(this.mask);

            this.gloss.mask = this.mask;
        }
        
        const distToHide = 1/2 * this.options.glossSize;

        this.start = new Point(this.options.width, this.options.height)
            .add(new Point(distToHide, distToHide))
        this.end = new Point(-distToHide, -distToHide)

        this.visible = false;

        this.scene.game.app.ticker.add(this.tick, this);
        this.on("destroyed", () => {
            this.scene.game.app.ticker.remove(this.tick, this);
        });
    }

    show(color?: number, reverse = false) {
        if (color !== undefined) {
            this.gloss.tint = color;
        } else {
            this.gloss.tint = this.options.color;
        }
        this.running = true;
        this.reverse = reverse;
        this.visible = true;
        this.time = 0.0;
        this.gloss.position = this.start;
    }

    hide() {
        this.running = false;
        this.visible = false;
    }

    tick(t: Ticker) {
        if (!this.running) {
            return;
        }

        if (this.time >= this.options.time) {
            this.hide();
            return;
        }

        const time = this.reverse ? (this.options.time-this.time) : this.time;
        const dir = this.end.subtract(this.start);
        this.gloss.position = this.start.add(dir.multiplyScalar(time/this.options.time));
        this.time += t.deltaMS / 1000;
    }
}