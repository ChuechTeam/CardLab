// Some additions to PIXI.js

import {ObservablePoint, Point} from "pixi.js";

for (const proto of [Point.prototype, ObservablePoint.prototype]) {
    Object.defineProperty(proto, "add", {
        value: function (p: Point) {
            return new Point(this.x + p.x, this.y + p.y);
        }
    })

    Object.defineProperty(proto, "sub", {
        value: function (p: Point) {
            return new Point(this.x - p.x, this.y - p.y);
        }
    })

    Object.defineProperty(proto, "scale", {
        value: function (s: number) {
            return new Point(this.x * s, this.y * s);
        }
    })

    Object.defineProperty(proto, "div", {
        value: function (s: number) {
            return new Point(this.x / s, this.y / s);
        }
    })
}