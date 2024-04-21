export class StateAnimPlayer<A> {
    animations: StateAnimation<A, any>[] = []

    cloner = (a: A) => structuredClone(a)

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

        const copy = this.cloner(state)
        for (let i = 0; i < this.animations.length; i++) {
            let anim = this.animations[i];
            if (anim.running) {
                anim.update(dt, copy, state)

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
    neverEnd?: boolean
    applyOnEnd?: boolean

    update(time: number, state: A, end?: boolean, anim?: StateAnimation<A, any>): void

    reset?(): void
}

export class StateAnimation<A, D extends StateAnimationDef<A> = StateAnimationDef<A> & { [x: string]: any }> {
    time = 0.0;
    paused = false
    running = false
    reverse = false
    neverEnd = false
    applyOnEnd = false
    oneOff: boolean

    constructor(public def: D) {
        this.oneOff = def.oneOff === true;
        this.neverEnd = def.neverEnd === true;
        this.applyOnEnd = def.applyOnEnd === true;
    }

    update(dt: number, state: A, orig: A) {
        const isMaxTime = this.reverse ? this.time === 0 : this.time === this.def.maxTime;
        let end = !this.neverEnd && isMaxTime;

        this.def.update(this.time, state, isMaxTime, this)

        if (end) {
            if (this.applyOnEnd) {
                this.def.update(this.time, orig, isMaxTime, this)
            }
            this.stop()
        } else if (!this.paused) {
            if (!this.reverse) {
                this.time += dt

                if (this.time > this.def.maxTime) {
                    this.time = this.def.maxTime
                }
            } else {
                this.time -= dt;

                if (this.time <= 0) {
                    this.time = 0
                }
            }
        }
    }

    start(reverse?: boolean) {
        if (reverse !== undefined) {
            this.reverse = reverse
        }

        this.time = this.reverse ? this.def.maxTime : 0.0;
        this.running = true
        this.paused = false
    }

    stop() {
        if (this.def.reset) {
            this.def.reset()
        }
        this.time = this.reverse ? this.def.maxTime : 0.0;
        this.running = false
        this.paused = false
    }
}