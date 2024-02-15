// This is where the types go

/**
 * Player
 */

declare interface Player {
    id: string,
    name: string
}

/**
 * Cards
 */

declare interface CardDefinition {
    name: string,
    description: string,
    lore: string,
    type?: "unit",
    attack: number,
    health: number,
    cost: number,
    script: CardScript | null
}

declare interface CardScript {
    handlers: CardEventHandler[]
}

/* Base stuff & types */

declare type CardEventHandlerBase<I extends CardEventType> = {
    event: I,
    actions: CardAction[]
}
declare type CardEventType = CardEventHandler["event"]

declare type CardActionBase<I extends string> = { type: I }
declare type CardActionType = CardAction["type"]

declare type TargetBase<I extends string> = { type: I }
declare type TargetType = Target["type"]

/* Card events */

declare type CardEventHandler =
    | CardEventHandlerBase<"whenISpawn">

/* Card actions */

declare type CardAction =
    | CardActionBase<"drawCard"> & {
    numCards: number
}
    | CardActionBase<"hurt"> & {
    target: Target
    damage: number
}
    | CardActionBase<"winGame">

/* Card targets */

declare type Target =
    | TargetBase<"randomEnemy">
    | TargetBase<"enemyCore">
    | TargetBase<"myCore">

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

/**
 * Phases
 */

// PhaseName is necessary here because not all phases have states right now
declare type PhaseName =
    | "waitingForPlayers"
    | "creatingCards"
    | "postCreate"
    | "ended"
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

declare type PhaseState =
    | WaitingForPlayersPhaseState
    | CreatingCardPhaseState

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
    phaseName: PhaseName,
    phaseState: PhaseState
}

declare type WelcomeMessage = {
    type: "welcome",
    me: Player | null,
    phaseName: PhaseName,
    phaseState: PhaseState
}

declare type LabMessage =
    | LobbyPlayerUpdatedMessage
    | SwitchedPhaseMessage
    | WelcomeMessage

declare type MessageType = LabMessage["type"]