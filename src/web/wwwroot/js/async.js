export function runAfterDelay({func, delay}) {
    return {
        handle: null,
        queued: false,
        runningPromise: null,
        func: func,
        delay: delay,

        run() {
            if (this.runningPromise !== null) {
                this.queued = true
                return;
            }

            clearTimeout(this.handle)
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