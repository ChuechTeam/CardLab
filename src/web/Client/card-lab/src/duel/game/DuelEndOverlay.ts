import {ColorSource, Container, Graphics, Rectangle, Text} from "pixi.js";
import {GAME_HEIGHT, GAME_WIDTH, GameScene} from "src/duel/game/GameScene.ts";
import {placeInRectCenter} from "src/duel/util.ts";
import {duelLogError} from "src/duel/log.ts";

export class DuelEndOverlay extends Container {
    bg: Graphics

    middleBanner: Graphics
    middleRect: Rectangle
    outcomeText: Text
    easterEggText: Text

    constructor(public scene: GameScene) {
        super();

        this.bg = new Graphics()
            .rect(-10000, -10000, 20000, 20000)
            .fill({color: 0x000000, alpha: 0.8});
        this.addChild(this.bg);

        this.middleBanner = new Graphics()
            .rect(0, 0, 10000, 400)
            .fill({color: 0xffffff})
        this.middleBanner.x = -5000;
        this.middleBanner.y = (GAME_HEIGHT - this.middleBanner.height) / 2;
        this.addChild(this.middleBanner);

        this.middleRect = new Rectangle(40, this.middleBanner.y, 
            GAME_WIDTH-80, this.middleBanner.height);

        this.outcomeText = new Text({
            style: {
                fontFamily: "Chakra Petch",
                fontSize: 120,
                fill: 0xffffff
            }
        });
        this.addChild(this.outcomeText);
        
        this.easterEggText = new Text({
            style: {
                fontFamily: "Chakra Petch",
                fontSize: 40,
                fill: 0xffffff
            }
        });
        this.easterEggText.visible = Math.random() <= 0.01;
        this.addChild(this.easterEggText);
        
        this.zIndex = 99999; // absolutely fool-proof
        
        this.hitArea = new Rectangle(0, 0, 10000, 10000);
        this.eventMode = "static";
        this.visible = false;
    }

    show(outcome: "win" | "lose" | "terminated") {
        let color: ColorSource
        let txt: string
        let easterEgg: string = ""
        switch (outcome) {
            case "win":
                color = 0x004395;
                txt = "Victoire !";
                easterEgg = "GG EZ";
                break;
            case "lose":
                color = 0xa00000;
                txt = "Défaite !";
                easterEgg = "Pas de bol...";
                break;
            case "terminated":
                color = 0x111111;
                txt = "Partie terminée.";
                break;
            default:
                duelLogError(`Invalid outcome: ${outcome}`);
                return;
        }

        this.visible = true;

        this.middleBanner.tint = color
        this.outcomeText.text = txt
        this.easterEggText.text = easterEgg

        placeInRectCenter(this.outcomeText, this.middleRect, true)
        placeInRectCenter(this.easterEggText, this.middleRect, true)
        this.easterEggText.y += 400;
    }
    
    hide() {
        this.visible = false;
    }
}