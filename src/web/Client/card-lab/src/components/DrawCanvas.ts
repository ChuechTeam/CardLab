import {LabElement, LabStyle} from "../dom.ts";
import {fitImageCover} from "src/util.ts";

const style = new LabStyle(":host { aspect-ratio: 5/3; }");

const MAX_UNDOS = 30;

class Vec2 {
    constructor(public x: number = 0, public y: number = 0) {
    }

    add(other: Vec2) {
        return new Vec2(this.x + other.x, this.y + other.y);
    }

    sub(other: Vec2) {
        return new Vec2(this.x - other.x, this.y - other.y);
    }

    mul(scalar: number) {
        return new Vec2(this.x * scalar, this.y * scalar);
    }

    norm() {
        return Math.sqrt(this.x * this.x + this.y * this.y);
    }

    normSq() {
        return this.x * this.x + this.y * this.y;
    }
}

export class DrawToolState {
    thickness = 3;
    color = "#000000";
    
    clone() {
        const clone = new DrawToolState();
        clone.thickness = this.thickness;
        clone.color = this.color;
        return clone;
    }
}

export class UndoStack {
    images: ImageData[] = [];
    // null --> not in the middle of the undostack
    displayedIdx: number | null = null;
    redoLastImg: ImageData | null = null;
}

class Stroke {
    points: Vec2[] = [];
    interpolatedPoints: Vec2[] = [];
    style: DrawToolState = new DrawToolState();
    
    // Internal drawing state
    circleDist: number
    incompleteDist = 0
    
    constructor(curStyle: DrawToolState) {
        this.style = curStyle.clone();
        this.circleDist = strokeCircleDistance(0.7, this.style.thickness);
    }
}

export class DrawCanvas extends LabElement {
    canvas: HTMLCanvasElement = null!;
    ctx: CanvasRenderingContext2D = null!;
    stroke: Stroke | null = null;

    toolState = new DrawToolState();
    undoStack = new UndoStack();
    
    #enabled = true;

    /**
     * Make a new draw canvas for your drawing pleasures
     */
    constructor() {
        super();
    }

    connected() {
        const canvas = document.createElement("canvas")
        // Aspect ratio: 1:5/3 <==> 3:5
        const resolution = 150;
        canvas.width = 5 * resolution;
        canvas.height = 3 * resolution;
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        canvas.style.touchAction = "none";
        canvas.style.display = "block";
        
        // just in case we have browser issues
        if ("part" in canvas)
            canvas.part.add("canvas");

        this.dom.appendChild(canvas)

        this.canvas = canvas
        this.ctx = canvas.getContext('2d', {
            alpha: false,
            willReadFrequently: true
        })!;

        this.clear();

        this.canvas.addEventListener("pointerdown", e => {
            this.strokeStart()
        })

        this.canvas.addEventListener("pointermove", e => {
            let evs = [e];
            if ("getCoalescedEvents" in e) { // safari doesn't support it :(
                evs = e.getCoalescedEvents();
            }
            for (let ev of evs) {
                const pos = this.getMousePos(ev);
                this.strokeUpdate(pos.x, pos.y);
            }
        })
        
        this.canvas.addEventListener("pointerup", e => {
            this.strokeEnd()
        });
        document.addEventListener("pointerup", e => {
            this.strokeEnd()
        })

        style.apply(this);
    }

