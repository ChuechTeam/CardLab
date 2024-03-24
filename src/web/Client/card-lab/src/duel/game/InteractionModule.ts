import {EventEmitter, Ticker} from "pixi.js";
import {GameScene} from "src/duel/game/GameScene.ts";
import {Card} from "src/duel/game/Card.ts";
import {LocalDuelArenaPosition, LocalDuelCardPropositions} from "src/duel/control/state.ts";
import {RequestResult} from "src/duel/messaging.ts";
import {duelLogWarn} from "src/duel/log.ts";
import {DuelController} from "src/duel/control/controller.ts";

const PREVIEW_HOVER_TIME = 300;

export enum InteractionType {
    IDLE,
    DRAGGING_CARD,
    ENDING_TURN,
}

export enum InteractionState {
    IDLE,
    RUNNING,
    WAITING_RESPONSE,
}

export type InteractionData = {
    type: InteractionType.DRAGGING_CARD,
    card: Card,
    propositions: LocalDuelCardPropositions
} | {
    type: InteractionType.ENDING_TURN
} | {
    type: InteractionType.IDLE
}
export type InteractionDataOf<T extends InteractionType> = Extract<InteractionData, {type: T}>

type InteractionSubmitTypes = {
    [InteractionType.IDLE]: never
    [InteractionType.ENDING_TURN]: any
    [InteractionType.DRAGGING_CARD]: {
        slots: LocalDuelArenaPosition[],
        entities: number[]
    } // todo
}

type LaunchInteractionTypes = InteractionType.ENDING_TURN;

// Contains a main active interaction (that usually sends requests to the server)
// and other secondaries interactions 
export class InteractionModule extends EventEmitter<{
    start: [InteractionType, InteractionData, number],
    stop: [InteractionType, InteractionData, number, boolean],
    block: [],
    unblock: []
}> {
    type: InteractionType = InteractionType.IDLE
    data: InteractionData = { type: InteractionType.IDLE }
    state: InteractionState = InteractionState.IDLE
    id: number = -1
    
    hoveringHandId: number = -1 // The pointer id hovering the hand (so we don't have multitouch issues) 
    hoveringTimer: number = 0.0 // The amount of milliseconds where the pointer was hovering one single card
    hoveringPreview: boolean = false // Whether card previews should be shown
    hoveredCard: Card | null = null // The currently hovered card
    
    blocked: boolean = false // Whether all interactions are blocked
    
    private idCounter = 0;
    
    constructor(public scene: GameScene) {
        super();
        scene.game.app.ticker.add(this.tick, this);
    }
    
    private get controller() {
        return this.scene.game.controller!;
    }
    
    canStart() {
        return this.state === InteractionState.IDLE && !this.blocked;
    }
    
    canSubmit<T extends InteractionType>(type: T, submitData: InteractionSubmitTypes[T]) {
        switch (type) {
            case InteractionType.IDLE:
                return false;
            case InteractionType.DRAGGING_CARD:
                const data = this.data as InteractionDataOf<InteractionType.DRAGGING_CARD>
                return this.controller.canUseCardProposition(data.propositions.cardId, 
                    submitData.slots, submitData.entities);
            case InteractionType.ENDING_TURN:
                return this.controller.canEndTurn;
        }
    }
    
    canLaunch<T extends LaunchInteractionTypes>(type: T, submitData: InteractionSubmitTypes[T]) {
        return this.canStart() && this.canSubmit(type, submitData);
    } 
    
    start<T extends InteractionType>(type: T, data: Omit<InteractionDataOf<T>, "type">): number {
        if (this.state !== InteractionState.IDLE) {
            throw new Error("Cannot start interaction while another is running")
        }
        if (this.blocked) {
            throw new Error("Cannot start interaction while they are blocked");
        }
        
        this.type = type
        this.state = InteractionState.RUNNING
        this.data = { type, ...data } as any; // trust
        this.id = this.idCounter++
        this.emit("start", this.type, this.data, this.id)
        
        return this.id
    }
    
    submit<T extends InteractionType>(type: T, submitData: InteractionSubmitTypes[T]) {
        if (type !== this.type) {
            throw new Error(`type mismatch: ${type} != ${this.type}`);
        }
        
        if (!this.canSubmit(type, submitData)) {
            throw new Error(`Can't submit request ${type}.`);
        }

        const send = () => {
            const controller = this.scene.game.controller!;
            
            switch (type) {
                case InteractionType.DRAGGING_CARD:
                    const data = this.data as InteractionDataOf<InteractionType.DRAGGING_CARD> 
                    return controller.useCardProposition(data.propositions.cardId, submitData.slots, submitData.entities)
                case InteractionType.ENDING_TURN:
                    return controller.endTurn();
                default:
                    throw new Error(`Unsupported type: ${type}`)
            }
        }
        send().then(result => {
            if (result.status === "ok") {
                this.stop(false)
            } else {
                const err = result.status === "error" ? result.message : "";
                duelLogWarn(`Request ended unexpectedly during interaction: status=${result.status}: ${err}`);
                this.stop(true)
            }
        })
        this.state = InteractionState.WAITING_RESPONSE;
    }
    
    // Instantly start and submit an interaction.
    launch<T extends LaunchInteractionTypes>(type: T, submitData: InteractionSubmitTypes[T]): number {
        this.start(type, {} as any);
        try {
            this.submit(type, submitData);
        } catch (e) {
            this.stop(true);
            throw e;
        }
        return this.id;
    }
    
    stop(cancel: boolean) {
        if (this.state !== InteractionState.IDLE) {
            const type = this.type,
                data = this.data, 
                id = this.id;
            
            this.type = InteractionType.IDLE
            this.state = InteractionState.IDLE
            this.id = -1;
            this.emit("stop", type, data, id, cancel)
        }
    }
    
    tick(t: Ticker) {
        if (this.hoveredCard !== null && !this.hoveringPreview) {
            this.hoveringTimer += t.deltaMS;
            if (this.hoveringTimer >= PREVIEW_HOVER_TIME) {
                this.enableHandHoverPreview();
            }
        }
    }
    
    block() {
        if (!this.blocked) {
            this.stop(true);
            this.endHandHover();
            
            this.blocked = true;
            this.emit("block");
        }
    }
    
    unblock() {
        if (this.blocked) {
            this.blocked = false;
            this.emit("unblock");
        }
    }
    
    /*
     * Card hand hovering
     */
    
    beginHandHover(id: number, card: Card) {
        if (this.hoveringHandId !== -1) {
            throw new Error("Hand hovering already happening")
        }
        
        this.hoveringHandId = id;
        this.switchHandHoverCard(card);
    }
    
    switchHandHoverCard(card: Card | null) {
        this.hoveredCard = card;
        this.hoveringTimer = 0.0;
        if (card && this.hoveringPreview) {
            this.scene.cardPreviewOverlay.show({type: card.visual.type, ...card.visual.data} as any);
        } else {
            this.scene.cardPreviewOverlay.hide();
        }
    }
    
    enableHandHoverPreview() {
        this.hoveringPreview = true;
        this.switchHandHoverCard(this.hoveredCard);
    }
    
    endHandHover() {
        if (this.hoveringHandId === -1) {
            return;
        }
        
        const hoveredCard = this.hoveredCard;
        
        this.switchHandHoverCard(null);
        this.hoveringHandId = -1;
        this.hoveredCard = null;
        this.hoveringTimer = 0.0;
        this.hoveringPreview = false;
        
        if (hoveredCard) {
            // Then the card didn't initiate this action! Notify it to go back.
            hoveredCard.cancelHover();
        }
    }
}