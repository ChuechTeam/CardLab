import {ColorSource, Container, Graphics, Point, Sprite, Ticker} from "pixi.js";
import {GameScene} from "src/duel/game/GameScene.ts";

const ROT_PER_SEC = 7.2;
const ROT2_PER_SEC = 1.7;

export type HomingProjectileOptions = {
    lineColor: ColorSource,
    projColor: ColorSource,
    startPos: Point,
    targetPos: Point,
    speed?: number,
    accel?: number,
    showLine?: boolean
}

type CompleteProjOptions = Required<HomingProjectileOptions>;

export const DAMAGE_PROJ_STYLE= {
    lineColor: 0xcc0000,
    projColor: 0xee0000,
}

export class HomingProjectile extends Container {
    bullet: Graphics;
    
    // world space
    targetImg: Sprite;
    line: Graphics;
    
    onHit: () => void = () => {}
    
    dirNorm: Point;

    options: CompleteProjOptions;
    speed: number;
    
    constructor(public scene: GameScene, 
                options: HomingProjectileOptions) {
        super();
        
        options.accel ??= 800;
        options.speed ??= 700;
        options.showLine ??= true;
        this.speed = options.speed;
        this.options = options as CompleteProjOptions;
        
        this.position = options.startPos;
        this.dirNorm = options.targetPos.subtract(options.startPos).normalize();

        const w = 8;
        const h = 10;
        const top = 4;
        
        this.bullet = new Graphics()
            .poly([
                0, 0,
                w, 0,
                w, h,
                w/2,h+top,
                0, h,
                0, 0
            ])
            .fill({ color: options.projColor });
        this.bullet.scale.set(4);
        this.bullet.pivot.set(w/2, h/2);
        this.bullet.rotation = Math.atan2(this.dirNorm.y, this.dirNorm.x)-Math.PI/2;
        this.addChild(this.bullet);
        
        this.targetImg = new Sprite(this.scene.game.assets.base.attackTarget);
        this.targetImg.anchor.set(0.5, 0.5)
        this.targetImg.position = options.targetPos;
        this.targetImg.scale = 0.2;
        this.targetImg.tint = options.lineColor;
        this.scene.viewport.addChild(this.targetImg);
        
        this.line = new Graphics()
            .moveTo(options.startPos.x, options.startPos.y)
            .lineTo(options.targetPos.x, options.targetPos.y)
            .stroke({ width: 6, color: options.lineColor });
        this.line.visible = options.showLine;
        this.scene.viewport.addChild(this.line);
        
        this.scene.game.app.ticker.add(this.tick, this);
        this.on("destroyed", () => {
            this.targetImg.destroy();
            this.line.destroy();
            this.scene.game.app.ticker.remove(this.tick, this);
        })
    }
    
    tick(t: Ticker) {
        const dt = t.deltaMS/1000;

        const dx = this.speed*dt + this.options.accel * dt*dt/2;
        this.position = this.position.add(this.dirNorm.multiplyScalar(dx));
        
        this.speed += this.options.accel * dt;
        
        const nextDir = this.options.targetPos.subtract(this.position)
        if (nextDir.dot(this.dirNorm) < 0) {
            this.onHit();
            this.destroy();
        }
    }
}