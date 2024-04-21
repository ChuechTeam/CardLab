import {ColorSource, Container, Graphics, Point, Sprite, Ticker} from "pixi.js";
import {GameScene} from "src/duel/game/GameScene.ts";
import {lerp} from "src/duel/util.ts";
import {duelLogError, duelLogWarn} from "src/duel/log.ts";

export type EffectTargetAnimOptions = {
    appearInterval: number,
    targetEntryTime: number,
    endTime: number,
    color: ColorSource,
    radius: number
}

const ROT_SPEED = 0.3;

export class EffectTargetAnim extends Container {
    targets: Sprite[] = []
    lines: Graphics[] = []
    time = 0
    totalTime = 0
    options: EffectTargetAnimOptions = {
        appearInterval: 0,
        targetEntryTime: 0,
        endTime: 0,
        color: 0xffffff,
        radius: 0
    }
    baseScale = 0
    active = false
    onEnd = () => {}

    constructor(public scene: GameScene) {
        super();

        this.eventMode = "none";
        this.interactiveChildren = false;
        
        this.scene.game.app.ticker.add(this.tick, this);
        this.on("destroyed", () => {
            this.scene.game.app.ticker.remove(this.tick, this);
        })
        
        this.zIndex = 2500;
    }
    
    tick(t: Ticker) {
        if (!this.active) {
            return;
        }
        
        this.time += t.deltaMS/1000;
        let relT = this.time;

        if (this.time > this.totalTime) {
            this.hide();
            this.onEnd();
            return;
        }
        
        for (let i = 0; i < this.targets.length; i++){
            let target = this.targets[i];
            let line = this.lines[i];
            this.continueTargetAnim(relT, target, line);
            relT -= this.options.appearInterval;
        }
    }
    
    continueTargetAnim(t: number, target: Sprite, line: Graphics) {
        if (t < 0.0) {
            return
        } else {
            const capT = Math.min(t, this.options.targetEntryTime);
            const prog = capT / this.options.targetEntryTime;
            
            target.alpha = lerp(0, 1, prog);
            line.alpha = lerp(0, 1, prog);
            target.scale = lerp(this.baseScale*1.33, this.baseScale, prog);
            
            target.rotation = t * ROT_SPEED;
        }
    }

    show(sourcePos: Point, targetsPos: Point[], options: EffectTargetAnimOptions) {
        this.hide();

        if (targetsPos.length === 0) {
            throw new Error("Can't run the animation with 0 targets!")
        }
        
        this.active = true;
        this.visible = true;
        this.options = options;
        this.time = 0;
        this.totalTime = options.appearInterval * targetsPos.length + options.targetEntryTime + options.endTime;
        this.onEnd = () => {};

        const targetTexture = this.scene.game.assets.base.attackTarget;
        this.baseScale = options.radius/targetTexture.width;
        for (let i = 0; i < targetsPos.length; i++) {
            const target = new Sprite(targetTexture);
            target.anchor.set(0.5);
            target.position = targetsPos[i];
            target.alpha = 0;
            target.scale = this.baseScale
            target.tint = options.color;
            this.addChild(target);
            this.targets.push(target);
            
            const line = new Graphics()
                .moveTo(sourcePos.x, sourcePos.y)
                .lineTo(targetsPos[i].x, targetsPos[i].y)
                .stroke({width: 6, color: options.color});
            line.alpha = 0;
            this.addChild(line);
            this.lines.push(line);
        }
    }
    
    updateSourcePos(pos: Point) {
        for (let i = 0; i < this.lines.length; i++){
            let line = this.lines[i];
            line.clear()
                .moveTo(pos.x, pos.y)
                .lineTo(this.targets[i].x, this.targets[i].y)
                .stroke({width: 6, color: this.options.color});
        }
    }
    updateTargetPos(pos: Point[]) {
        if (pos.length !== this.targets.length) {
            duelLogError("Target position update array has the wrong amount of items!")
        }
        for (let i = 0; i < pos.length; i++) {
            this.targets[i].position = pos[i];
        }
    }

    hide() {
        if (this.active) {
            for (let target of this.targets) {
                this.removeChild(target);
                target.destroy();
            }
            for (let line of this.lines) {
                this.removeChild(line);
                line.destroy();
            }
            this.targets.length = 0;
            this.lines.length = 0;
            this.active = false;
            this.visible = false;
        }
    }
}