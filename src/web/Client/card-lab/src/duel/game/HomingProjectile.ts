import {ColorSource, Container, Graphics, Point, Sprite, Ticker} from "pixi.js";
import {GameScene} from "src/duel/game/GameScene.ts";

export type HomingProjectileOptions = {
    lineColor: ColorSource,
    projColor: ColorSource,
    startPos: Point,
    targetPos: Point,
    speed?: number,
    accel?: number,
    showLine?: boolean
    useTime?: boolean
    time?: number
    zIndex?: number
}

type CompleteProjOptions = Required<HomingProjectileOptions>;

export const DAMAGE_PROJ_STYLE = {
    lineColor: 0xcc0000,
    projColor: 0xee0000,
}

export class HomingProjectile extends Container {
    bullet: Graphics;

    // world space
    //targetImg: Sprite;
    line: Graphics;

    onHit: () => void = () => {
    }

    dirNorm: Point;
    startToEnd: Point;

    options: CompleteProjOptions;
    speed: number;
    totalTime: number = 0;

    constructor(public scene: GameScene,
                options: HomingProjectileOptions) {
        super();

        options.accel ??= 800;
        options.speed ??= 700;
        options.showLine ??= true;
        options.useTime ??= false;
        options.time ??= 0.5;
        options.zIndex ??= 1;
        this.speed = options.speed;
        this.options = options as CompleteProjOptions;

        this.position = options.startPos;
        this.startToEnd = options.targetPos.subtract(options.startPos)
        this.dirNorm = this.startToEnd.normalize();

        const w = 8;
        const h = 10;
        const top = 4;

        this.bullet = new Graphics()
            .poly([
                0, 0,
                w, 0,
                w, h,
                w / 2, h + top,
                0, h,
                0, 0
            ])
            .fill({color: options.projColor});
        this.bullet.scale.set(8);
        this.bullet.pivot.set(w / 2, h / 2);
        this.bullet.rotation = Math.atan2(this.dirNorm.y, this.dirNorm.x) - Math.PI / 2;
        this.addChild(this.bullet);
        this.zIndex = options.zIndex;

        // this.targetImg = new Sprite(this.scene.game.assets.base.attackTarget);
        // this.targetImg.anchor.set(0.5, 0.5)
        // this.targetImg.position = options.targetPos;
        // this.targetImg.scale = 0.2;
        // this.targetImg.tint = options.lineColor;
        // this.scene.viewport.addChild(this.targetImg);

        this.line = new Graphics()
            .moveTo(options.startPos.x, options.startPos.y)
            .lineTo(options.targetPos.x, options.targetPos.y)
            .stroke({width: 6, color: options.lineColor});
        this.line.visible = options.showLine;
        this.line.zIndex = this.options.zIndex;
        this.scene.viewport.addChild(this.line);

        this.scene.game.app.ticker.add(this.tick, this);
        this.on("destroyed", () => {
            //this.targetImg.destroy();
            this.line.destroy();
            this.scene.game.app.ticker.remove(this.tick, this);
        })
    }

    tick(t: Ticker) {
        const dt = t.deltaMS / 1000;
        this.totalTime += dt;

        if (this.options.useTime) {
            if (this.totalTime >= this.options.time) {
                this.onHit();
                this.destroy();
                return;
            }

            this.position = this.options.startPos.add(
                this.startToEnd.multiplyScalar(this.totalTime / this.options.time)
            )
        } else {
            const dx = this.speed * dt + this.options.accel * dt * dt / 2;
            this.position = this.position.add(this.dirNorm.multiplyScalar(dx));

            this.speed += this.options.accel * dt;

            const nextDir = this.options.targetPos.subtract(this.position)
            if (nextDir.dot(this.dirNorm) < 0) {
                this.onHit();
                this.destroy();
            }
        }
    }
}