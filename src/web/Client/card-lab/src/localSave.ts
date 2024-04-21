export const LOCAL_STORAGE_PREFIX = "_CLS-"

export let gameSessionLocalInvalidated = false

export function gameStorageCheck(permId: string) {
    const sessionId = localStorage.getItem("clsid");
    const invalidate = sessionId !== null && sessionId !== permId;
    if (invalidate) {
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key !== null && key.startsWith(LOCAL_STORAGE_PREFIX)) {
                localStorage.removeItem(key);
            }
        }
        gameSessionLocalInvalidated = true;
    }
    localStorage.setItem("clsid", permId)
    return invalidate;
}

export function gameStorageLoad(key: string): string | null {
    return localStorage.getItem(LOCAL_STORAGE_PREFIX + key);
}

export function gameStorageStore(key: string, value: string) {
    localStorage.setItem(LOCAL_STORAGE_PREFIX + key, value);
}