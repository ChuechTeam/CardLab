const baseUrl = new URL(window.location.origin);

export function apiUrl(subPath: string) {
    return new URL(subPath, baseUrl);
}

function jsonPost(obj: any, options = {}) {
    return {
        method: 'POST',
        body:
            JSON.stringify(obj),
        headers:
            {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
        ...options
    }
}

export type ApiErrorResponse = {
    status: number,
    detail?: string,
    title?: string
    // and others but we don't care
}

export class ApiError extends Error {
    constructor(public response: Response, public body: ApiErrorResponse) {
        super((body.detail || body.title) ?
            `Error ${response.status} during request to ${response.url}: ${body.title ?? body.detail}.` :
            `Error ${response.status} during request to ${response.url}.`);
    }
}

async function ensureOk(res: Response): Promise<Response> {
    if (!res.ok) {
        throw new ApiError(res, await res.json() as ApiErrorResponse);
    }
    
    return res
}

async function clFetch(input: RequestInfo | URL, init?: RequestInit) {
    let res = await fetch(input, init);
    return await ensureOk(res);
}

export const gameApi = {
    // Unused for now
    // getState() {
    //     return fetch(apiUrl("api/game/state"))
    //         .then(res => res.json());
    // },
    //
    // getHello() {
    //     return fetch(apiUrl("api/game/hello"))
    //         .then(res => res.json());
    // },

    host: {
        async startGame() {
            await clFetch(apiUrl("api/game/host/start-game"), {method: 'POST'});
        },
        async startTutorialDuels() {
            await clFetch(apiUrl("api/game/host/start-tutorial-duels"), {method: 'POST'});
        },
        async endTutorial() {
            await clFetch(apiUrl("api/game/host/end-tutorial"), {method: 'POST'});
        },
        async endCardCreation() {
            await clFetch(apiUrl("api/game/host/end-card-creation"), {method: 'POST'});
        },
        async kickPlayer(id: number) {
            await clFetch(apiUrl(`api/game/host/kick-player?id=${id}`), {method: 'POST'});
        },
        async preparationRevealOpponents() {
            await clFetch(apiUrl("api/game/host/preparation-reveal-opponents"), {method: 'POST'});
        },
        async endPreparation() {
            await clFetch(apiUrl("api/game/host/end-preparation"), {method: 'POST'});
        },
        async duelsStartRound() {
            await clFetch(apiUrl("api/game/host/duels-start-round"), {method: 'POST'});
        },
        async duelsEndRound() {
            await clFetch(apiUrl("api/game/host/duels-end-round"), {method: 'POST'});
        }
    },

    cards: {
        async update(index: number, card: CardDefinition): Promise<CardUpdateResult> {
            let res = await clFetch(apiUrl(`api/game/cards/${index}`), jsonPost(card));
            return await res.json();
        },

        async uploadImage(cardId: number, imageBlob: Blob) {
            const formData = new FormData();
            formData.append('image', imageBlob);
            let res = await clFetch(apiUrl(`api/game/cards/${cardId}/image`), {
                method: 'POST',
                body: formData,
            });
            return res.ok;
        }
    }
}

export function redirectToQuitGame() {
    window.location.href = new URL("game/quit", baseUrl).toString();
}

export interface CardUpdateResult {
    validation: CardValidationSummary,
    balance: CardBalanceSummary,
    description: string
    archetype: string | null
}