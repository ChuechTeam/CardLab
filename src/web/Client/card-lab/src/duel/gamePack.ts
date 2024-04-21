import {duelLog} from "./log.ts";
import {PackDownloadStatus} from "src/components/PackDownloadStatus.ts";
import {DuelGame} from "src/duel/duel.ts";

export async function loadGamePack(defUrl: string, resUrl: string) {
    const start = performance.now()

    duelLog("Downloading game pack from:", defUrl, resUrl)

    const defProm = fetch(defUrl).then(x => x.json())
    const resProm = fetch(resUrl).then(x => x.blob())

    const [def, res] = await Promise.all([defProm, resProm])
    duelLog(`Game pack "${def.name}" downloaded in ${(performance.now() - start).toFixed(2)}ms`)

    return new DuelGamePack(def as DuelGamePackDef, res)
}

export async function loadGamePackWithProgress(defUrl: string, resUrl: string, progress: PackDownloadProgress):
    Promise<DuelGamePack> {
    const start = performance.now()

    duelLog("Downloading game pack from:", defUrl, resUrl)

    function makeReq<T extends boolean>(url: string, fp: FileProgress, res: T): Promise<T extends true ? Blob : DuelGamePackDef> {
        const req = new XMLHttpRequest();
        if (res) {
            req.responseType = "blob";
        }
        req.addEventListener("progress", function (e) {
            if (e.lengthComputable) {
                fp.totalSize = e.total;
                fp.size = e.loaded;
                progress.onUpdate();
            }
        })
        return new Promise((complete, die) => {
            req.addEventListener("loadend", () => {
                if (req.status >= 200 && req.status <= 299) {
                    fp.done = true;
                    if (!res) {
                        complete(JSON.parse(req.response));
                    } else {
                        complete(req.response);
                    }
                } else {
                    die(`Request failed. (status=${req.status})`);
                }
            })
            req.open("GET", url);
            req.send();
        })
    }

    try {
        const [def, res] = await Promise.all([
            makeReq(defUrl, progress.defProgress, false),
            makeReq(resUrl, progress.resProgress, true)
        ])
        progress.status = "done";
        duelLog(`Game pack "${def.name}" downloaded in ${(performance.now() - start).toFixed(2)}ms`)
        return new DuelGamePack(def as DuelGamePackDef, res)
    } catch (e) {
        progress.status = "error";
        throw e;
    } finally {
        progress.onUpdate();
    }
}

class FileProgress {
    done: boolean = false
    size: number = 0
    totalSize: number | null = null
}

export class PackDownloadProgress {
    status: "downloading" | "done" | "error" = "downloading"
    defProgress = new FileProgress()
    resProgress = new FileProgress()
    gamePack: DuelGamePack | null = null
    onUpdate = () => {}
    
    get downloadSummary(): { total: number; actual: number; filesDone: number; } | null {
        if (this.defProgress.totalSize === null || this.resProgress.totalSize === null) {
            return null;
        }
        
        const total = this.defProgress.totalSize + this.resProgress.totalSize;
        const actual = this.defProgress.size + this.resProgress.size;
        let filesDone = 0;
        if (this.defProgress.done) {
            filesDone++;
        }
        if (this.resProgress.done) {
            filesDone++;
        }
        
        return { total, actual, filesDone };
    }
}

export interface CardAsset {
    id: number
    image: Blob | null
    definition: CardDefinition
}

export class DuelGamePack {
    id: string
    name: string
    cards = new Map<number, CardAsset>()

    definition: DuelGamePackDef

    public constructor(def: DuelGamePackDef, res: Blob) {
        this.definition = def
        this.id = def.id
        this.name = def.name

        for (const card of def.cards) {
            this.cards.set(card.id, {
                id: card.id,
                image: card.image.size === 0 ? null :
                    res.slice(card.image.loc, card.image.loc + card.image.size, "image/png"),
                definition: card.definition
            });
        }
    }
}