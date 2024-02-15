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
        {
            "kind": "category",
            "name": "Cibles",
            "contents": []
        }
    ] as any
};

type CardLabBlock = Blockly.Block & ({
    labType: "event"
    type: CardEventType
} | {
    labType: "action"
    type: CardActionType
}) | {
    labType: "cardTarget"
    type: CardTargetType
}

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

    function defineActionBlock(type: string, data: any, 
                               initFunc: ((block: any) => void) | null = null) {
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
    
    function defineTargetBlock(type: string, data: any,
                               initFunc: ((block: any) => void) | null = null) {
        Blockly.Blocks[type] = {
            init() {
                this.jsonInit({
                    type: type,
                    "colour": 40,
                    "output": "CardTarget",
                    ...data
                });

                this.labType = "cardTarget";
                if (initFunc != null && typeof initFunc === 'function') {
                    initFunc(this);
                }
            }
        }
        blocklyToolbox!.contents[2].contents.push({"kind": "block", "type": type})
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

    defineActionBlock('winGame', {
        "message0": "Gagner la partie",
    });

    defineActionBlock('drawCard', {
        "message0": "Piocher %1 carte(s)",
        "args0": [
            {
                "type": "field_number",
                "name": "nCards",
                "value": 1,
                "min": 0,
                "max": 4
            }
        ]
    });
    
    defineActionBlock('hurtCard',  {
        "message0": "Infliger 1 dégât à %1",
        "args0": [
            {
                "type": "input_value",
                "name": "target",
                "check": "CardTarget"
            }
        ]
    })

    defineEventBlock('whenISpawn', {
        "message0": "Lorsque la carte est jouée",
    });
    
    defineTargetBlock('randomEnemy', {
        "message0": "un ennemi au hasard"
    });
}

// null if action block invalid
function blockToScriptAction(block: CardLabBlock): CardAction | null {
    if (block.labType !== 'action') {
        throw new Error("Not an action block.")
    }
    
    const base = {type: block.type} as CardAction
    switch (base.type) {
        case "heal":
            break;
        case "drawCard":
            base.numCards = parseInt(block.getFieldValue('nCards'))
            break;
        case "hurtCard":
            const target = block.getInputTargetBlock('target')
            if (target === null) {
                return null;
            }
            break;
    }
    
    return base
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
                    const action = blockToScriptAction(targetBlock);
                    if (action !== null) {
                        handler.actions.push(action)
                    }
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