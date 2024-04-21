import {ColorSource, Container, Graphics, Rectangle, Ticker} from "pixi.js";
import {GameScene} from "src/duel/game/GameScene.ts";
import {easeExp, lerp} from "src/duel/util.ts";

type PulsatingRectOptions = {
    innerWidth: number,
    innerHeight: number,
    thickness: number,
    endThicknessScale: number,
    distance: number,
    pulseTime: number,
    interval: number | null,
    alignment: number,
    color: ColorSource
}

export class PulsatingRect extends Container {
    border: Graphics
    options: PulsatingRectOptions
    whRatio: number // >1 : width > height
    
    running: boolean = false
    time: number = 0.0
    
    intervalOn: boolean = false;
    intervalTime: number = 0.0
    
    constructor(public scene: GameScene, 
                inOptions: Partial<PulsatingRectOptions>) {
        super();
        
        this.options = {
            innerWidth: inOptions.innerWidth ?? 100,
            innerHeight: inOptions.innerHeight ?? 100,
            thickness: inOptions.thickness ?? 10,
            endThicknessScale: inOptions.endThicknessScale ?? 0.5,
            distance: inOptions.distance ?? 10,
            pulseTime: inOptions.pulseTime ?? 0.8,
            interval: inOptions.interval ?? null,
            alignment: inOptions.alignment ?? 0.5,
            color: inOptions.color ?? 0x000000
        }
        this.whRatio = this.options.innerWidth/this.options.innerHeight;

        this.boundsArea = new Rectangle(0, 0, this.options.innerWidth, this.options.innerHeight);

        this.border = new Graphics();
        this.addChild(this.border);
        
        this.visible = false;
        
        this.scene.game.app.ticker.add(this.tick, this);
        this.on("destroyed", ()  => {
            this.scene.game.app.ticker.remove(this.tick, this);
        });
    }
    
    show() {
        this.running = true;
        this.time = 0.0;
        this.alpha = 1.0;
        this.intervalTime = 0.0;
        this.visible = true;
    }
    
    startPeriodic() {
        this.intervalOn = true;
        this.intervalTime = 0.0;
    }
    
    endPeriodic() {
        this.intervalOn = false;
        this.hide();
    }
    
    hide() {
        this.running = false;
        this.time = 0.0;
        this.alpha = 1.0;
        this.intervalTime = 0.0;
        this.visible = false;
    }
    
    tick(t: Ticker) {
        if (!this.running && this.intervalOn && this.options.interval !== null) {
            this.intervalTime += t.deltaMS/1000;
            if (this.intervalTime > this.options.interval) {
                this.intervalTime = 0.0;
                this.show();
            }
        }
        
        if (!this.running) {
            return;
        }
        
        if (this.time > this.options.pulseTime) {
            this.hide()
            return;
        }

        const prog = this.time/this.options.pulseTime;
        const k = 1.5;
        
        const dist = lerp(0, this.options.distance, easeExp(prog, k));
        const thick = lerp(this.options.thickness, 
            this.options.thickness*this.options.endThicknessScale, easeExp(prog, k));
        this.renderBorder(dist, thick);
        this.alpha = lerp(1, 0, easeExp(prog, k))
        
        this.time += t.deltaMS/1000;
    }
    
    renderBorder(dist: number, thick: number) {
        const wDist = dist*this.whRatio;
        this.border
            .clear()
            .rect(-wDist/2, -dist/2, this.options.innerWidth+wDist, this.options.innerHeight+dist)
            .stroke({ color: this.options.color, width: thick, alignment: this.options.alignment });
    }
}