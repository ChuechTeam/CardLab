import { DrawCanvas } from "./draw.js";

const baseUrl = window.location.origin;
const lobbyUrl = new URL("/game/lobby", baseUrl);

const cardLab = {
    gameContainer: null,
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
    }
}

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
