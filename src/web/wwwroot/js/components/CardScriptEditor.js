import {blocklyToolbox, blocklyWorkspaceToScript} from "../cardScript.js";

class CardScriptEditor extends HTMLElement {
    constructor() {
        super();
    }

    connectedCallback() {
        // We need to do very ugly hacks because blockly doesn't support shadow dom well,
        // which we can sum up in three suspicious points:
        // 1. Create a blank placeholder div to get a slot in the layout
        // 2. Create the *real* blockly div and append it to the body of the page
        // 3. Move and resize it to the placeholder div when layout changes (that's the hard part)

        const dom = this.attachShadow({mode: 'open'});

        this.blocklyDiv = document.createElement('div');
        this.blocklyDiv.style.height = '500px';
        this.blocklyDiv.style.position = 'absolute';

        this.blocklyPlaceholder = document.createElement('div');
        this.blocklyPlaceholder.style.height = '500px';

        dom.appendChild(this.blocklyPlaceholder);

        this.workspace = Blockly.inject(this.blocklyDiv, {
            toolbox: blocklyToolbox,
            renderer: "zelos",
            theme: "cardLab",
            horizontalLayout: true,
            trashcan: true,
            move: {
                scrollbars: {
                    horizontal: true,
                    vertical: false
                },
                drag: true,
                wheel: false
            },
            zoom: {
                controls: true,
                wheel: false,
                startScale: 0.75,
                maxScale: 1,
                minScale: 0.5,
                scaleSpeed: 1.1,
                pinch: true
            },
            sounds: false
        });

        document.body.appendChild(this.blocklyDiv);

        this.workspace.addChangeListener(e => {
            if (e.type === Blockly.Events.BLOCK_CHANGE
                || e.type === Blockly.Events.BLOCK_DELETE
                || e.type === Blockly.Events.BLOCK_MOVE) {
                this.dispatchEvent(new CustomEvent('script-updated', {
                    detail: {
                        script: blocklyWorkspaceToScript(this.workspace)
                    }
                }));
            }
        })

        // We need to find out when the placeholder div is resized or moved.
        // We could do it every frame with requestAnimationFrame, with a 100% success rate, 
        // but it's a bit inefficient.
        // Instead, we'll use three ways to find out when the element is moved or resized.
        // Resize is handled perfectly, but position is much more tricky.

        // 1. Observe the placeholder div for resize changes, and when it changes,
        // update the blockly div size.
        this.sizeObs = new ResizeObserver(() => this.updateBlocklyDivSize());
        this.sizeObs.observe(this.blocklyPlaceholder);

        // 2. Update the blockly div position when the window is scrolled, which is usually why
        // the element moves, BUT it can also move due to other effects 
        // (like an element being resized on top of it).
        document.addEventListener('scroll', () => this.updateBlocklyDivPosition());

        // 3. To *try* handling cases where scroll is not enough, we'll observe the game container's
        // size changes. It's very likely that it changes when something else contained inside
        // also changes size, which could move the blockly div.
        this.posObs = new ResizeObserver(() => this.updateBlocklyDivPosition());
        this.posObs.observe(document.getElementById('game-container'));

        this.updateBlocklyDivPosition();
        this.updateBlocklyDivSize();
    }

    disconnectedCallback() {
        this.sizeObs.disconnect();
        this.posObs.disconnect();
        document.body.removeChild(this.blocklyDiv);
    }

    updateBlocklyDivPosition() {
        const blocklyDiv = this.blocklyDiv;

        const rect = this.blocklyPlaceholder.getBoundingClientRect();
        const y = rect.top + document.documentElement.scrollTop
        const x = rect.left;

        blocklyDiv.style.top = y + 'px';
        blocklyDiv.style.left = x + 'px';
    }

    updateBlocklyDivSize() {
        const [w, h] = [this.blocklyPlaceholder.clientWidth, this.blocklyPlaceholder.clientHeight];
        this.blocklyDiv.style.width = w + 'px';
        this.blocklyDiv.style.height = h + 'px';
        Blockly.svgResize(this.workspace)
    }
}

customElements.define('card-script-editor', CardScriptEditor);