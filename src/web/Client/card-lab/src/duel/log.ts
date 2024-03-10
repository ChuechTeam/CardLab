export enum DuelLogLevel {
    DEBUG = 0,
    INFO = 1,
    WARNING = 2,
    ERROR = 3
}

export let overlay: DuelLogOverlay | null = null;

export function duelLogWith(level: DuelLogLevel, message: string, ...objs: any[]) {
    switch (level) {
        case DuelLogLevel.DEBUG:
        case DuelLogLevel.INFO:
            console.log("[DUEL]", message, ...objs);
            break;
        case DuelLogLevel.WARNING:
            console.warn("[DUEL]", message, ...objs);
            break;
        case DuelLogLevel.ERROR:
            console.error("[DUEL]", message, ...objs);
            break;
    }
    
    if (overlay && level >= DuelLogLevel.INFO) {
        overlay.showEntries([level, message, objs])
    }
}

export function duelLog(message: string, ...objs: any[]) {
    duelLogWith(DuelLogLevel.INFO, message, ...objs);
}

export function duelLogDebug(message: string, ...objs: any[]) {
    duelLogWith(DuelLogLevel.DEBUG, message, ...objs);
}

export function duelLogWarn(message: string, ...objs: any[]) {
    duelLogWith(DuelLogLevel.WARNING, message, ...objs);
}

export function duelLogError(message: string, ...objs: any[]) {
    duelLogWith(DuelLogLevel.ERROR, message, ...objs);
}

export function useLogOverlay(container: HTMLElement) {
    if (overlay === null) {
        customElements.define("duel-log-overlay", DuelLogOverlay);
        
        overlay = new DuelLogOverlay();
        container.appendChild(overlay);
        (window as any).duelLogOverlay = overlay;
    }
    return overlay;
}

const LOG_MAX = 100;

export class DuelLogOverlay extends HTMLElement {
    logList: HTMLElement = null!;
    entryTemplate: HTMLTemplateElement = null!;
    displayed: boolean = false;
    
    queuedEntries: [DuelLogLevel, string, any[]][] = [];

    constructor() {
        super();
    }

    connectedCallback() {
        const dom = this.attachShadow({mode: "open"});
        dom.innerHTML = `
<style>:host {
    display: block;
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    top: 0;
    overflow: scroll;
    z-index: 100;
    background-color: rgba(0, 0, 0, 0.55);
}
#logs {
    padding: 0 0.5em;
}
.log-entry {
    padding: 0.3em 0.5em;
    margin: 0.25em 0;
    color: white;
    border-radius: 2px;
    font-size: 0.8rem; 
    font-family: monospace;
    word-break: break-word;
}
.log-entry .contents {
    white-space: pre-wrap;
}
.log-entry.l0 {
    background-color: rgb(50, 50, 50);
}
.log-entry.l1 {
    background-color: #172e97;
}
.log-entry.l2 {
    background-color: #fdf500;
    color: black;
}
.log-entry.l3 {
    background-color: #bb0c00;
}
</style>
<template id="entry-template">
    <div class="log-entry">
        <span class="contents"></span>
    </div>
</template>
<div id="logs"></div>
`;

        this.logList = dom.getElementById("logs")!;
        this.entryTemplate = dom.getElementById("entry-template") as HTMLTemplateElement;

        this.style.display = "none"; // by default
    }
    
    showEntries(...entries: [DuelLogLevel, string, any][]) {
        function objToStr(o: any): string {
            if (typeof o === "string") {
                return o;
            }
            if (o instanceof Error) {
                return `${o.name}: ${o.message}\n${o.stack}`;
            }
            return "";
        }

        if (!this.displayed) {
            // could probably be optimized a bit more, but it's not the priority rn
            this.queuedEntries.push(...entries);
            return;
        }

        const scrollDelta = this.scrollHeight - this.scrollTop - this.clientHeight;
        
        const excessChildren 
            = Math.min(Math.max(0, this.logList.children.length - LOG_MAX + entries.length), 100);
        if (excessChildren > 1) {
            const nodes = [...this.logList.children];
            this.logList.replaceChildren(...nodes.slice(0, -excessChildren))
        } else if (excessChildren == 1) {
            this.logList.children[0].remove();
        }
        
        for (const [level, message, objs] of entries) {
            const completeMsg = objs.length === 0 ? message :
                message + " " + objs.map(objToStr).join(" ");

            const fragment = this.entryTemplate.content.cloneNode(true) as DocumentFragment;
            const entry = fragment.firstElementChild!;
            entry.querySelector(".contents")!.textContent = completeMsg;
            this.logList.appendChild(entry);

            // if (this.logList.children.length > LOG_MAX) {
            //     this.logList.children[0].remove();
            // }

            entry.classList.add("l" + level);
        }
        
        // scroll to bottom when we're already at the bottom
        if (scrollDelta < 15) {
            this.scrollTo(0, this.scrollHeight);
        }
    }

    display() {
        this.style.display = "block";
        this.scrollTo(0, this.scrollHeight)
        this.displayed = true;
        
        let entries = this.queuedEntries;
        if (this.queuedEntries.length > LOG_MAX) {
            entries = this.queuedEntries.slice(-LOG_MAX);
        }
        this.showEntries(...entries);
        this.queuedEntries.splice(0, this.queuedEntries.length);
    }

    hide() {
        this.style.display = "none";
        this.displayed = false;
    }
    
    toggle() {
        if (!this.displayed) {
            this.display();
        } else {
            this.hide();
        }
    }
}