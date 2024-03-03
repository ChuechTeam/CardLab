declare namespace GlobalMixins
{
    interface Point
    {
        add(p: IPointData): import("pixi.js").Point;
        sub(p: IPointData): import("pixi.js").Point;
        scale(s: number): import("pixi.js").Point;
        div(s: number): import("pixi.js").Point;
    }
}