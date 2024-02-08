export class DrawCanvas {
    /**
     * Make a new draw canvas for your drawing pleasures
     * @param canvas {HTMLCanvasElement}
     */
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        
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
        
        this.strokeReset()
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

    /**
     * 
     * @param x {number}
     * @param y {number}
     */
    strokeUpdate(x, y) {
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
        this.strokeReset()
    }

    getMousePos(e) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left) / (rect.right - rect.left) * this.canvas.width,
            y: (e.clientY - rect.top) / (rect.bottom - rect.top) * this.canvas.height
        };
    }
}