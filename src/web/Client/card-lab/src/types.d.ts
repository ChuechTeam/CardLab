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

declare enum CardEventType {
    WHEN_I_SPAWN = "whenISpawn"
}

declare enum CardActionType {
    DRAW_CARD = "drawCard",
    HEAL = "heal",
    HURT_CARD = "hurtCard",
    WIN_GAME = "winGame"
}

declare type CardEventHandlerBase<I extends CardEventType> = {
    event: I,
    actions: CardAction[]
}

declare type CardEventHandler =
    | CardEventHandlerBase<CardEventType.WHEN_I_SPAWN>

declare type CardActionBase<I extends CardActionType> = { type: I }

declare type CardAction =
    | CardActionBase<CardActionType.DRAW_CARD> & {
    numCards: number
}
    | CardActionBase<CardActionType.HEAL>
    | CardActionBase<CardActionType.HURT_CARD>
    | CardActionBase<CardActionType.WIN_GAME>

declare enum CardTargetType {
    RANDOM_ENEMY = "randomEnemy"
}

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

declare enum PhaseName {
    WAITING_FOR_PLAYERS = "waitingForPlayers",
    CREATING_CARDS = "creatingCards",
    POST_CREATE = "postCreate",
    ENDED = "ended",
    TERMINATED = "terminated"
}

declare type WaitingForPlayersPhaseState = {
    type: PhaseName.WAITING_FOR_PLAYERS,
    players: Player[],
    code: string
}

declare type CreatingCardPhaseState = {
    type: PhaseName.CREATING_CARDS,
    host: {},
    player: {
        cards: CardDefinition[]
    }
}

declare type PhaseState =
    | WaitingForPlayersPhaseState
    | CreatingCardPhaseState

/**
 * Messages
 */

declare enum MessageType {
    LOBBY_PLAYER_UPDATED = "lobbyPlayerUpdated",
    SWITCHED_PHASE = "switchedPhase",
    WELCOME = "welcome",
}

declare type LobbyPlayerUpdatedMessage = {
    type: MessageType.LOBBY_PLAYER_UPDATED,
    playerId: number,
    playerName: string,
    kind: "join" | "quit" | "update"
}

declare type SwitchedPhaseMessage = {
    type: MessageType.SWITCHED_PHASE,
    phaseName: PhaseName,
    phaseState: PhaseState
}

declare type WelcomeMessage = {
    type: MessageType.WELCOME,
    me: Player | null,
    phaseName: PhaseName,
    phaseState: PhaseState
}

declare type LabMessage =
    | LobbyPlayerUpdatedMessage
    | SwitchedPhaseMessage
    | WelcomeMessage
