import {fromDom, LabElement, registerTemplate} from "src/dom.ts";
import {DrawCanvas, DrawToolState} from "src/components/DrawCanvas.ts";

const template = registerTemplate("draw-canvas-controls", /* html */`<style>
    #root {
        display: flex;
        flex-direction: column;
        gap: 8px;
        
        --color-radius: 28px;
        --color-border-width: 2px;
        --color-full-radius: calc(var(--color-radius) + var(--color-border-width) * 2);
        --drawer-padding: 3px;
    }

    .drawer {
        background-color: white;
        border: 2px solid black;
        border-bottom-width: 3px;
        padding: var(--drawer-padding);
    }

    .drawer .-title {
        padding: 4px;
        margin: calc(var(--drawer-padding) * -1) calc(var(--drawer-padding) * -1) 8px;
        background-color: black;
        color: white;
        text-align: center;
        font-family: "Chakra Petch", sans-serif;
        font-size: 1em;
    }
    
    .buttons {
        display: flex;
        gap: 8px;
    }

    .buttons button {
        flex-grow: 1;
    }

    .size-row {
        display: flex;
        column-gap: 4px;
        row-gap: 8px;
        align-items: center;
        justify-content: center;
    }

    .size-row input {
        flex-grow: 1;
    }

    #thick-txt {
        min-width: 1.5em;
        font-weight: bold;
        margin-bottom: 2px;
        text-align: center;
    }

    .pickable-color {
        width: var(--color-radius);
        height: var(--color-radius);
        border-radius: 100%;
        background-color: var(--col, #FFFFFF);

        border: var(--color-border-width) solid #a3a3a3;
    }
    
    @supports (color: color-mix(in srgb, white, white)) {
        .pickable-color {
            border-color: color-mix(in srgb, var(--col, #FFFFFF) 55%, black);
        }
    }

    .pickable-color.picked {
        --picked-width: 3px;
        border-color: #0077cc;
        border-width: var(--picked-width);
        width: calc(var(--color-full-radius) - var(--picked-width) * 2);
        height: calc(var(--color-full-radius) - var(--picked-width) * 2);
        position: relative;
    }
    
    .pickable-color.picked::before {
        content: "";
        position: absolute;
        --width: 1px;
        --off: 1px;
        --tot-off: calc(var(--picked-width) * -1 - var(--width) * 2);
        /*--rad: calc(var(--color-full-radius) - var(--width) * 2);*/
        /*left: calc(var(--picked-width) * -1);*/
        /*top: calc(var(--picked-width) * -1);*/
        background-color: transparent;
        border: var(--width) solid #004d75;
        left: var(--tot-off);
        bottom: var(--tot-off);
        right: var(--tot-off);
        top: var(--tot-off);
        border-radius: 100%;
        /*width: var(--rad);*/
        /*height: var(--rad);*/
    }

    .pickable-color.-custom {
        background: conic-gradient(
                hsl(360, 100%, 50%),
                hsl(315, 100%, 50%),
                hsl(270, 100%, 50%),
                hsl(225, 100%, 50%),
                hsl(180, 100%, 50%),
                hsl(135, 100%, 50%),
                hsl(90, 100%, 50%),
                hsl(45, 100%, 50%),
                hsl(0, 100%, 50%)
        );
        width: calc(var(--color-radius) + 4px);
        height: calc(var(--color-radius) + 4px);
        border-width: 0;
    }

    .pickable-color.-uncolored {
        background-color: transparent;
        border: 2px dashed #aaa9a9;
    }

    .custom-pickable-color {
        display: flex;
        background-color: #e3e3e1;
        border-radius: 25px;
        padding: 1px;
        margin: -1px;
        gap: 6px;
    }

    .colors {
        display: flex;
        flex-wrap: wrap;
        column-gap: 7px;
        row-gap: 7px;
        padding-bottom: 2px;
    }

    /* Hacky but it's the best we can do */
    @media (orientation: landscape) {
        .size-row, .buttons {
            flex-direction: row-reverse;
        }
    }
</style>
<div id="root">
    <div class="drawer">
        <h2 class="-title">Couleur</h2>
        <div class="colors" id="pickable-colors">
            <div class="pickable-color" style="--col: #000000"></div>
            <div class="pickable-color" style="--col: #999999"></div>
            <div class="pickable-color" style="--col: #ffffff"></div>
            <div class="pickable-color" style="--col: #e81e1e"></div>
            <div class="pickable-color" style="--col: #971717"></div>
            <div class="pickable-color" style="--col: #ED701C"></div>
            <div class="pickable-color" style="--col: #f8ed40"></div>
            <div class="pickable-color" style="--col: #15bf25"></div>
            <div class="pickable-color" style="--col: #21baaf"></div>
            <div class="pickable-color" style="--col: #1e7ecc"></div>
            <div class="pickable-color" style="--col: #1C61ED"></div>
            <div class="pickable-color" style="--col: #AB1CED"></div>
            <div class="pickable-color" style="--col: #E61CED"></div>
            <div class="custom-pickable-color">
                <div class="pickable-color -uncolored" id="pickable-custom-color"></div>
                <div class="pickable-color -custom" id="color-selector"></div>
                <input type="color" id="color-input" hidden>
            </div>
        </div>
    </div>
    <div class="drawer">
        <h2 class="-title">Taille</h2>
        <div class="size-row">
            <div id="thick-txt"></div>
            <input type="range" min="2" max="20" id="thick-input">
        </div>
    </div>
    <div class="buttons">
        <button class="cl-button" style="background-color: darkred; color: white;" id="clear-button">Effacer</button>
        <button class="cl-button" id="undo-button">Annuler</button>
    </div>
</div>
`);

