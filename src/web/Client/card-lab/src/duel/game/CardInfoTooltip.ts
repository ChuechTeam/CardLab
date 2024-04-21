import {Container, Graphics, Point, Rectangle, Text, TextStyle, Ticker} from "pixi.js";
import {GameScene} from "src/duel/game/GameScene.ts";
import {placeInRectCenter} from "src/duel/util.ts";

const WIDTH = 330;
const HEIGHT = 200;

const NAME_TEXT_STYLE = new TextStyle({
    fill: 0x000000,
    fontFamily: "Chakra Petch",
    fontSize: 28,
})

const DESC_TEXT_STYLE = new TextStyle({
    fill: 0x000000,
    fontFamily: "Chakra Petch",
    fontSize: 20,
    wordWrap: true,
    wordWrapWidth: WIDTH - 5
})

const NAME_MAX_Y = 40;
const DESC_MIN_Y = 48;

export class CardInfoTooltip extends Container {
    bg: Graphics
    nameTxt: Text
    descriptionTxt: Text
    time: number = 0
    
    constructor(public scene: GameScene) {
        super();
        
        this.bg = new Graphics()
            .rect(0, 0, WIDTH, HEIGHT)
            .stroke({ width: 2, color: 0x000000 })
            .fill({ color: 0xffffff });
        this.addChild(this.bg);
        
        this.boundsArea = new Rectangle(0, 0, WIDTH, HEIGHT);
        this.pivot = new Point(WIDTH / 2, HEIGHT / 2);
        
        this.nameTxt = new Text({ style: NAME_TEXT_STYLE });
        this.descriptionTxt = new Text({ style: DESC_TEXT_STYLE });
        this.addChild(this.nameTxt);
        this.addChild(this.descriptionTxt);
        
        this.visible = false;
        
        this.scene.game.app.ticker.add(this.tick, this)
        this.on("destroyed", () => {
            this.scene.game.app.ticker.remove(this.tick, this)
        });
    }
    
    tick(t: Ticker) {
        if (this.visible) {
            this.time -= t.deltaMS/1000;
            if (this.time <= 0) {
                this.hide();
            }
        }
    }
    
    show(name: string, desc: string, time: number=1000) {
        this.visible = true;
        
        this.nameTxt.text = name;
        this.descriptionTxt.text = desc;
        this.time = time;
        
        this.layout();
    }
    
    hide() {
        this.visible = false;
        this.time = 0;
    }
    
    private layout() {
        placeInRectCenter(this.nameTxt, new Rectangle(0, 0, WIDTH, NAME_MAX_Y), true);
        placeInRectCenter(this.descriptionTxt, new Rectangle(0, DESC_MIN_Y, WIDTH, HEIGHT - DESC_MIN_Y), true);
    }
}