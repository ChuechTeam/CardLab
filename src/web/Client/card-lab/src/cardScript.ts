import * as Blockly from 'blockly/core';

export let blocklyToolbox = {
    "kind": "categoryToolbox",
    "contents": [
        {
            "kind": "category",
            "name": "Actions",
            "contents": [],
        },
        {
            "kind": "category",
            "name": "Évènements",
            "contents": [],
        },
    ] as any
};

type CardLabBlock = Blockly.Block & ({
    labType: "event"
    type: CardEventType
} | {
    labType: "action"
    type: CardActionType
})

export function initBlockly() {
    function defineEventBlock(type: string, data: any, initFunc: ((block: any) => void) | null = null) {
        Blockly.Blocks[type] = {
            init() {
                this.jsonInit({
                    type: type,
                    "nextStatement": null,
                    "colour": 90,
                    ...data
                });

                this.labType = "event";
                if (initFunc != null && typeof initFunc === 'function') {
                    initFunc(this);
                }
            }
        }
        blocklyToolbox.contents[1].contents!.push({"kind": "block", "type": type})
    }

    function defineActionBlock(type: string, data: any, initFunc: ((block: any) => void) | null = null) {
        Blockly.Blocks[type] = {
            init() {
                this.jsonInit({
                    type: type,
                    "colour": 230,
                    "previousStatement": null,
                    "nextStatement": null,
                    ...data
                });

                this.labType = "action";
                if (initFunc != null && typeof initFunc === 'function') {
                    initFunc(this);
                }
            }
        }
        blocklyToolbox!.contents[0].contents.push({"kind": "block", "type": type})
    }

    Blockly.Theme.defineTheme('cardLab', {
        name: "cardLab",
        base: Blockly.Themes.Classic,
        fontStyle: {
            family: "Chakra Petch, sans-serif",
            size: 11
        },
        startHats: true
    });

    defineActionBlock('winTheGame', {
        "message0": "Gagner la partie",
    });

    defineActionBlock('drawCard', {
        "message0": "Piocher une carte",
    });

    defineEventBlock('whenISpawn', {
        "message0": "Lorsque la carte est jouée",
    });
}

export function blocklyWorkspaceToScript(workspace: Blockly.Workspace): CardScript {
    const script: CardScript = {handlers: []}
    const handlers = script.handlers

    for (const block of workspace.getAllBlocks() as CardLabBlock[])
        if (block.labType === 'event') {
            const handler = {event: block.type, actions: [] as CardAction[]}
            let conn = block.nextConnection
            while (conn !== null) {
                const targetBlock = conn.targetBlock() as CardLabBlock;
                if (targetBlock !== null && targetBlock.labType === "action") {
                    handler.actions.push({type: targetBlock.type})
                    conn = targetBlock.nextConnection
                } else {
                    break;
                }
            }

            handlers.push(handler)
        }
    
    return script
}

(window as any).blocklyWorkspaceToScript = blocklyWorkspaceToScript; // For debugging
// Called in the module for now, should later be called asynchronously while loading
// blockly in the background.
initBlockly();