const baseUrl = new URL(window.location.origin);

export function apiUrl(subPath) {
    return new URL(subPath, baseUrl);
}

function jsonPost(obj, options = {}) {
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
    getState() {
        return fetch(apiUrl("api/game/state"))
            .then(res => res.json());
    },

    getHello() {
        return fetch(apiUrl("api/game/hello"))
            .then(res => res.json());
    },

    lobby: {
        startGame() {
            return fetch(apiUrl("api/game/lobby/start-game"), {method: 'POST'})
                .then(res => res.ok);
        }
    },

    cards: {
        update(index, card) {
            return fetch(apiUrl(`api/game/cards/${index}`), jsonPost(card))
                .then(res => res.json())
        },
        
        updateAll(cards) {
            return fetch(apiUrl("api/game/cards"), jsonPost(cards))
                .then(res => res.json())
        },

        uploadImage(cardId, imageBlob) {
            const formData = new FormData();
            formData.append('image', imageBlob);
            return fetch(apiUrl(`api/game/cards/${cardId}/image`), {
                method: 'POST',
                body: formData,
            })
                .then(res => res.ok);
        }
    }
}