import {Point} from "pixi.js";
import {Card} from "../game/Card.ts";
import {duelLogError, duelLogWarn} from "src/duel/log.ts";

export type LocalPlayerPair<T> = [T, T]
export type LocalDuelArenaPosition = { player: LocalDuelPlayerIndex, vec: Point }
export type LocalEntity
    = LocalDuelUnit
    | LocalDuelCard
    | LocalDuelPlayerState

export function toLocalIndex(idx: NetDuelPlayerIndex): LocalDuelPlayerIndex {
    return idx === "p1" ? 0 : 1
}

export function toLocalVec(vec: NetDuelGridVec): Point {
    return new Point(vec.x, vec.y)
}

export function toLocalPos(pos: NetDuelArenaPosition): LocalDuelArenaPosition {
    return {player: toLocalIndex(pos.player), vec: toLocalVec(pos.vec)}
}

export function toNetPos(pos: LocalDuelArenaPosition): NetDuelArenaPosition {
    return {player: pos.player === 0 ? "p1" : "p2", vec: {x: pos.vec.x, y: pos.vec.y}}
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

export function toLocalCard(net: NetDuelCard): LocalDuelCard {
    return new KnownLocalDuelCard(net)
}

export function stateSnapshot<T>(state: T): T {
    if (state instanceof KnownLocalDuelCard) {
        return new KnownLocalDuelCard(state) as T;
    } else {
        return structuredClone(state);
    }
}

export enum DuelEntityType {
    PLAYER = 0,
    CARD = 1,
    UNIT = 2,
    MODIFIER = 3
}

export class LocalDuelState {
    players: LocalDuelPlayerState[]
    turn: number
    whoseTurn: LocalDuelPlayerIndex
    units = new Map<DuelUnitId, LocalDuelUnit>()
    cards = new Map<DuelCardId, LocalDuelCard>()
    status: DuelStatus
    winner: LocalDuelPlayerIndex | null

    constructor(state: NetDuelState) {
        this.players = [state.player1, state.player2].map(x => new LocalDuelPlayerState(x));
        this.winner = state.winner !== null ? toLocalIndex(state.winner) : null;
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
            this.cards.set(numId, new KnownLocalDuelCard(card));
        }
        
        this.populateUnknownCardsLoc()
    }

    findEntity(id: number): LocalEntity | undefined {
        const type = id & 0b1111;
        if (type === DuelEntityType.UNIT) {
            return this.units.get(id);
        } else if (type === DuelEntityType.CARD) {
            return this.cards.get(id);
        } else if (type === DuelEntityType.PLAYER) {
            return this.players[id >> 4];
        } else {
            return undefined;
        }
    }

    updateTurn(turn: number, whoseTurn: NetDuelPlayerIndex) {
        this.turn = turn;
        this.whoseTurn = toLocalIndex(whoseTurn);
    }

    revealCards(cards: NetDuelCard[]) {
        for (const card of cards) {
            const locCard = toLocalCard(card);
            this.cards.set(card.id, locCard)
        }
    }

    hideCards(cards: DuelCardId[]) {
        for (const id of cards) {
            const card = this.cards.get(id);
            if (card && !(card instanceof UnknownLocalDuelCard)) {
                this.cards.set(id, new UnknownLocalDuelCard(id));
            }
        }
    }

    moveCard(cardId: DuelCardId, location: DuelCardLocation, index: number | null) {
        const card = this.cards.get(cardId);
        if (card) {
            const prev = card.location;
            const list = this.locToArray(prev);
            if (list) {
                list.splice(list.indexOf(cardId), 1)
            }
            card.location = location;
            this.locToArray(location)?.splice(index ?? 0, 0, cardId)
        } else {
            duelLogWarn(`Card not found during moveCard! (id=${cardId}, loc=${location}, idx=${index})`)
        }
    }

    createUnit(unit: NetDuelUnit) {
        const u = new LocalDuelUnit(unit);
        this.units.set(unit.id, u);
        this.players[u.position.player].setUnitAt(u.position.vec.x, u.position.vec.y, u.id)
    }
    
    createCard(id: number) {
        const card = new UnknownLocalDuelCard(id);
        this.cards.set(id, card);
    }

    markUnitDead(unitId: DuelUnitId) {
        const unit = this.units.get(unitId);
        if (unit) {
            unit.alive = false
        }
    }

    removeDeadUnits() {
        for (let [id, unit] of this.units) {
            if (!unit.alive) {
                const player = this.players[unit.position.player]
                this.units.delete(id)
                for (let i = 0; i < player.units.length; i++) {
                    if (player.units[i] === id) {
                        player.units[i] = null;
                        break
                    }
                }
            }
        }
    }

    updateAttribs(entityId: number, attribs: NetAttributeSet) {
        const entity = this.findEntity(entityId);
        if (entity === undefined) {
            throw new Error(`Entity not found: ${entityId}`)
        }

        // Merge attributes into the entity.
        Object.assign(entity.attribs, attribs)

        return entity;
    }
    
    populateUnknownCardsLoc() {
        for (let player of this.players) {
            for (let id of player.hand) {
                const card = this.cards.get(id);
                if (card instanceof UnknownLocalDuelCard) {
                    card.location = player.index === 0 ? "handP1" : "handP2";
                }
            }
            for (let id of player.deck) {
                const card = this.cards.get(id);
                if (card instanceof UnknownLocalDuelCard) {
                    card.location = player.index === 0 ? "deckP1" : "deckP2";
                }
            }
        }
    }

    locToArray(location: DuelCardLocation): DuelCardId[] | null {
        switch (location) {
            case "deckP1":
                return this.players[0].deck
            case "deckP2":
                return this.players[1].deck
            case "handP1":
                return this.players[0].hand
            case "handP2":
                return this.players[1].hand
            case "discarded":
                return null
            case "temp":
                return null
        }
    }
}

