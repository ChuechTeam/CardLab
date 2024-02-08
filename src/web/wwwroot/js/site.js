import { DrawCanvas } from "./draw.js";

const baseUrl = window.location.origin;
const lobbyUrl = new URL("/game/lobby", baseUrl);

const cardLab = {
    gameContainer: null,
    socket: null,
    refreshInterval: 2000,

    cardEditors: [],

    init() {
        this.gameContainer = document.getElementById("game-container");

        if ("clGamePage" in window) {
            if (window.clGamePage === "lobby") {
                setTimeout(() => this.updateLobby(), this.refreshInterval);
            } else if (window.clGamePage === "makeCards") {
                this.makeCardsInit();
            }
        }
    },

    async updateLobby() {
        const res = await fetch(`${lobbyUrl}?fragment=true`);
        if (res.redirected) {
            window.location.href = res.url;
        } else if (res.ok) {
            const players = document.getElementById("lobby-players");
            players.outerHTML = await res.text();
        }

        setTimeout(() => this.updateLobby(), this.refreshInterval);
    },

    makeCardsInit() {
        const nodes = document.querySelectorAll(".card-editor");

        for (const n of nodes) {
            this.cardEditors.push(new CardEditor(n));
        }
    },
    
    startSocket() {
        const domainRoot = window.location.host;
        this.socket = new WebSocket(`ws://${domainRoot}/api/game/ws`);
        
        // Add all the event listeners for debugging
        this.socket.addEventListener("open", () => console.log("Socket opened"));
        this.socket.addEventListener("close", () => console.log("Socket closed"));
        this.socket.addEventListener("error", () => console.log("Socket error"));
        this.socket.addEventListener("message", (e) => console.log("Socket message", e.data));
    },
    
    askTheServerToPingMePlease() {
        fetch(new URL("api/game/ping-me", baseUrl), { method: 'POST' })
            .then((_) => console.log("i should be pinged now"))
            .catch((e) => console.error("Failed to ping server", e));
    }
}

// Handy for debugging
window.cardLab = cardLab

class CardEditor {
    constructor(node) {
        this.node = node;
        this.cardPreview = node.querySelector(".game-card");
        this.nameInput = node.querySelector(".-name-input");
        this.descInput = node.querySelector(".-desc-input");
        this.attackInput = node.querySelector(".-attack-input");
        this.healthInput = node.querySelector(".-health-input");
        this.costInput = node.querySelector(".-cost-input");
        this.canvasNode = node.querySelector(".-draw-canvas");

        this.nameInput.addEventListener("input", () => this.updateName());
        this.descInput.addEventListener("input", () => this.updateDesc());
        this.attackInput.addEventListener("input", () => this.updateAttack());
        this.healthInput.addEventListener("input", () => this.updateHealth());
        this.costInput.addEventListener("input", () => this.updateCost());
        
        this.drawCanvas = new DrawCanvas(this.canvasNode);
    }

    updateName() {
        this.cardPreview.querySelector(".-name").textContent = this.nameInput.value;
    }
    
    updateDesc() {
        this.cardPreview.querySelector(".-desc > *").textContent = this.descInput.value;
    }

    updateAttack() {
        this.cardPreview.querySelector(".-attack > .-val").textContent = this.attackInput.value;
    }

    updateHealth() {
        this.cardPreview.querySelector(".-health > .-val").textContent = this.healthInput.value;
    }

    updateCost() {
        this.cardPreview.querySelector(".-cost").textContent = this.costInput.value;
    }
}

cardLab.init();
