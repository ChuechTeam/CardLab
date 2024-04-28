export function runAfterDelay({func, delay}: {func: () => Promise<any>, delay: number}): RunAfterDelayState {
    return {
        handle: null as number | null,
        queued: false,
        runningPromise: null as Promise<any> | null,
        func: func,
        delay: delay,

        run(now=false) {
            if (this.runningPromise !== null) {
                this.queued = true
                return;
            }

            clearTimeout(this.handle!)
            const func = async () => {
                // Convert to a promise if not already one
                this.runningPromise = Promise.resolve(this.func())
                try {
                    await this.runningPromise;
                } finally {
                    this.runningPromise = null;
                }

                if (this.queued) {
                    this.queued = false
                    this.handle = null
                    this.run()
                }
            }
            
            if (now) {
                this.handle = null;
                this.runningPromise = func();
            } else {
                this.handle = setTimeout(func, this.delay);
            }
        }
    }
}

export type RunAfterDelayState = {
    delay: number;
    func: () => Promise<any>;
    runningPromise: Promise<any> | null;
    queued: boolean;
    handle: number | null;
    run(now?: boolean): void
} 