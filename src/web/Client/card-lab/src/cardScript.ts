import * as Blockly from 'blockly/core';

export let blocklyToolbox = {
    "kind": "categoryToolbox",
    "contents": [
        {
            "kind": "category",
            "name": "Actions",
            "contents": [] as any,
        },
        {
            "kind": "category",
            "name": "Évènements",
            "contents": [] as any,
        },
        {
            "kind": "category",
            "name": "Cibles",
            "contents": [] as any
        }
    ]
};

type CardLabBlock = Blockly.Block & ({
    labType: "event"
    type: CardEventType
} | {
    labType: "action"
    type: CardActionType
}) | {
    labType: "target"
    type: TargetType,
    frenchAuInsteadOfA: boolean
}

export function initBlockly() {
    function defineEventBlock(type: CardEventType, data: any, initFunc: ((block: any) => void) | null = null) {
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
        blocklyToolbox.contents[1].contents.push({"kind": "block", "type": type})
    }

    function defineActionBlock(type: CardActionType, data: any,
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

    function defineTargetBlock(type: TargetType, data: any,
                               settings: {
                                   initFunc?: ((block: any) => void) | null,
                                   frenchAuInsteadOfA?: boolean
                               } = {}) {
        Blockly.Blocks[type] = {
            init() {
                this.jsonInit({
                    type: type,
                    "colour": 40,
                    "output": "Target",
                    ...data
                });

                this.labType = "target";

                if (settings.initFunc) {
                    settings.initFunc(this);
                }
                this.frenchAuInsteadOfA = settings.frenchAuInsteadOfA === true;
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

    defineActionBlock('hurt', {
        "message0": "Infliger %1 dégât(s) à %2",
        "args0": [
            {
                "type": "field_number",
                "name": "damage",
                "value": 1,
                "min": 1,
                "max": 99
            },
            {
                "type": "input_value",
                "name": "target",
                "check": "Target"
            }
        ]
    })

    defineEventBlock('whenISpawn', {
        "message0": "Lorsque la carte est jouée",
    });

    defineTargetBlock('randomEnemy', {
        "message0": "un ennemi au hasard"
    });

    defineTargetBlock("enemyCore", {
        "message0": "noyau ennemi"
    }, {
        frenchAuInsteadOfA: true
    });

    defineTargetBlock("myCore", {
        "message0": "mon noyau"
    });
}

function blockToScriptTarget(block: CardLabBlock): Target {
    if (block.labType !== 'target') {
        throw new Error("Not a target block.")
    }

    return {type: block.type}
}

// null if action block invalid
function blockToScriptAction(block: CardLabBlock): CardAction | null {
    if (block.labType !== 'action') {
        throw new Error("Not an action block.")
    }

    const base = {type: block.type} as CardAction
    switch (base.type) {
        case "drawCard":
            base.numCards = parseInt(block.getFieldValue('nCards'))
            break;
        case "hurt":
            const target = block.getInputTargetBlock('target') as CardLabBlock
            if (target === null) {
                return null;
            }
            base.target = blockToScriptTarget(target)
            base.damage = parseInt(block.getFieldValue('damage'))
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