    clear(pushToUndo=false) {
        if (pushToUndo) {
            this.pushToUndoStack();
        }
        
        this.ctx.fillStyle = "#ffffff";
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    canUndo() {
        return this.undoStack.images.length !== 0 && this.undoStack.displayedIdx !== 0;
    }
    
    undo() {
        if (!this.canUndo()) {
            return;
        }
        
        if (this.undoStack.displayedIdx === null) {
            this.undoStack.redoLastImg = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
            this.undoStack.displayedIdx = this.undoStack.images.length-1;
        } else {
            this.undoStack.displayedIdx--;
        }

        const img = this.undoStack.images[this.undoStack.displayedIdx];
        this.ctx.putImageData(img, 0, 0);
        
        this.dispatchEvent(new CustomEvent("undoStackUpdated"));
    }
    
    canRedo() {
        return this.undoStack.displayedIdx !== null;
    }
    
    redo() {
        if (!this.canRedo()) {
            return;
        }

        if (this.undoStack.displayedIdx === this.undoStack.images.length-1) {
            this.undoStack.displayedIdx = null;
            this.ctx.putImageData(this.undoStack.redoLastImg!, 0, 0);
        } else {
            this.undoStack.displayedIdx!++;
            const img = this.undoStack.images[this.undoStack.displayedIdx!];
            this.ctx.putImageData(img, 0, 0);
        }
        
        this.dispatchEvent(new CustomEvent("undoStackUpdated"));
    }
    
    load(img: HTMLImageElement, undoable: boolean) {
        const w = img.naturalWidth
        const h = img.naturalHeight
        
        if (w === this.canvas.width && h === this.canvas.height) {
            this.ctx.drawImage(img, 0, 0);
        } else {
            // Custom image, we need to find the right rectangle to take from (to get the right aspect raito)
            // and scale up from there.
            const { x, y, width, height } = fitImageCover(w, h, this.canvas.width, this.canvas.height);
            this.ctx.drawImage(img, x, y, width, height, 0, 0, this.canvas.width, this.canvas.height);
        }
        
        if (undoable) {
            this.pushToUndoStack();
        }
    }
    
    get enabled() { return this.#enabled; }
    set enabled(val: boolean) {
        this.#enabled = val;
        
        if (val) {
            this.canvas.style.pointerEvents = "auto";
        } else {
            this.canvas.style.pointerEvents = "none";
            this.strokeEnd();
        }
    }

    strokeReset() {
        this.stroke = null;
        this.ctx.closePath();
    }

    strokeStart() {
        // Save the image to the stack now!
        this.pushToUndoStack();
        
        this.stroke = new Stroke(this.toolState);
        this.updateStrokeStyle(this.stroke);
        this.ctx.beginPath();
    }

    strokeUpdate(x: number, y: number) {
        if (this.stroke === null) {
            return;
        }

        const p = new Vec2(x, y);
        this.stroke.points.push(p);

        const toDraw = [] as Vec2[];
        if (this.stroke.points.length == 1) {
            toDraw.push(p);
        } else {
            const prev = this.stroke.points[this.stroke.points.length - 2];
            const dist = prev.sub(p).norm();
            const iterations = Math.floor((dist + this.stroke.incompleteDist) / this.stroke.circleDist);
            for (let i = 0; i < iterations; i++) {
                const interp = plerp(prev, p, i / iterations);
                toDraw.push(interp);
                this.stroke.interpolatedPoints.push(interp);
            }

            if (toDraw.length === 0) {
                this.stroke.incompleteDist += dist;
            } else {
                this.stroke.incompleteDist = 0;
            }
        }
        
        if (toDraw.length !== 0) {
            this.ctx.beginPath();
            for (const point of toDraw) {
                this.ctx.ellipse(point.x, point.y,
                    this.toolState.thickness, this.toolState.thickness, 0, 0, 2 * Math.PI);
            }
            this.ctx.fill();
            this.ctx.closePath();
        }
    }

    strokeEnd() {
        if (this.stroke !== null) {
            if (this.stroke.points.length > 0) {
                this.dispatchEvent(new Event("stroke-ended"));
                this.dispatchEvent(new Event("undoStackUpdated"));
            } else {
                // Remove the last image from the undo stack
                this.undoStack.images.pop();
            }

            this.strokeReset()
        }
    }

    updateStrokeStyle(stroke: Stroke) {
        this.ctx.fillStyle = stroke.style.color;
        this.ctx.lineWidth = stroke.style.thickness;
        this.ctx.lineCap = "round";
        this.ctx.lineJoin = "round"
    }

    pushToUndoStack() {
        if (this.undoStack.images.length >= MAX_UNDOS - 1) {
            this.undoStack.images.shift();
        }
        // If we're inside the undo stack, remove all the images from the end, until we come up to what's currently
        // displayed on screen.
        if (this.undoStack.displayedIdx !== null) {
            this.undoStack.images.splice(this.undoStack.displayedIdx+1);
        } else {
            this.undoStack.images.push(this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height));
        }
        this.undoStack.displayedIdx = null;
        this.undoStack.redoLastImg = null;
        this.dispatchEvent(new CustomEvent("undoStackUpdated"));
    }

    getMousePos(e: MouseEvent | Touch) {
        const rect = this.canvas.getBoundingClientRect();
        return new Vec2(
            (e.clientX - rect.left) / (rect.right - rect.left) * this.canvas.width,
            (e.clientY - rect.top) / (rect.bottom - rect.top) * this.canvas.height
        );
    }
}

customElements.define("draw-canvas", DrawCanvas)

function plerp(a: Vec2, b: Vec2, t: number): Vec2 {
    return a.add(b.sub(a).mul(t));
}

// t: target area
// r: circle radius
// returns --> euclidean distance between circles (min 0.05) 
function strokeCircleDistance(t: number, r: number) {
    // Too far, select max possible distance.
    if (t >= 2*r*r) {
        return 2*r;
    }
    
    return Math.max(0.05, Math.pow(r*t, 1/3));
}