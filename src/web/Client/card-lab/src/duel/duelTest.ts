import {loadGamePack} from "./gamePack.ts";
import {DuelGame} from "./duel.ts";
import {DuelGameRegistry} from "./gameRegistry.ts";
import {loadDuelAssets} from "./assets.ts";
import {DuelMessaging} from "./messaging.ts";

type DuelTestParam = {
    player: number,
    defUrl: string,
    resUrl: string,
    socketUrl: string
}

export function tryRunDuelTest(): boolean {
    const container = document.getElementById("duel-container");
    if (!container) {
        return false
    }
    
    const params = (window as any).duelTest as DuelTestParam;
    if (!params) {
        return false
    }
    
    runDuelTest(container, params).then(r => {}).catch(e => console.error("oh no a duel test error!", e))
    
    return true
}

async function runDuelTest(container: HTMLElement, params: DuelTestParam) {
    const gamePack = await loadGamePack(params.defUrl, params.resUrl)
    console.log("gamePack loaded: ", gamePack);
    
    const registry = new DuelGameRegistry([gamePack])
    const assets = await loadDuelAssets(registry)
    
    const game = new DuelGame(container, registry, assets, new DuelMessaging(new URL(params.socketUrl)));
    (window as any).duelGame = game
}