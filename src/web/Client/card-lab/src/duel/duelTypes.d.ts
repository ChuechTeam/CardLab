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

declare type NetDuelCard =
    | NetUnitDuelCard

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

declare type DuelCardRequirement = "none" | "singleSlot"

declare type NetDuelCardPropositions = {
    cardId: number,
    requirement: DuelCardRequirement,
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

type NetDuelDeltaBase<T extends string> = { type: T }
type NetDuelDeltaScopeBase<T extends string> = NetDuelDeltaBase<T> & {
    isScope: 1
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
} | NetDuelDeltaBase<"updateEntityAttribs"> & {
    entityId: number,
    attribs: NetAttributeSet
} | NetDuelDeltaBase<"createCards"> & {
    cardIds: DuelCardId[]
} | NetDuelDeltaBase<"revealCards"> & {
    hiddenCards: DuelCardId[],
    revealedCards: NetDuelCard[]
} | NetDuelDeltaBase<"moveCards"> & {
    changes: { cardId: DuelCardId, newLocation: DuelCardLocation, index: number | null }[]
    context: "played" | "discarded" | "drawn" | "other"
} | NetDuelDeltaScopeBase<"unitAttackScope"> & {
    unitId: DuelUnitId,
    targetId: number
} | NetDuelDeltaScopeBase<"unitTriggerScope"> & {
    unitId: DuelUnitId
} | NetDuelDeltaScopeBase<"cardPlayScope"> & {
    cardId: DuelCardId,
    player: NetDuelPlayerIndex
} | NetDuelDeltaScopeBase<"cardDrawScope"> & {
    player: NetDuelPlayerIndex
} | NetDuelDeltaScopeBase<"cardDiscardScope"> & {
    player: NetDuelPlayerIndex
} | NetDuelDeltaScopeBase<"deathScope">
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
    player: NetDuelPlayerIndex
} | DuelMessageBase<"duelMutated"> & {
    deltas: NetDuelDelta[],
    state: NetDuelState,
    propositions: NetDuelPropositions,
    iteration: number,
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
}

declare type DuelRequestMessage = Extract<DuelMessage, { header: DuelRequestHeader }>

declare type DuelMessageOf<T extends DuelMessage["type"]> = Extract<DuelMessage, { type: T }>