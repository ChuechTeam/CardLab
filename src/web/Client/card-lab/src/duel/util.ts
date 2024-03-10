/*
 * Random utilities for random necessities
 */

import {Rectangle} from "pixi.js";

export function placeInRectCenter(obj: { x: number, y: number, width: number, height: number }, rect: Rectangle) {
    obj.x = rect.x + (rect.width - obj.width) / 2;
    obj.y = rect.y + (rect.height - obj.height) / 2;
}