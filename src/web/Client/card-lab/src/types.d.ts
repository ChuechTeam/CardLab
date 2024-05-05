// This is where the types go

/**
 * Player
 */

declare interface Player {
    id: number,
    name: string
}

/**
 * Cards
 */

declare interface CardDefinition {
    name: string,
    description: string,
    lore: string,
    type: "unit" | "spell",
    requirement: CardRequirement,
    attack: number,
    health: number,
    cost: number,
    archetype: string | null,
    author: string | null,
    script: CardScript | null,
    traits?: any[] // todo
}

declare type CardRequirement = "none" | "singleSlot" | "singleEntity"

declare interface CardScript {
    handlers: CardEventHandler[]
}

/*
 * Basic Enums
 */

declare type ScriptableAttribute = "health" | "attack" | "cost"
declare type FilterOp = "greater" | "lower" | "equal"
declare type CardMoveKind = "played" | "discarded" | "drawn"
declare type GameTeam = "self" | "enemy" | "ally" | "any"
declare type EntityType = "unit" | "card"
declare type UnitDirection = "left" | "right" | "up" | "down"
declare type ConditionalTarget = "me" | "source" | "target"

/* Base stuff & types */

declare type ScriptEventBase<I extends string> = { type: I }
declare type ScriptEventType = ScriptEvent["type"]
declare type CardEventOf<T> = Extract<ScriptEvent, { type: T }>

declare type ScriptActionBase<I extends string> = { type: I }
declare type ScriptActionType = ScriptAction["type"]
declare type ScriptActionOf<T> = Extract<ScriptAction, { type: T }>

declare type TargetBase<I extends string> = { type: I }
declare type TargetType = Target["type"]
declare type TargetOf<T> = Extract<Target, { type: T }>

declare type FilterBase<I extends string> = { type: I }
declare type FilterType = Filter["type"]
declare type FilterOf<T> = Extract<Target, { type: T }>

/* Card events */

declare type CardEventHandler = {
    event: ScriptEvent,
    actions: ScriptAction[]
}

declare type ScriptEvent =
    | ScriptEventBase<"postSpawn">
    | ScriptEventBase<"postCoreHurt"> & {
    team: GameTeam
}
    | ScriptEventBase<"postUnitEliminated"> & {
    team: GameTeam
}
    | ScriptEventBase<"postUnitKill">
    | ScriptEventBase<"postUnitHurt"> & {
    team: GameTeam,
    dealt: boolean
}
    | ScriptEventBase<"postUnitHeal"> & {
    team: GameTeam,
    dealt: boolean
}
    | ScriptEventBase<"postUnitAttack"> & {
    team: GameTeam,
    dealt: boolean
}  | ScriptEventBase<"postUnitHealthChange"> &{
    threshold: number
}
    | ScriptEventBase<"postUnitNthAttack"> & {
    n: number
}
    | ScriptEventBase<"postNthCardPlay"> & {
    n: number
}
    | ScriptEventBase<"postCardMove"> & {
    kind: CardMoveKind
} | ScriptEventBase<"postTurn"> & {
    team: GameTeam
}


/* Card actions */


declare type ScriptAction =
    | ScriptActionBase<"draw"> & {
    n: number,
    filters: Filter[]
}
    | ScriptActionBase<"create"> & {
    n: number,
    filters: Filter[]
}
    | ScriptActionBase<"discard"> & {
    n: number,
    myHand: boolean
    filters: Filter[]
}
    | ScriptActionBase<"modifier"> & {
    isBuff: boolean,
    value: number,
    attr: ScriptableAttribute,
    target: Target,
    duration: number
}
    | ScriptActionBase<"grantAttack"> & {
    n: number,
    target: Target
}
    | ScriptActionBase<"hurt"> & {
    damage: number,
    target: Target
}
    | ScriptActionBase<"heal"> & {
    damage: number,
    target: Target
}
    | ScriptActionBase<"attack"> & {
    target: Target
}
    | ScriptActionBase<"singleConditional"> & {
    target: ConditionalTarget,
    conditions: Filter[],
    actions: ScriptAction[]
} | ScriptActionBase<"multiConditional"> & {
    minUnits: number,
    team: GameTeam,
    conditions: Filter[],
    actions: ScriptAction[]
} | ScriptActionBase<"randomConditional"> & {
    percentChance: number,
    actions: ScriptAction[]
} | ScriptActionBase<"deploy"> & {
    filters: Filter[]
    direction: UnitDirection
}

