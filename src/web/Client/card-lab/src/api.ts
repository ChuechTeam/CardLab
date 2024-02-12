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

    lobby: {
        async startGame() {
            let res = await fetch(apiUrl("api/game/lobby/start-game"), {method: 'POST'});
            return res.ok;
        }
    },

    cards: {
        async update(index: number, card: CardDefinition): Promise<CardUpdateResult> {
            let res = await fetch(apiUrl(`api/game/cards/${index}`), jsonPost(card));
            return await res.json();
        },

        async updateAll(cards: (CardDefinition | null)[]): Promise<(CardUpdateResult | null)[]> {
            let res = await fetch(apiUrl("api/game/cards"), jsonPost(cards));
            return await res.json();
        },

        async uploadImage(cardId: number, imageBlob: Blob) {
            const formData = new FormData();
            formData.append('image', imageBlob);
            let res = await fetch(apiUrl(`api/game/cards/${cardId}/image`), {
                method: 'POST',
                body: formData,
            });
            return res.ok;
        }
    }
}

export interface CardUpdateResult {
    validation: CardValidationSummary,
    balance: CardBalanceSummary
}