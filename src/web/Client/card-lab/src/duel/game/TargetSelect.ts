import {Container, Graphics, Point, Sprite, Ticker} from "pixi.js";
import {GameScene} from "src/duel/game/GameScene.ts";

export class TargetSelect extends Container {
    line: Graphics;
    target: Sprite;
    active = false;
    startPos = new Point();
    targetPos = new Point();

    constructor(public scene: GameScene) {
        super();

        this.line = new Graphics();
        this.addChild(this.line);

        this.target = new Sprite(scene.game.assets.base.attackTarget);
        this.target.width = 168;
        this.target.scale.y = this.target.scale.x;
        this.target.anchor.set(0.5, 0.5);
        this.target.tint = 0xa300c8;
        this.addChild(this.target);

        this.eventMode = "none";
        this.position = new Point(0, 0);
        this.zIndex = 10000;
        this.visible = false;

        this.scene.game.app.ticker.add(this.tick, this);
    }

    show(pos: Point, target: Point) {
        this.active = true;
        this.startPos = pos;
        this.targetPos = target;
        this.redraw();
        this.visible = true;
    }

    update(target: Point) {
        if (this.active) {
            this.targetPos = target;
            this.redraw();
        }
    }
    
    updateStart(start: Point) {
        if (this.active) {
            this.startPos = start;
            this.redraw();
        }
    }

    hide() {
        this.active = false;
        this.visible = false;
        this.line.clear();
        this.target.rotation = 0.0;
    }

    redraw() {
        this.line
            .clear()
            .moveTo(this.startPos.x, this.startPos.y)
            .lineTo(this.targetPos.x, this.targetPos.y)
            .stroke({width: 12, color: 0xa300c8})
            .circle(this.startPos.x, this.startPos.y, 6)
            .fill({color: 0xa300c8});
        this.target.position = this.targetPos;
    }

    tick(t: Ticker) {
        if (this.active) {
            this.target.rotation += (t.deltaMS / 4000) * 6.28;
        }
    }
}