import {Container, Graphics, Point, Rectangle, Text, Ticker} from "pixi.js";
import {GAME_WIDTH, GameScene} from "src/duel/game/GameScene.ts";
import {placeInRectCenter} from "src/duel/util.ts";
import {StateAnimation, StateAnimPlayer} from "src/duel/anim.ts";

type AnimProps = typeof SpellUseOverlay.prototype.animProps;

export enum SpellAction {
    USE,
    CANCEL
}

export class SpellUseOverlay extends Container {
    bg: Graphics
    confirmArea: Graphics
    confirmText: Text
    
    cancelArea: Graphics
    cancelText: Text
    
    animProps = {
        confirmAlpha: 0.5,
        cancelAlpha: 0.5
    };
    
    animator = new StateAnimPlayer<AnimProps>();
    
    confirmAnim = new StateAnimation<AnimProps>({
        maxTime: 0.1,
        neverEnd: true,
        update(time: number, state: AnimProps) {
            state.confirmAlpha = 0.5 + (time/this.maxTime)/2;
        }
    })
    
    cancelAnim = new StateAnimation<AnimProps>({
        maxTime: 0.1,
        neverEnd: true,
        update(time: number, state: AnimProps) {
            state.cancelAlpha = 0.5 + (time/this.maxTime)/2;
        }
    })
    
    chosenAction: SpellAction = SpellAction.CANCEL
    
    constructor(public scene: GameScene) {
        super();
        
        this.bg = new Graphics()
            .rect(-10000, -10000, 20000, 20000)
            .fill({ color: 0x000000, alpha: 0.65 });
        this.addChild(this.bg);
        
        const cbx = 20;
        const cby = 90;
        const cbw = GAME_WIDTH - 40;
        const cbh = 800;
        
        this.confirmArea = new Graphics()
            .rect(0, 0, cbw, cbh)
            .stroke({ color: 0xffffff, width: 12 })
        this.confirmArea.x = cbx;
        this.confirmArea.y = cby;
        this.addChild(this.confirmArea);
        
        this.confirmText = new Text({
            text: "Utiliser",
            style: {
                fontSize: 120,
                fill: 0xffffff,
                fontFamily: "Chakra Petch"
            }
        });
        placeInRectCenter(this.confirmText, new Rectangle(cbx, cby, cbw, cbh));
        this.addChild(this.confirmText);
        
        this.cancelArea = new Graphics()
            .rect(0, 0, cbw, 525)
            .stroke({ color: 0xffffff, width: 12 });
        this.cancelArea.x = cbx;
        this.cancelArea.y = cby + cbh + 50;
        this.addChild(this.cancelArea);
        
        this.cancelText = new Text({
            text: "Annuler",
            style: {
                fontSize: 80,
                fill: 0xffffff,
                fontFamily: "Chakra Petch"
            }
        });
        placeInRectCenter(this.cancelText, new Rectangle(cbx, cby + cbh + 50, cbw, 525));
        this.addChild(this.cancelText);
        
        this.visible = false;
        this.zIndex = 999;
        
        this.eventMode = "none";
        this.interactiveChildren = false;
        
        this.scene.game.app.ticker.add(this.tick, this);
        
        this.animator.register(this.confirmAnim);
        this.animator.register(this.cancelAnim);
    }
    
    show() {
        this.visible = true;
        this.chosenAction = SpellAction.CANCEL
        this.confirmAnim.start(true)
        this.cancelAnim.start(true)
        this.confirmAnim.time = 0.0
        this.cancelAnim.time = 0.0
    }
    
    updateSelectedPos(pos: Point) {
        this.chosenAction = pos.y >= this.cancelArea.y ? SpellAction.CANCEL : SpellAction.USE;
        this.cancelAnim.reverse = this.chosenAction !== SpellAction.CANCEL;
        this.confirmAnim.reverse = this.chosenAction !== SpellAction.USE;
    }
    
    tick(t: Ticker) {
        if (!this.visible) {
            return
        }
        
        const props = this.animator.apply(t.deltaMS/1000, this.animProps);
        this.confirmArea.alpha = props.confirmAlpha;
        this.cancelArea.alpha = props.cancelAlpha;
        
        this.confirmText.alpha = props.confirmAlpha;
        this.cancelText.alpha = props.cancelAlpha;
    }
    
    hide() {
        this.visible = false;
        this.confirmAnim.stop()
        this.cancelAnim.stop()
    }
}