export class DrawCanvasControls extends LabElement {
    boundCanvas: DrawCanvas | null = null;
    boundState: DrawToolState = new DrawToolState(); // set to boundCanvas.toolState when we have a canvas

    @fromDom("color-input") colorInput: HTMLInputElement = null!;
    @fromDom("thick-input") thickInput: HTMLInputElement = null!;
    @fromDom("thick-txt") thickTxt: HTMLSpanElement = null!;
    @fromDom("clear-button") clearButton: HTMLButtonElement = null!;
    @fromDom("undo-button") undoButton: HTMLButtonElement = null!;
    @fromDom("color-selector") colorSelector: HTMLElement = null!;
    @fromDom("pickable-custom-color") pickableCustomColor: HTMLElement = null!;
    @fromDom("pickable-colors") pickableColorsContainer: HTMLElement = null!;

    // Also includes the custom color once it is chosen.
    pickableColors = new Map<string, Element>()
    customColor: string | null = null;
    pickedColor: string | null = null;

    importGlobalStyles = true;

    render() {
        this.renderTemplate(template);
    }

    connected() {
        this.colorInput.addEventListener("input", i => {
            this.boundState.color = this.colorInput.value;
            this.updateColorUI();
        })
        this.thickInput.addEventListener("input", i => {
            this.boundState.thickness = this.sliderValToThickness(parseInt(this.thickInput.value));
            this.updateThicknessUI();
        })
        this.clearButton.addEventListener("click", i => {
            this.boundCanvas?.clear(true);
        })
        this.undoButton.addEventListener("click", i => {
            this.boundCanvas?.undo();
        })
        this.colorSelector.addEventListener("click", () => {
            this.colorInput.click();
        })

        for (let child of this.pickableColorsContainer.children) {
            if (child instanceof HTMLElement && child.classList.contains("pickable-color")) {
                const col = child.style.getPropertyValue("--col");
                if (col !== undefined) {
                    this.pickableColors.set(col.toString(), child);
                }
            }
        }
        
        this.pickableColorsContainer.addEventListener("click", e => {
            if (e.target instanceof HTMLElement) {
                const color = e.target.style.getPropertyValue("--col");
                if (color !== "") {
                    this.boundState.color = color;
                    this.updateColorUI();
                }
            }
        });
    }

    disconnected() {
        if (this.boundCanvas !== null) {
            this.boundCanvas.removeEventListener("undoStackUpdated", this.updateUndoUI);
        }
    }

    link(canvas: DrawCanvas) {
        this.boundCanvas = canvas;
        this.boundState = canvas.toolState;

        this.updateThicknessUI(true);
        this.updateUndoUI();
        this.updateColorUI();

        canvas.addEventListener("undoStackUpdated", this.updateUndoUI);
    }

    updateThicknessUI(updateSlider = false) {
        if (updateSlider) {
            if (this.boundState.thickness <= 10) {
                this.thickInput.value = this.boundState.thickness.toString();
            }
        }
        this.thickTxt.textContent = this.boundState.thickness.toString();
    }

    updateUndoUI = () => {
        if (this.boundCanvas === null) {
            return;
        }

        this.undoButton.disabled = this.boundCanvas.undoStack.images.length <= 1;
    }

    sliderValToThickness(val: number) {
        if (val <= 10) {
            return val;
        } else {
            return 10 + (val - 10) * 5;
        }
    }

    updateColorUI() {
        if (this.pickedColor !== null) {
            this.pickableColors.get(this.pickedColor)?.classList.remove("picked");
        }

        this.pickedColor = this.boundState.color;
        const element = this.pickableColors.get(this.pickedColor);
        if (element === undefined) {
            // Then we need to use the custom color: switch the color if the color is different.
            if (this.customColor !== null) {
                this.pickableColors.delete(this.customColor);
            }
            this.customColor = this.pickedColor;
            this.pickableCustomColor.style.setProperty("--col", this.pickedColor);
            this.pickableCustomColor.classList.add("picked");
            this.pickableCustomColor.classList.remove("-uncolored");

            this.pickableColors.set(this.customColor, this.pickableCustomColor);
        }
        element?.classList.add("picked");
    }
}

customElements.define("draw-canvas-controls", DrawCanvasControls);