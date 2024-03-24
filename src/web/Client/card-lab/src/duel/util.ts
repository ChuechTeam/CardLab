/*
 * Random utilities for random necessities
 */

import {Container, EventEmitter, Rectangle} from "pixi.js";

export function placeInRectCenter(obj: { x: number, y: number, width: number, height: number }, rect: Rectangle) {
    obj.x = rect.x + (rect.width - obj.width) / 2;
    obj.y = rect.y + (rect.height - obj.height) / 2;
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