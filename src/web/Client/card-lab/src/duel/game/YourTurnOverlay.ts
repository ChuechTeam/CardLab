import {Container, Graphics, Text, Ticker} from "pixi.js";
import {GAME_HEIGHT, GAME_WIDTH, GameScene} from "src/duel/game/GameScene.ts";
import {lerp} from "src/duel/util.ts";

const ENTRY_TIME = 0.25;
const STILL_TIME = 1.25;
const EXIT_TIME = 0.25;
export const YOUR_TURN_MAX_TIME = ENTRY_TIME + STILL_TIME + EXIT_TIME;

const BG_ALPHA = 0.8;

export class YourTurnOverlay extends Container {
    bg: Graphics
    text: Text

    time = 0.0
    active = false

    constructor(public scene: GameScene) {
        super();

        this.bg = new Graphics()
            .rect(0, 0, 10000, 10000)
            .fill({color: 0x000000});
        this.bg.position.set(-5000, -5000);
        this.bg.alpha = BG_ALPHA;
        this.addChild(this.bg);

        this.text = new Text({
            text: "À vous\nde jouer !",
            style: {
                fontFamily: "Chakra Petch",
                fontSize: 125,
                fill: 0xffffff,
                wordWrapWidth: GAME_WIDTH - 150,
                wordWrap: true,
                align: "center"
            },
            resolution: scene.game.app.renderer.resolution * 1.5
        });
        this.text.pivot.set(this.text.width / 2, this.text.height / 2);
        this.text.x = GAME_WIDTH/2;
        this.text.y = GAME_HEIGHT/2;
        this.addChild(this.text);

        this.visible = false;

        this.scene.game.app.ticker.add(this.tick, this);
        this.on("destroyed", () => this.scene.game.app.ticker.remove(this.tick, this));
        
        this.zIndex = 500;
    }

    show() {
        this.time = 0;
        this.text.alpha = 1;
        this.text.scale = 1;
        this.bg.alpha = 1;
        this.active = true;
        this.visible = true;
    }

    tick(ticker: Ticker) {
        if (!this.active) {
            return;
        }

        this.time += ticker.deltaMS / 1000;
        if (this.time >= YOUR_TURN_MAX_TIME) {
            this.hide();
            return;
        }
        
        if (this.time < ENTRY_TIME) {
            this.bg.alpha = lerp(0, BG_ALPHA, this.time/ENTRY_TIME);
            this.text.alpha = lerp(0, 1, this.time/ENTRY_TIME)
            this.text.scale = lerp(1.5, 1, this.time/ENTRY_TIME);
        } else if (this.time < ENTRY_TIME + STILL_TIME) {
            this.text.alpha = 1;
            this.text.scale.set(1);
        } else {
            const t = (this.time-ENTRY_TIME-STILL_TIME);
            this.text.alpha = lerp(1, 0, t/EXIT_TIME);
            this.text.scale = lerp(1, 0.7, t/EXIT_TIME);
            this.bg.alpha = lerp(BG_ALPHA, 0, t/ENTRY_TIME);
        }
    }

    hide() {
        this.active = false;
        this.visible = false;
    }
}