export class LocalDuelPlayerState {
    index: number
    attribs: NetDuelPlayerAttributes;
    deck: DuelCardId[];
    hand: DuelCardId[];
    units: (DuelUnitId | null)[]; // Fixed size array
    id: number;

    constructor(state: NetDuelPlayerState) {
        this.index = toLocalIndex(state.index)
        this.attribs = state.attribs;
        this.deck = state.deck;
        this.hand = state.hand;
        this.id = state.id;
        this.units = state.units;
    }

    setUnitAt(x: number, y: number, unitId: DuelUnitId | null) {
        this.units[y * 4 + x] = unitId;
    }

    getUnitAt(x: number, y: number) {
        return this.units[y * 4 + x];
    }
}

export type LocalDuelCard =
    | KnownLocalDuelCard
    | UnknownLocalDuelCard

export class UnknownLocalDuelCard {
    type: "unknown"
    id: number
    location: DuelCardLocation = "temp"
    attribs: NetAttributeSet = {} // just for convenience, never actually updated

    constructor(id: number) {
        this.type = "unknown"
        this.id = id
    }
}

export class KnownLocalDuelCard {
    type: DuelCardType
    attribs: NetDuelCard["attribs"]
    id: number
    defAssetRef: CardAssetRef
    location: DuelCardLocation

    constructor(src: NetDuelCard | KnownLocalDuelCard) {
        if (src instanceof KnownLocalDuelCard) {
            this.type = src.type;
            this.id = src.id;
            this.defAssetRef = src.defAssetRef;
            this.location = structuredClone(src.location);
            this.attribs = structuredClone(src.attribs);
        } else {
            this.type = src.type;
            this.id = src.id;
            this.defAssetRef = src.baseDefRef;
            this.location = src.location;
            this.attribs = src.attribs;
        }
    }

    isOfType<T extends DuelCardType>(type: T): this is typeof this & {
        type: T,
        attribs: NetDuelCardOf<T>["attribs"]
    } {
        return this.type === type
    }
}

export class LocalDuelUnit {
    id: DuelUnitId
    originRef: CardAssetRef
    originStats: NetUnitDuelCardAttributes
    owner: LocalDuelPlayerIndex
    attribs: NetDuelUnitAttributes
    position: LocalDuelArenaPosition
    alive: boolean = true // dead units are removed at the start of the next mutation

    constructor(unit: NetDuelUnit) {
        this.id = unit.id;
        this.originRef = unit.originRef;
        this.originStats = unit.originStats;
        this.owner = toLocalIndex(unit.owner);
        this.attribs = structuredClone(unit.attribs);
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
    requirement: CardRequirement
    allowedSlots: LocalDuelArenaPosition[]
    allowedEntities: number[]

    constructor(props: NetDuelCardPropositions) {
        this.cardId = props.cardId
        this.requirement = props.requirement
        this.allowedSlots = props.allowedSlots.map(toLocalPos);
        this.allowedEntities = props.allowedEntities
    }
}

export class LocalDuelUnitPropositions {
    unitId: DuelUnitId
    allowedEntities: number[]

    constructor(props: NetDuelUnitPropositions) {
        this.unitId = props.unitId;
        this.allowedEntities = props.allowedEntities;
    }
}