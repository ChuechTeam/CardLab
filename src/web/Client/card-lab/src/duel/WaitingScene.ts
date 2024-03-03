import {Scene} from "./scene.ts";
import {DuelGame} from "./duel.ts";
import * as PIXI from 'pixi.js';
import {GameScene} from "./game/GameScene.ts";

export class WaitingScene extends Scene {
    constructor(game: DuelGame) {
        super(game);

        const text = new PIXI.Text("Connexion en cours...", {
            fontFamily: "Chakra Petch"
        });
        text.x = 50;
        text.y = 50;
        this.addChild(text);
        
        this.eventMode = "static"
        this.on("pointermove", e => {
            const position = e.global;
            text.text = `Pos = (${position.x}, ${position.y})`
        })
        this.on("pointerdown", e => {
            this.game.switchScene(new GameScene(this.game, 1));
        })
        
        const updateHA = () => {
            // very good solution
            this.hitArea = new PIXI.Rectangle(0, 0,
                this.game.app.screen.width,
                this.game.app.screen.height);
        }
        
        updateHA();
        this.game.app.renderer.on("resize", updateHA)
    }
}