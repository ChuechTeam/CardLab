export class StateAnimPlayer<A> {
    animations: StateAnimation<A, any>[] = []

    register(anim: StateAnimation<A, any> | StateAnimationDef<A>) {
        if (anim instanceof StateAnimation) {
            this.animations.push(anim)
        } else {
            this.animations.push(new StateAnimation(anim))
        }
    }

    unregister(anim: StateAnimation<A, any>) {
        this.animations.splice(this.animations.indexOf(anim), 1)
    }

    apply(dt: number, state: A): A {
        if (this.animations.every(a => !a.running)) {
            return state
        }
        
        const copy = structuredClone(state)
        for (let i = 0; i < this.animations.length; i++){
            let anim = this.animations[i];
            if (anim.running) {
                anim.update(dt, copy)
                
                if (anim.oneOff && !anim.running) {
                    this.animations.splice(i, 1);
                    i--;
                }
            }
        }
        return copy
    }
}

interface StateAnimationDef<A> {
    maxTime: number
    oneOff?: boolean

    update(time: number, state: A, end?: boolean, anim?: StateAnimation<A, any>): void

    reset?(): void
}

export class StateAnimation<A, D extends StateAnimationDef<A>> {
    time = 0.0;
    paused = false
    running = false
    oneOff: boolean

    constructor(public def: D) {
        this.oneOff = def.oneOff === true;
    }

    update(dt: number, state: A) {
        let end = false;
        
        if (!this.paused) {
            this.time += dt
            
            if (this.time > this.def.maxTime) {
                this.time = this.def.maxTime
                end = true
            }
        }

        this.def.update(this.time, state, end, this)

        if (end) {
            this.stop()
        }
    }

    start() {
        this.time = 0.0
        this.running = true
        this.paused = false
    }

    stop() {
        if (this.def.reset) {
            this.def.reset()
        }
        this.time = 0.0
        this.running = false
        this.paused = false
    }
}