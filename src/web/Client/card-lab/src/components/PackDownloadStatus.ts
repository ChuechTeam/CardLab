import {fromDom, LabElement, registerTemplate} from "src/dom.ts";
import {PackDownloadProgress} from "src/duel/gamePack.ts";

const template = registerTemplate('pack-download-status',`<style>
    #root {
        background-color: #0077cc;
        padding: 8px;
        display: flex;
        justify-content: center;
        align-items: center;
    }

    #block {
        display: grid;
        width: 80%;
        grid-template-columns: 1fr min-content;
        grid-template-rows: auto auto auto;
        row-gap: 3px;
    }

    #title {
        text-align: center;
        grid-column: 1/3;
        grid-row: 1;
        margin-bottom: 5px;
    }

    #progressControl {
        grid-row: 2;
        grid-column: 1;
        accent-color: black;
    }

    #percent {
        grid-row: 2;
        grid-column: 2;
        margin-left: 12px;
        font-size: 0.7em;
    }
    
    #detail {
        grid-column: 1/3;
        grid-row: 3;
        display: flex;
        justify-content: space-between;
        font-size: 0.7em;
    }
</style>
<article id="root">
    <div id="block">
        <header id="title">Téléchargement du pack de jeu</header>
        <progress id="progressControl" value="0.25"></progress>
        <div id="percent">25%</div>
        <div id="detail">
            <div id="size">1.23Mb/5Mb</div>
            <div id="file">1/2 fichiers</div>
        </div>
    </div>
</article>
`)

// Just use appendChild/removeChild to add or remove elements.
export class PackDownloadStatus extends LabElement {
    progress: PackDownloadProgress | null = null;
    
    @fromDom("progressControl") progressControl: HTMLProgressElement = null!;
    @fromDom("percent") percent: HTMLElement = null!;
    @fromDom("size") size: HTMLElement = null!;
    @fromDom("file") file: HTMLElement = null!;
    @fromDom("title") titleEl: HTMLElement = null!;
    
    render() {
        this.renderTemplate(template);
    }
    
    connected() {
        this.hide();
    }
    
    showProgress(title: string, p: PackDownloadProgress) {
        this.progress = p;
        this.titleEl.innerText = title;
        p.onUpdate = this.update.bind(this);
        this.show();
        this.reset();
        this.update();
    }
    
    update() {
        if (this.progress !== null) {
            const s = this.progress.downloadSummary
            if (this.progress.status === "downloading" && s !== null) {
                this.progressControl.value = s.actual/s.total;
                this.percent.innerText = (s.actual/s.total*100).toFixed(0).toString() + "%";
                this.size.innerText = `${humanFileSize(s.actual)}/${humanFileSize(s.total)}`
                this.file.innerText = `${s.filesDone}/2 fichiers`;
            } else {
                switch (this.progress.status) {
                    case "downloading":
                        this.reset();
                        break;
                    case "error":
                    case "done":
                        break;
                }
            }
        }
    }
    
    reset() {
        this.progressControl.removeAttribute("value");
        this.percent.innerText = "0%";
        this.file.innerText = "0/2 fichiers";
        this.size.innerText = "";
    }
    
    show() {
        this.style.removeProperty("display");
    }
    
    hide() {
        this.style.display = "none";
    }
}

// From https://stackoverflow.com/a/72596863/5816295
const UNITS = ['byte', 'kilobyte', 'megabyte', 'gigabyte', 'terabyte', 'petabyte']
const BYTES_PER_KB = 1000
/**
 * Format bytes as human-readable text.
 *
 * @param sizeBytes Number of bytes.
 *
 * @return Formatted string.
 */
export function humanFileSize(sizeBytes: number | bigint): string {
    let size = Math.abs(Number(sizeBytes))

    let u = 0
    while(size >= BYTES_PER_KB && u < UNITS.length-1) {
        size /= BYTES_PER_KB
        ++u
    }

    return new Intl.NumberFormat([], {
        style: 'unit',
        unit: UNITS[u],
        unitDisplay: 'short',
        maximumFractionDigits: 1,
    }).format(size)
}

customElements.define("pack-download-status", PackDownloadStatus);