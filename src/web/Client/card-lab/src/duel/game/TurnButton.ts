import {Container, Graphics, Rectangle, Text} from "pixi.js";
import {GameScene} from "./GameScene.ts";
import {placeInRectCenter} from "../util.ts";
import {InteractionData, InteractionType} from "src/duel/game/InteractionModule.ts";
import {PulsatingRect} from "src/duel/game/PulsatingRect.ts";

const WIDTH = 250;
const HEIGHT = 80;

export enum TurnButtonState {
    AVAILABLE,
    WAITING,
    OPPONENT_TURN
}

export class TurnButton extends Container {
    bg: Graphics;
    text: Text;
    
    state: TurnButtonState = TurnButtonState.AVAILABLE;
    preInteractionState = TurnButtonState.AVAILABLE;
    interactionId = -1
    #onlyOption: boolean = false;
    
    pulsatingRect: PulsatingRect

    constructor(public scene: GameScene) {
        super();

        this.bg = new Graphics().rect(0, 0, WIDTH, HEIGHT).fill({color: 0xaaaaaa});
        this.addChild(this.bg);

        this.text = new Text({
            text: "Terminer le tour", style: {
                fontFamily: "Chakra Petch",
                fontSize: 24,
                fill: 0x000000
            }
        });
        placeInRectCenter(this.text, new Rectangle(0, 0, WIDTH, HEIGHT));
        this.addChild(this.text);
        
        this.pulsatingRect = new PulsatingRect(scene, {
            innerWidth: WIDTH,
            innerHeight: HEIGHT,
            color: "#3640ff",
            interval: 3.0,
            distance: 20,
            thickness: 4,
            pulseTime: 0.6,
            endThicknessScale: 0.5
        });
        this.addChild(this.pulsatingRect);
        
        this.pivot.set(WIDTH / 2, HEIGHT / 2);
        
        this.eventMode = "static";
        this.hitArea = new Rectangle(0, 0, WIDTH, HEIGHT);
        this.on("pointertap", async () => {
            if (this.state === TurnButtonState.AVAILABLE) {
                await this.trigger();
            }
        });
        
        this.listen(this.scene.interaction, "stop", this.onInteractionEnd)
    }
    
    switchState(newState: TurnButtonState) {
        this.state = newState;
        if (newState === TurnButtonState.AVAILABLE) {
            this.text.text = "Terminer le tour";
            this.alpha = 1;
            placeInRectCenter(this.text, new Rectangle(0, 0, WIDTH, HEIGHT));
        } else if (newState === TurnButtonState.WAITING) {
            // no visible change, but further clicks don't do anything
        } else {
            this.text.text = "Tour de l'adversaire";
            placeInRectCenter(this.text, new Rectangle(0, 0, WIDTH, HEIGHT));
            this.alpha = 0.4;
        }

        this.updateRectPulse()
    }
    
    async trigger() {
        if (this.scene.interaction.canLaunch(InteractionType.ENDING_TURN, null)) {
            this.interactionId = this.scene.interaction.launch(InteractionType.ENDING_TURN, null);
            this.preInteractionState = this.state;
            this.switchState(TurnButtonState.WAITING);
        }
    }
    
    onInteractionEnd(type: InteractionType, data: InteractionData, id: number, cancel: boolean) {
        if (id === this.interactionId) {
            this.state = this.preInteractionState;
            this.interactionId = -1;
        }
    }
    
    get onlyOption() {
        return this.#onlyOption
    }
    
    set onlyOption(v: boolean) {
        this.#onlyOption = v;
        this.updateRectPulse()
    }
    
    updateRectPulse() {
        if (this.#onlyOption && this.state === TurnButtonState.AVAILABLE) {
            this.pulsatingRect.startPeriodic()
        } else {
            this.pulsatingRect.endPeriodic()
        }
    }
}