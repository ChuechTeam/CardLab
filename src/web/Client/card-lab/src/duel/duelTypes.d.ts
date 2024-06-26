﻿declare interface DuelGamePackDef {
    id: string
    name: string
    resourceFileSize: number
    version: number
    cards: CardAssetDef[]
}

declare interface CardAssetDef {
    id: number
    image: ResourceRef
    definition: CardDefinition
}

declare interface ResourceRef {
    loc: number
    size: number
}

declare interface CardAssetRef {
    packId: string
    cardId: number
}

declare type LocalDuelPlayerIndex = 0 | 1
declare type NetDuelPlayerIndex = "p1" | "p2"
declare type DuelUnitId = number
declare type DuelCardId = number
declare type NetDuelGridVec = { "x": number, "y": number }
declare type NetDuelArenaPosition = { player: NetDuelPlayerIndex, vec: NetDuelGridVec }
declare type NetPlayerPair<T> = { "p1": T, "p2": T }
declare type DuelStatus = "awaitingConnection" | "playing" | "ended"

declare type NetAttributeSet = { [key: string]: number | undefined }

declare interface NetEntity<A extends NetAttributeSet> {
    id: number
    attribs: A
}

declare interface NetDuelState {
    status: DuelStatus
    player1: NetDuelPlayerState
    player2: NetDuelPlayerState
    winner: NetDuelPlayerIndex | null
    turn: number
    whoseTurn: NetDuelPlayerIndex
    units: Record<string, NetDuelUnit>
    hiddenCards: DuelCardId[]
    knownCards: Record<string, NetDuelCard>
}

declare type NetDuelPlayerAttributes = NetAttributeSet & {
    coreHealth: number
    energy: number
    maxEnergy: number
}

declare interface NetDuelPlayerState extends NetEntity<NetDuelPlayerAttributes> {
    index: NetDuelPlayerIndex
    hand: DuelCardId[]
    deck: DuelCardId[]
    units: DuelUnitId[]
}

declare type DuelCardLocation =
    | "deckP1"
    | "deckP2"
    | "handP1"
    | "handP2"
    | "discarded"
    | "temp"

declare type NetDuelCardAttributes = NetAttributeSet & { cost: number }

type NetDuelCardBase<T extends string, A = NetDuelCardAttributes> = NetEntity<A> & {
    type: T
    location: DuelCardLocation,
    baseDefRef: CardAssetRef
}

declare type NetUnitDuelCardAttributes = NetDuelCardAttributes & {
    attack: number,
    health: number
}

declare type NetUnitDuelCard = NetDuelCardBase<"unit", NetUnitDuelCardAttributes>
declare type NetSpellDuelCard = NetDuelCardBase<"spell">
declare type NetDuelCard =
    | NetUnitDuelCard
    | NetSpellDuelCard

declare type NetDuelCardOf<T> = Extract<NetDuelCard, { type: T }>

declare type DuelCardType = NetDuelCard["type"]

declare type NetDuelUnit = NetEntity<NetDuelUnitAttributes> & {
    id: DuelUnitId
    originRef: CardAssetRef
    originStats: NetUnitDuelCard["attribs"]
    owner: NetDuelPlayerIndex
    attribs: NetDuelUnitAttributes
    position: NetDuelArenaPosition
}

declare type NetDuelUnitAttributes = NetAttributeSet & {
    attack: number,
    health: number,
    maxHealth: number,
    inactionTurns: number,
    actionsLeft: number,
    actionsPerTurn: number
}

declare type NetDuelPropositions = {
    card: NetDuelCardPropositions[],
    unit: NetDuelUnitPropositions[]
}

declare type NetDuelCardPropositions = {
    cardId: number,
    requirement: CardRequirement,
    allowedSlots: NetDuelArenaPosition[]
    allowedEntities: number[]
}

declare type NetDuelUnitPropositions = {
    unitId: number,
    allowedEntities: number[]
}

/**
 * Deltas
 */

type NetDuelDeltaBase<T extends string> = { type: T; tags?: string[] }
type NetDuelDeltaScopeBase<T extends string> = NetDuelDeltaBase<T> & {
    isScope: 1
}

declare type DuelEffectTint = "positive" | "neutral" | "negative"

