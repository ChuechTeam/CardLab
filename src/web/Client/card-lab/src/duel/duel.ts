import {Application, BitmapText} from 'pixi.js';
import * as PIXI from 'pixi.js';
import {DuelGameRegistry} from "./gameRegistry.ts";
import {DuelAssets} from "./assets.ts";
import {DuelMessaging} from "./messaging.ts";
import {Scene} from "./scene.ts";
import {WaitingScene} from "./WaitingScene.ts";
import {DuelController} from "./control/controller.ts";
import "./pixiExt.ts"; // Make sure our extensions are loaded
import {overlay as logOverlay} from "./log.ts";

export async function createDuel(parent: HTMLElement,
                                 registry: DuelGameRegistry,
                                 assets: DuelAssets,
                                 messaging: DuelMessaging) {
    const app = new Application();
    await app.init({
        backgroundColor: 0xffffff,
        antialias: true,
        resolution: Math.min(window.devicePixelRatio, 2),
        eventMode: "passive",
        eventFeatures: {
            move: true,
            click: true
        },
        width: window.visualViewport!.width,
        height: window.visualViewport!.height,
    });
    parent.appendChild(app.canvas)
    app.canvas.style.display = "block";

    return new DuelGame(app, registry, assets, messaging);
}

export class DuelGame {
    app: Application
    scene: Scene | null = null;
    controller: DuelController | null = null;

    fpsCounter: BitmapText

    constructor(app: Application,
                public registry: DuelGameRegistry,
                public assets: DuelAssets,
                public messaging: DuelMessaging) {
        this.app = app;
        (window as any).PIXI = PIXI;

        window.addEventListener("resize", () => this.resizeToWindow())
        this.resizeToWindow();

        // Make the stage react to pointer events so children can listen to global move events
        this.app.stage.eventMode = "static";

        this.switchScene(new WaitingScene(this));
        this.messaging.onMessageReceived = this.receiveMessage.bind(this);
        this.messaging.readyToReceive();

        this.fpsCounter = new BitmapText({text: "0", style: {fontFamily: "ChakraPetchDigits", fontSize: 24,
            fill: 0x000000}});
        this.fpsCounter.tint = 0x0033AA;
        this.fpsCounter.x = 8
        this.fpsCounter.y = 8
        
        this.app.ticker.add(t => this.fpsCounter.text = Math.round(t.FPS).toString())
        
        this.app.stage.addChild(this.fpsCounter);
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
                console.error("Received message before controller was initialized", m);
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
    }
}