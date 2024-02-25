import {Application, Sprite, Assets, Texture} from 'pixi.js';
import {DuelGameRegistry} from "./gameRegistry.ts";
import {DuelGamePack} from "./gamePack.ts";
import {DuelAssets} from "./assets.ts";
import {DuelMessaging} from "./messaging.ts";
import {Scene} from "./scenes/scene.ts";
import {WaitingScene} from "./scenes/WaitingScene.ts";
import {DuelController} from "./control/controller.ts";

export class DuelGame {
    app: Application
    scene: Scene | null = null;
    controller: DuelController;
    
    constructor(parent: HTMLElement,
                public registry: DuelGameRegistry, 
                public assets: DuelAssets,
                public messaging: DuelMessaging) {
        this.app = new Application({
            width: 720,
            height: 1280,
            backgroundColor: 0x1099bb,
            resolution: window.devicePixelRatio || 1,
        });
        parent.appendChild(this.app.view as any);
        
        this.switchScene(new WaitingScene(this));
        this.controller = new DuelController(this);
        this.messaging.onMessageReceived = m => this.controller.receiveMessage(m);
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
}