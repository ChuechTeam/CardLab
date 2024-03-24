declare namespace PixiMixins {
    interface Container {
        // Listen to events and unregister the listener when destroyed.
        listen<T extends import("pixi.js").EventEmitter.ValidEventTypes,
            N extends import("pixi.js").EventEmitter.EventNames<T>>(emitter: import("pixi.js").EventEmitter<T>,
                                                  event: T,
                                                  func: import("pixi.js").EventEmitter.EventListener<T, N>)
    }
}