/* Card targets */

declare type Target =
    | TargetBase<"me">
    | TargetBase<"core"> & {
    enemy: boolean
}
    | TargetBase<"source">
    | TargetBase<"target">
    | TargetBase<"query"> & {
    kind: EntityType,
    team: GameTeam,
    filters: Filter[],
    n: number
}
    | TargetBase<"nearbyAlly"> & {
    direction: UnitDirection
}


/* Filters */

declare type Filter =
    | FilterBase<"cardType"> & {
    kind: "unit" | "spell"
} | FilterBase<"attr"> & {
    attr: ScriptableAttribute,
    op: FilterOp,
    value: number
} | FilterBase<"wounded">
    | FilterBase<"adjacent">
    | FilterBase<"archetype"> & {
    archetype: string
}

/* Payloads */

declare interface CardValidationSummary {
    definitionValid: boolean,
    errors: string[]
}

declare interface CardBalanceSummary {
    creditsUsed: number,
    creditsAvailable: number,
    entries: CardBalanceEntry[]
}

declare interface CardBalanceEntry {
    name: string,
    credits: number,
    subEntries: CardBalanceEntry[]
}

declare interface DownloadablePack {
    defPath: string,
    resPath: string
}

/**
 * Phases
 */

// PhaseName is necessary here because not all phases have states right now
declare type PhaseName =
    | "waitingForPlayers"
    | "tutorial"
    | "creatingCards"
    | "preparation"
    | "ended"
    | "duels"
    | "terminated"

declare type WaitingForPlayersPhaseState = {
    type: "waitingForPlayers",
    players: Player[],
    code: string
}

declare type CreatingCardPhaseState = {
    type: "creatingCards",
    host: {} | null,
    player: {
        cards: CardDefinition[]
    } | null
}

declare type TutorialPhaseState = {
    type: "tutorial",
    started: boolean
}

declare type PreparationPhaseState = {
    type: "preparation",
    status: "waitingLastUploads" | "compilingPack" | "ready"
    yourOpponent: string | null
}

declare type PhaseState =
    | WaitingForPlayersPhaseState
    | CreatingCardPhaseState
    | TutorialPhaseState
    | PreparationPhaseState
    | null

/**
 * Messages
 */

declare type LobbyPlayerUpdatedMessage = {
    type: "lobbyPlayerUpdated",
    playerId: number,
    playerName: string,
    kind: "join" | "quit" | "update"
}

declare type SwitchedPhaseMessage = {
    type: "switchedPhase",
    name: PhaseName,
    state: PhaseState
}

declare type WelcomeMessage = {
    type: "welcome",
    tempId: number,
    permId: string
    pack: DownloadablePack | null,
    duel: PartialDuelWelcome | null,
    duelRequireSessionPack: boolean
    me: Player | null,
    phaseName: PhaseName,
    phaseState: PhaseState
}

declare type PackAvailableMessage = {
    type: "packAvailable",
    pack: DownloadablePack
}

declare type SessionDuelStartedMessage = {
    type: "sessionDuelStarted",
    requireSessionPack: boolean
    welcome: PartialDuelWelcome
}

declare type SessionDuelEndedMessage = {
    type: "sessionDuelEnded"
}

declare type TutorialStartedMessage = {
    type: "tutorialStarted"
}

declare type PhaseStateUpdatedMessage = {
    type: "phaseStateUpdated"
    state: PhaseState
}

declare type LabMessage =
    | LobbyPlayerUpdatedMessage
    | SwitchedPhaseMessage
    | WelcomeMessage
    | PackAvailableMessage
    | SessionDuelStartedMessage
    | SessionDuelEndedMessage
    | TutorialStartedMessage
    | PhaseStateUpdatedMessage
    | DuelMessage

declare type MessageType = LabMessage["type"]

declare type PartialDuelWelcome = Omit<DuelMessageOf<"duelWelcome">, "type">