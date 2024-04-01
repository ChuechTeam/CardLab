/*
 * Random utilities for random necessities
 */

import {Container, EventEmitter, FederatedPointerEvent, Point, Rectangle} from "pixi.js";
import {GameScene} from "src/duel/game/GameScene.ts";

export function placeInRectCenter(obj: { x: number, y: number, width: number, height: number }, rect: Rectangle) {
    obj.x = rect.x + (rect.width - obj.width) / 2;
    obj.y = rect.y + (rect.height - obj.height) / 2;
}

// Accepts t in [0, 1]
// k=0: linear
// k>0: ease-in
// k<0: ease-out
export function easeExp(t: number, k: number) {
    if (k === 0) {
        return t;
    }
    
    t = Math.min(1, Math.max(0, t));
    return (1-Math.exp(k*t))/(1-Math.exp(k));
}

export function easeExpRev(t: number, k: number) {
    return easeExp(1-t, -k);
}

function listen<T extends EventEmitter.ValidEventTypes, 
    N extends EventEmitter.EventNames<T>>(this: Container, 
                                          emitter: EventEmitter<T>, 
                                          event: N, 
                                          func: EventEmitter.EventListener<T, N>) {
    emitter.on(event, func, this);
    this.on("destroyed", () => emitter.off(event, func, this));
}

export function registerUtilMixins() {
    (Container.prototype as any).listen = listen;
}

export class PointerTracker {
    running: boolean = false
    pointerId: number = -1; // Identifier of the pointer
    stopOnLeave: boolean = false
    
    onStart: (pos: Point) => void = p => {}
    onMove: (pos: Point) => void = p => {}
    onStop: (pointerUp: boolean) => void = p => {}
    
    constructor(public cont: Container, public scene: GameScene) {
    }

    start(e: FederatedPointerEvent) {
        if (this.running) {
            return
        }

        this.running = true;
        this.pointerId = e.pointerId;

        const stage = this.scene.game.app.stage
        stage.on("pointermove", this.ptHandleStageMove)
        stage.on("pointerup", this.ptHandleStageUp)
        stage.on("pointerupoutside", this.ptHandleStageUp)
        this.cont.on("pointerleave", this.ptHandleCardLeave)

        this.onStart(this.scene.viewport.toWorld(e.global))
    }

    ptHandleStageUp = (e: FederatedPointerEvent) => {
        if (e.pointerId === this.pointerId) {
            this.stop(true);
        }
    }

    ptHandleCardLeave = (e: FederatedPointerEvent) => {
        if (e.pointerId === this.pointerId && this.stopOnLeave) {
            this.stop(false);
        }
    }

    ptHandleStageMove = (e: FederatedPointerEvent) => {
        if (e.pointerId === this.pointerId) {
            this.onMove(this.scene.viewport.toWorld(e.global));
        }
    }

    stop(pointerUp: boolean) {
        if (!this.running) {
            return
        }

        this.running = false;
        this.pointerId = -1;

        const stage = this.scene.game.app.stage
        stage.off("pointermove", this.ptHandleStageMove)
        stage.off("pointerup", this.ptHandleStageUp)
        stage.off("pointerupoutside", this.ptHandleStageUp)
        this.cont.off("pointerleave", this.ptHandleCardLeave)

        this.onStop(pointerUp)
    }
}