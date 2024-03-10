declare interface DuelGamePackDef {
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
declare type NetPlayerPair<T> = { "p1": T, "p2": T }
declare type DuelStatus = "awaitingConnection" | "choosingCards" | "playing" | "ended"

declare interface NetDuelState {
    status: DuelStatus
    player1: NetDuelPlayerState
    player2: NetDuelPlayerState
    turn: number
    whoseTurn: NetDuelPlayerIndex
    units: Record<string, NetDuelUnit>
    hiddenCards: DuelCardId[]
    knownCards: Record<string, NetDuelCard>
}

declare interface NetDuelPlayerState {
    coreHealth: number
    energy: number
    maxEnergy: number
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

declare type NetDuelCardBase<T extends string> = {
    type: T
    id: number,
    cost: number,
    location: DuelCardLocation,
    baseDefRef: CardAssetRef
}

declare type NetUnitDuelCard = NetDuelCardBase<"unit"> & {
    stats: {
        attack: number
        health: number
    }
}

declare type NetDuelCard =
    | NetUnitDuelCard

declare type DuelCardType = NetDuelCard["type"]

declare type NetDuelUnit = {
    id: DuelUnitId
    originRef: CardAssetRef
    originStats: NetUnitDuelCard["stats"]
    owner: NetDuelPlayerIndex
    attribs: NetDuelUnitAttributes
    position: NetDuelGridVec
}

declare interface NetDuelUnitAttributes {
    attack: number,
    curHealth: number,
    maxHealth: number,
    inactionTurns: number,
    actionsLeft: number,
    actionsPerTurn: number,
    traits: any[] // todo
}

declare type NetDuelTarget = {
    type: "unit",
    unitId: unitId
} | {
    type: "core",
    player: NetDuelPlayerIndex
}

declare type NetDuelPropositions = {
    card: NetDuelCardPropositions[],
    unit: NetDuelUnitPropositions[]
}

declare type DuelCardRequirement = "none" | "singleChoice"

declare type NetDuelCardPropositions = {
    cardId: number,
    requirement: DuelCardRequirement,
    allowedSlots: NetPlayerPair<NetDuelGridVec[]>
    allowedCores: NetPlayerPair<boolean>
}

declare type NetDuelUnitPropositions = {
    unitId: number,
    allowedUnits: DuelUnitId[],
    allowedCores: NetPlayerPair<boolean>
}

/**
 * Deltas
 */

declare type NetDuelDeltaBase<T extends string> = { type: T }
declare type NetDuelDeltaScopeBase<T extends string> = NetDuelDeltaBase<T> & {
    state: "start" | "end"
}

declare type NetDuelDelta =
    | NetDuelDeltaBase<"switchTurn"> & {
    newTurn: number
    whoPlays: NetDuelPlayerIndex
} | NetDuelDeltaBase<"switchStatus"> & {
    status: DuelStatus
} | NetDuelDeltaBase<"placeUnit"> & {
    player: NetDuelPlayerIndex,
    unit: NetDuelUnit,
    position: NetDuelGridVec
} | NetDuelDeltaBase<"removeUnit"> & {
    removedIds: DuelUnitId[]
} | NetDuelDeltaBase<"updateBoardAttribs"> & {
    changes: { unitId: DuelUnitId, newAttribs: NetDuelUnitAttributes }[]
    coreHealths: NetPlayerPair<number | null>
} | NetDuelDeltaBase<"updateEnergyDelta"> & {
    player: NetDuelPlayerIndex,
    newEnergy: number,
    newMaxEnergy: number
} | NetDuelDeltaBase<"createCards"> & {
    cardIds: DuelCardId[]
} | NetDuelDeltaBase<"revealCards"> & {
    hiddenCards: DuelCardId[],
    revealedCards: NetDuelCard[]
} | NetDuelDeltaBase<"moveCardsDeck"> & {
    changes: { cardId: DuelCardId, newLocation: DuelCardLocation, index: number | null }[]
    context: "played" | "discarded" | "drawn" | "other"
} | NetDuelDeltaScopeBase<"unitAttackScope"> & {
    unitId: DuelUnitId, target: NetDuelTarget
} | NetDuelDeltaScopeBase<"unitTriggerScopeDelta"> & {
    unitId: DuelUnitId
} | NetDuelDeltaScopeBase<"cardPlayScopeDelta"> & {
    cardId: DuelCardId,
    player: NetDuelPlayerIndex
} | NetDuelDeltaScopeBase<"cardDrawScopeDelta"> & {
    player: NetDuelPlayerIndex
} | NetDuelDeltaScopeBase<"cardDiscardScopeDelta"> & {
    player: NetDuelPlayerIndex
} | NetDuelDeltaScopeBase<"deathScopeDelta">

// that's a bit hacky but whatever
declare type NetDuelScopeDelta = Extract<NetDuelDelta, { state: "start" | "end" }>

declare type NetDuelDeltaOf<T extends NetDuelDelta["type"]> = Extract<NetDuelDelta, { type: T }>

/**
 * Messages
 */

declare type DuelMessageBase<T> = { type: T };

declare type DuelMessage =
    | DuelMessageBase<"duelWelcome"> & {
    state: NetDuelState,
    propositions: NetDuelPropositions,
    iteration: number,
    player: NetDuelPlayerIndex
} | DuelMessageBase<"duelMutated"> & {
    deltas: NetDuelDelta[],
    state: NetDuelState,
    propositions: NetDuelPropositions,
    iteration: number,
} | DuelMessageBase<"duelRequestFailed"> & {
    requestId: int,
    reason: string
}

declare type DuelMessageOf<T extends DuelMessage["type"]> = Extract<DuelMessage, { type: T }>