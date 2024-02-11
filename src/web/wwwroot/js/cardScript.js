export let blocklyToolbox;

export function initBlockly() {
    blocklyToolbox = {
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
        ]
    };
    
    function defineEventBlock(type, data, initFunc = null) {
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
        blocklyToolbox.contents[1].contents.push({ "kind": "block", "type": type })
    }

    function defineActionBlock(type, data, initFunc = null) {
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
        blocklyToolbox.contents[0].contents.push({ "kind": "block", "type": type })
    }

    Blockly.Theme.defineTheme('cardLab', {
        'base': Blockly.Themes.Classic,
        "fontStyle": {
            "family": "Chakra Petch, sans-serif",
            "size": 11
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

export function blocklyWorkspaceToScript(workspace) {
    const handlers = []
    
    for (const block of workspace.getAllBlocks()) {
        if (block.labType === 'event') {
            const handler = { event: block.type, actions: [] }
            let conn = block.nextConnection
            while (conn !== null) {
                const targetBlock = conn.targetBlock();
                if (targetBlock !== null) {
                    handler.actions.push({ type: targetBlock.type })
                    conn = targetBlock.nextConnection
                } else {
                    break;
                }
            }
            
            handlers.push(handler)
        }
    }
    
    return {
        handlers: handlers
    }
}
window.blocklyWorkspaceToScript = blocklyWorkspaceToScript; // For debugging
// Called in the module for now, should later be called asynchronously while loading
// blockly in the background.
initBlockly();