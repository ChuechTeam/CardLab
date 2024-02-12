export function runAfterDelay({func, delay}: {func: () => Promise<any>, delay: number}): RunAfterDelayState {
    return {
        handle: null as number | null,
        queued: false,
        runningPromise: null as Promise<any> | null,
        func: func,
        delay: delay,

        run() {
            if (this.runningPromise !== null) {
                this.queued = true
                return;
            }

            clearTimeout(this.handle!)
            this.handle = setTimeout(async () => {
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
            }, this.delay);
        }
    }
}

export type RunAfterDelayState = {
    delay: number;
    func: () => Promise<any>;
    runningPromise: Promise<any> | null;
    queued: boolean;
    handle: number | null;
    run(): void
} 