﻿import type {DuelGame} from "../duel.ts";
import {Point} from "pixi.js";
import {GameScene} from "../game/GameScene.ts";
import {duelLog} from "../log.ts";

// right now there isn't much point in differentiating the two
export type LocalDuelPlayerState = NetDuelPlayerState

function toLocalIndex(idx: NetDuelPlayerIndex): LocalDuelPlayerIndex {
    return idx === "p1" ? 0 : 1
}

function toLocalPos(pos: NetDuelGridVec): Point {
    return new Point(pos.x, pos.y)
}

export class LocalDuelState {
    players: LocalDuelPlayerState[]
    turn: number
    whoseTurn: LocalDuelPlayerIndex
    units = new Map<DuelUnitId, LocalDuelUnit>()
    cards = new Map<DuelCardId, LocalDuelCard>()

    constructor(state?: NetDuelState | null) {
        if (state) {
            this.players = [state.player1, state.player2];
            this.turn = state.turn;
            this.whoseTurn = toLocalIndex(state.whoseTurn);

            for (const [id, unit] of Object.entries(state.units)) {
                const numId = Number(id);
                this.units.set(numId, new LocalDuelUnit(unit));
            }

            for (const hidId of state.hiddenCards) {
                this.cards.set(hidId, new UnknownLocalDuelCard(hidId));
            }
            for (const [id, card] of Object.entries(state.knownCards)) {
                const numId = Number(id)
                if (card.type === "unit") {
                    this.cards.set(numId, new LocalUnitDuelCard(card));
                } else {
                    throw new Error(`Unknown card type: ${card.type}`)
                }
            }

        } else {
            this.players = [];
            this.turn = 0;
            this.whoseTurn = 0;
        }
    }

    get isEmpty() {
        return this.players.length == 0;
    }
}

export type LocalDuelCard =
    | LocalUnitDuelCard
    | UnknownLocalDuelCard

export class UnknownLocalDuelCard {
    type: "unknown"
    id: number

    constructor(id: number) {
        this.type = "unknown"
        this.id = id
    }
}

export abstract class KnownLocalDuelCard {
    type: DuelCardType
    id: number
    defAssetRef: CardAssetRef
    location: DuelCardLocation

    protected constructor(card: NetDuelCard) {
        this.type = card.type;
        this.id = card.id;
        this.defAssetRef = card.baseDefRef;
        this.location = card.location;
    }
}

export class LocalUnitDuelCard extends KnownLocalDuelCard {
    type: "unit"
    stats: {
        attack: number
        health: number
    }

    constructor(card: NetUnitDuelCard) {
        super(card);
        if (card.type !== "unit") {
            throw new Error("Invalid card type")
        }
        this.type = "unit";
        this.stats = card.stats;
    }
}

export class LocalDuelUnit {
    id: DuelUnitId
    originRef: CardAssetRef
    owner: LocalDuelPlayerIndex
    attributes: NetDuelUnitAttributes
    position: Point

    constructor(unit: NetDuelUnit) {
        this.id = unit.id;
        this.originRef = unit.originRef;
        this.owner = toLocalIndex(unit.owner);
        this.attributes = unit.attribs;
        this.position = toLocalPos(unit.position);
    }
}

export class DuelController {
    state: LocalDuelState = new LocalDuelState()
    playerIndex: LocalDuelPlayerIndex
    scene: GameScene

    constructor(public game: DuelGame, welcomeMsg: Extract<DuelMessage, { type: "duelWelcome" }>) {
        duelLog("Creating DuelController from welcome message", welcomeMsg)
        this.state = new LocalDuelState(welcomeMsg.state);

        if (welcomeMsg.player == "p1") {
            this.playerIndex = 0;
        } else {
            this.playerIndex = 1;
        }

        this.scene = new GameScene(this.game, this.playerIndex);
    }
    
    displayGameScene() {
        if (this.game.scene !== this.scene) {
            this.game.switchScene(this.scene);
        }
    }

    receiveMessage(msg: DuelMessage) {
        if (msg.type === "duelWelcome") {

        }
    }
}