declare type NetDuelDelta =
    | NetDuelDeltaBase<"switchTurn"> & {
    newTurn: number
    whoPlays: NetDuelPlayerIndex
} | NetDuelDeltaBase<"switchStatus"> & {
    status: DuelStatus
    winner: NetDuelPlayerIndex | null
} | NetDuelDeltaBase<"placeUnit"> & {
    player: NetDuelPlayerIndex,
    unit: NetDuelUnit,
    position: NetDuelGridVec
} | NetDuelDeltaBase<"removeUnit"> & {
    removedId: DuelUnitId
} | NetDuelDeltaBase<"updateEntityAttribs"> & {
    entityId: number,
    attribs: NetAttributeSet
} | NetDuelDeltaBase<"createCards"> & {
    cardIds: DuelCardId[]
} | NetDuelDeltaBase<"revealCards"> & {
    hiddenCards: DuelCardId[],
    revealedCards: NetDuelCard[]
} | NetDuelDeltaBase<"moveCards"> & {
    changes: {
        cardId: DuelCardId,
        prevLocation: DuelCardLocation,
        newLocation: DuelCardLocation,
        index: number | null
    }[]
} | NetDuelDeltaBase<"showMessage"> & {
    message: string,
    duration: number // ms  
    pauseDuration: number // ms
} | NetDuelDeltaScopeBase<"unitAttackScope"> & {
    unitId: DuelUnitId,
    targetId: number
    damage: number
} | NetDuelDeltaScopeBase<"unitTriggerScope"> & {
    unitId: DuelUnitId
} | NetDuelDeltaScopeBase<"cardPlayScope"> & {
    cardId: DuelCardId,
    player: NetDuelPlayerIndex
} | NetDuelDeltaScopeBase<"cardDrawScope"> & {
    player: NetDuelPlayerIndex
} | NetDuelDeltaScopeBase<"effectScope"> & {
    sourceId: number
    targets: number[]
    tint: DuelEffectTint
    disableTargeting?: boolean
    startDelay?: number // ms
    endDelay?: number // ms
} | NetDuelDeltaScopeBase<"cardDiscardScope"> & {
    player: NetDuelPlayerIndex
} | NetDuelDeltaScopeBase<"damageScope"> & {
    sourceId: number | null,
    targetId: number,
    damage: number
} | NetDuelDeltaScopeBase<"healScope"> & {
    sourceId: number | null,
    targetId: number,
    damage: number
} | NetDuelDeltaScopeBase<"alterationScope"> & {
    sourceId: number | null,
    targetId: number,
    positive: boolean
}
    | NetDuelDeltaScopeBase<"deathScope">
    | NetDuelDeltaBase<"scopePreparationEnd">
    | NetDuelDeltaBase<"scopeEnd"> & { interrupted: boolean }

// that's a bit hacky but whatever
declare type NetDuelScopeDelta = Extract<NetDuelDelta, { isScope: 1 }>

declare type NetDuelDeltaOf<T extends NetDuelDelta["type"]> = Extract<NetDuelDelta, { type: T }>

/**
 * Messages
 */

type DuelRequestHeader = { requestId: number, iteration: number }

type DuelMessageBase<T> = { type: T };

declare type DuelMessage =
    | DuelMessageBase<"duelWelcome"> & {
    state: NetDuelState,
    propositions: NetDuelPropositions,
    iteration: number,
    player: NetDuelPlayerIndex,
    p1Name: string,
    p2Name: string
    timer: number | null
} | DuelMessageBase<"duelMutated"> & {
    deltas: NetDuelDelta[],
    state: NetDuelState,
    whoseTurn: NetDuelPlayerIndex
    propositions: NetDuelPropositions,
    iteration: number,
    timer: number | null
} | DuelMessageBase<"duelRequestFailed"> & {
    requestId: int,
    reason: string
} | DuelMessageBase<"duelRequestAck"> & {
    requestId: int
} | DuelMessageBase<"duelEndTurn"> & { header: DuelRequestHeader }
    | DuelMessageBase<"duelUseCardProposition"> & {
    header: DuelRequestHeader,
    cardId: DuelCardId,
    chosenSlots: NetDuelArenaPosition[],
    chosenEntities: number[]
} | DuelMessageBase<"duelUseUnitProposition"> & {
    header: DuelRequestHeader;
    unitId: number;
    chosenEntityId: number;
} | DuelMessageBase<"duelControlTimer"> & {
    pause: boolean
} | DuelMessageBase<"duelReportReady">
    | DuelMessageBase<"duelTimerUpdated"> & {
    timer: number
}

declare type DuelRequestMessage = Extract<DuelMessage, { header: DuelRequestHeader }>

declare type DuelMessageOf<T extends DuelMessage["type"]> = Extract<DuelMessage, { type: T }>