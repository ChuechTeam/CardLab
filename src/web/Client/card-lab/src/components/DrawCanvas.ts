import {LabElement} from "../dom.ts";

export class DrawCanvas extends LabElement {
    canvas: HTMLCanvasElement = null!;
    ctx: CanvasRenderingContext2D = null!;
    strokeData: {
        prevPoint: {x: number, y: number} | null,
        ongoing: boolean
    } = { prevPoint: null, ongoing: false }
    
    /**
     * Make a new draw canvas for your drawing pleasures
     */
    constructor() {
        super();
    }
    
    connected() {
        const canvas = document.createElement("canvas")
        // Aspect ratio: 1:5/3 <==> 3:5
        canvas.width = 625
        canvas.height = 375
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        
        this.dom.appendChild(canvas)
        
        this.canvas = canvas
        this.ctx = canvas.getContext('2d')!;

        this.canvas.addEventListener("mousedown", e => {
            this.strokeStart()
        })
        this.canvas.addEventListener("touchstart", e => {
            this.strokeStart()
            e.preventDefault()
        })

        this.canvas.addEventListener("mousemove", e => {
            const pos = this.getMousePos(e);
            this.strokeUpdate(pos.x, pos.y);
        })
        this.canvas.addEventListener("touchmove", e => {
            // Only support single touch for now.
            const pos = this.getMousePos(e.touches[0]);
            this.strokeUpdate(pos.x, pos.y);
            e.preventDefault()
        });

        this.canvas.addEventListener("mouseup", e => {
            this.strokeEnd()
        })
        this.canvas.addEventListener("touchend", e => {
            this.strokeEnd()
            e.preventDefault()
        });

        document.addEventListener("mouseup", e => { this.strokeEnd() })
        document.addEventListener("touchend", e => { this.strokeEnd() })
    }
    
    strokeReset() {
        this.strokeData = {
            prevPoint: null,
            ongoing: false,
        }
    }
    
    strokeStart() {
        this.strokeData.ongoing = true;
    }
    
    strokeUpdate(x: number, y: number) {
        if (!this.strokeData.ongoing) { return; }
        
        if (this.strokeData.prevPoint != null) {
            this.ctx.lineWidth = 2;
            this.ctx.moveTo(this.strokeData.prevPoint.x, this.strokeData.prevPoint.y)
            this.ctx.lineTo(x, y)
            this.ctx.stroke()
        }
        this.strokeData.prevPoint = {x, y}
    }
    
    strokeEnd() {
        if (this.strokeData.ongoing) {
            this.dispatchEvent(new Event("stroke-ended"));
        }
        this.strokeReset()
    }

    getMousePos(e: MouseEvent | Touch) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left) / (rect.right - rect.left) * this.canvas.width,
            y: (e.clientY - rect.top) / (rect.bottom - rect.top) * this.canvas.height
        };
    }
}

customElements.define("draw-canvas", DrawCanvas)