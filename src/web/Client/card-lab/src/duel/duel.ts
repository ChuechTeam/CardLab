import {Application, ApplicationOptions} from 'pixi.js';
import * as PIXI from 'pixi.js';
import {DuelGameRegistry} from "./gameRegistry.ts";
import {DuelAssets} from "./assets.ts";
import {DuelMessaging} from "./messaging.ts";
import {Scene} from "./scene.ts";
import {WaitingScene} from "./WaitingScene.ts";
import {DuelController} from "./control/controller.ts";
import {duelLog, duelLogError, overlay as logOverlay} from "./log.ts";
import "pixi.js/math-extras";
import {registerUtilMixins} from "src/duel/util.ts";

function qualitySettings(): Partial<ApplicationOptions> {
    // Allow forcing the use of WebGL for testing purposes.
    const preference = localStorage.getItem("forceWebGL") === "true" ? "webgl" : undefined;
    if (preference !== undefined) {
        duelLog("Quality settings: WebGL forced by localStorage");
    }
    
    // Provide settings for known and supported mobile devices.
    if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
        // Antialiasing is very expensive on my Android device.
        // ...Which is odd, it has a Mali GPU which should support free MSAA.
        // Anyway, since phone screens usually have a high pixel density, 
        // the effect from AA seems very limited, and rendering at a high resolution seems
        // to do the trick. Further testing should be done with various devices.
        const resolution = Math.min(window.devicePixelRatio, 2);
        duelLog(`Quality settings: Mobile (aa=false, resolution=${resolution})`);
        return {
            antialias: false,
            resolution: resolution,
            preference
        };
    } else {
        // On desktop or unknown devices, we can afford to be a bit more generous.
        duelLog(`Quality settings: Desktop/Unknown (aa=true, resolution=${window.devicePixelRatio})`);
        return {
            antialias: true,
            resolution: window.devicePixelRatio,
            preference
        };
    }
}

export async function createDuel(parent: HTMLElement,
                                 registry: DuelGameRegistry,
                                 assets: DuelAssets,
                                 messaging: DuelMessaging) {
    
    const app = new Application();
    await app.init({
        backgroundColor: 0xffffff,
        ...qualitySettings(),
        eventMode: "passive",
        eventFeatures: {
            move: true,
            click: true
        },
        width: window.visualViewport!.width,
        height: window.visualViewport!.height
    });
    parent.appendChild(app.canvas)
    app.canvas.style.display = "block";

    return new DuelGame(app, registry, assets, messaging);
}

export class DuelGame {
    app: Application
    scene: Scene | null = null;
    controller: DuelController | null = null;

    testTimings: HTMLElement | null = null;

    constructor(app: Application,
                public registry: DuelGameRegistry,
                public assets: DuelAssets,
                public messaging: DuelMessaging) {
        this.app = app;
        (window as any).PIXI = PIXI;
        
        registerUtilMixins();

        // window.addEventListener("resize", () => this.resizeToWindow())
        window.visualViewport!.addEventListener("resize", () => this.resizeToWindow())
        this.resizeToWindow();

        // Make the stage react to pointer events so children can listen to global move events
        this.app.stage.eventMode = "static";

        this.switchScene(new WaitingScene(this));
        this.messaging.onMessageReceived = this.receiveMessage.bind(this);
        this.messaging.readyToReceive();

        // Development/Debug stuff
        this.testTimings = app.canvas.parentElement!.querySelector(".duel-test-timings");

        if (this.testTimings) {
            this.app.renderer.runners.postrender.add(this);
        }

        (window as any).__PIXI_DEVTOOLS__ = {
            pixi: PIXI,
            app: app,
        };
        Object.defineProperty(window, "duelScene", {
            get: () => this.scene
        });
    }

    fpsSamples = [] as number[];
    
    postrender() {
        if (this.testTimings) {
            this.fpsSamples.push(this.app.ticker.deltaMS);
            if (this.fpsSamples.length > 5) {
                this.fpsSamples.shift();
            }
            const avg = this.fpsSamples.reduce((a, b) => a + b, 0) / this.fpsSamples.length;
            this.testTimings!.textContent = (((1000)/avg).toFixed(0) + "FPS ("+ avg.toFixed(2) + "ms)");
        }
    }

    receiveMessage(m: DuelMessage) {
        if (this.controller !== null) {
            this.controller.receiveMessage(m);
        } else {
            if (m.type == "duelWelcome") {
                this.controller = new DuelController(this, m);
                this.controller.displayGameScene()

                // Debug only! hide the logging overlay once we've loaded the game.
                if (logOverlay) {
                    logOverlay.hide();
                }
            } else {
                duelLogError(`Received message ${m.type} before controller was initialized`, m);
            }
        }
    }

    switchScene(scene: Scene) {
        if (this.scene) {
            this.scene.end();
            this.app.stage.removeChild(this.scene);
        }
        this.scene = scene;
        this.app.stage.addChild(scene);
        this.scene.start();
    }

    resizeToWindow() {
        this.app.canvas.style.height = window.visualViewport!.height + "px"
        this.app.canvas.style.width = window.visualViewport!.width + "px"
        this.app.renderer.resize(window.visualViewport!.width, window.visualViewport!.height);

        this.app.stage.hitArea = this.app.screen;
        
        duelLog(`Resized to: ${this.app.canvas.width} ${this.app.canvas.height}`);
    }
}