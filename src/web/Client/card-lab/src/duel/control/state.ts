import {Point} from "pixi.js";
import {Card} from "../game/Card.ts";

// right now there isn't much point in differentiating the two
export type LocalDuelPlayerState = NetDuelPlayerState
export type LocalPlayerPair<T> = [T, T]

export function toLocalIndex(idx: NetDuelPlayerIndex): LocalDuelPlayerIndex {
    return idx === "p1" ? 0 : 1
}

export function toLocalPos(pos: NetDuelGridVec): Point {
    return new Point(pos.x, pos.y)
}

// i just spent 10 whole minutes figuring out typescript's type system to make this work
function toLocalPlayerPair<T>(pair: NetPlayerPair<T>): LocalPlayerPair<T>
function toLocalPlayerPair<T, U>(pair: NetPlayerPair<T>, transform: (v: T) => U): LocalPlayerPair<U>
function toLocalPlayerPair<T>(pair: NetPlayerPair<T>, transform?: (v: T) => any) {
    if (transform) {
        return [transform(pair.p1), transform(pair.p2)]
    } else {
        return [pair.p1, pair.p2]
    }
}

export class LocalDuelState {
    players: LocalDuelPlayerState[]
    turn: number
    whoseTurn: LocalDuelPlayerIndex
    units = new Map<DuelUnitId, LocalDuelUnit>()
    cards = new Map<DuelCardId, LocalDuelCard>()
    status: DuelStatus

    constructor(state: NetDuelState) {
        this.players = [state.player1, state.player2];
        this.turn = state.turn;
        this.whoseTurn = toLocalIndex(state.whoseTurn);
        this.status = state.status;

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
    }
    
    updateTurn(turn: number, whoseTurn: NetDuelPlayerIndex) {
        this.turn = turn;
        this.whoseTurn = toLocalIndex(whoseTurn);
    }
    
    revealCards(cards: NetDuelCard[]) {
        for (const card of cards) {
            const locCard = new LocalUnitDuelCard(card,
                this.cards.get(card.id)?.avatar ?? null);
            this.cards.set(card.id, locCard)
        }
    }
    
    hideCards(cards: DuelCardId[]) {
        for (const id of cards) {
            const card = this.cards.get(id);
            if (card && !(card instanceof UnknownLocalDuelCard)) {
                this.cards.set(id, new UnknownLocalDuelCard(id, card.avatar));
            }
        }
    }
}

export type LocalDuelCard =
    | LocalUnitDuelCard
    | UnknownLocalDuelCard

export class UnknownLocalDuelCard {
    type: "unknown"
    id: number

    constructor(id: number, public avatar: Card | null = null) {
        this.type = "unknown"
        this.id = id
    }
}

export abstract class KnownLocalDuelCard {
    type: DuelCardType
    id: number
    defAssetRef: CardAssetRef
    location: DuelCardLocation

    protected constructor(card: NetDuelCard, public avatar: Card | null = null) {
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

    constructor(card: NetUnitDuelCard, avatar: Card | null = null) {
        super(card, avatar);
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
    alive: boolean = true // dead units are removed on at the start of the next mutation

    constructor(unit: NetDuelUnit) {
        this.id = unit.id;
        this.originRef = unit.originRef;
        this.owner = toLocalIndex(unit.owner);
        this.attributes = unit.attribs;
        this.position = toLocalPos(unit.position);
    }
}

export class LocalDuelPropositions {
    card = new Map<DuelCardId, LocalDuelCardPropositions>()
    unit = new Map<DuelUnitId, LocalDuelUnitPropositions>()

    constructor(props: NetDuelPropositions) {
        for (let p of props.card) {
            this.card.set(p.cardId, new LocalDuelCardPropositions(p));
        }
        for (let p of props.unit) {
            this.unit.set(p.unitId, new LocalDuelUnitPropositions(p));
        }
    }
}

export class LocalDuelCardPropositions {
    cardId: DuelCardId
    requirement: DuelCardRequirement
    allowedSlots: LocalPlayerPair<Point[]>
    allowedCores: LocalPlayerPair<boolean>

    constructor(props: NetDuelCardPropositions) {
        this.cardId = props.cardId
        this.requirement = props.requirement
        this.allowedSlots = toLocalPlayerPair(props.allowedSlots, x => x.map(toLocalPos))
        this.allowedCores = toLocalPlayerPair(props.allowedCores)
    }
}

export class LocalDuelUnitPropositions {
    unitId: DuelUnitId
    allowedUnits: DuelUnitId[]
    allowedCores: LocalPlayerPair<boolean>

    constructor(props: NetDuelUnitPropositions) {
        this.unitId = props.unitId;
        this.allowedUnits = props.allowedUnits;
        this.allowedCores = toLocalPlayerPair(props.allowedCores);
    }
}