import {Application, Sprite, Assets, Texture, TextMetrics} from 'pixi.js';
import * as PIXI from 'pixi.js';
import {DuelGameRegistry} from "./gameRegistry.ts";
import {DuelGamePack} from "./gamePack.ts";
import {DuelAssets} from "./assets.ts";
import {DuelMessaging} from "./messaging.ts";
import {Scene} from "./scene.ts";
import {WaitingScene} from "./WaitingScene.ts";
import {DuelController} from "./control/controller.ts";
import "./pixiExt.ts"; // Make sure our extensions are loaded

export class DuelGame {
    app: Application
    scene: Scene | null = null;
    controller: DuelController | null = null;

    constructor(parent: HTMLElement,
                public registry: DuelGameRegistry,
                public assets: DuelAssets,
                public messaging: DuelMessaging) {
        // Configure PIXI first
        TextMetrics.experimentalLetterSpacing = true
        
        this.app = new Application({
            backgroundColor: 0xffffff,
            antialias: true,
            resolution: Math.min(window.devicePixelRatio, 2),
            eventMode: "passive",
            eventFeatures: {
                move: true,
                click: true
            },
            width: window.visualViewport!.width,
            height: window.visualViewport!.height
        });
        parent.appendChild(this.app.view as any);
        (this.app.view.style as any).display = "block";
        
        window.addEventListener("resize", () => this.resizeToWindow())
        this.resizeToWindow();
        
        // Make the stage react to pointer events so children can listen to global move events
        this.app.stage.eventMode = "static";

        this.switchScene(new WaitingScene(this));
        this.messaging.onMessageReceived = this.receiveMessage.bind(this);

        (window as any).PIXI = PIXI;
    }

    receiveMessage(m: DuelMessage) {
        if (this.controller !== null) {
            this.controller.receiveMessage(m);
        } else {
            if (m.type == "duelWelcome") {
                this.controller = new DuelController(this, m);
                this.controller.displayGameScene()
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
        this.app.renderer.view.style!.height = window.visualViewport!.height + "px"
        this.app.renderer.view.style!.width = window.visualViewport!.width + "px"
        this.app.renderer.resize(window.visualViewport!.width, window.visualViewport!.height);

        this.app.stage.hitArea = this.app.screen;
    }
}