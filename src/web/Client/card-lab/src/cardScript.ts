import * as Blockly from 'blockly/core';

export let blocklyToolbox = {
    "kind": "categoryToolbox",
    "contents": [
        {
            "kind": "category",
            "name": "Évènements",
            "contents": [] as any,
        },
        {
            "kind": "category",
            "name": "Actions",
            "contents": [] as any,
        },
        {
            "kind": "category",
            "name": "Cibles",
            "contents": [] as any
        },
        {
            "kind": "category",
            "name": "Filtres",
            "contents": [] as any
        },
        {
            "kind": "category",
            "name": "Conditions",
            "contents": [] as any,
        }
    ]
};

type CardLabBlock<T extends CardLabBlockType = CardLabBlockType> = Blockly.Block &
    ({
        [K in CardLabBlockType]: { labType: K, scriptType: BlockTypeMap[K] | null }
    })[T]

type CardLabBlockType = "action" | "event" | "target" | "filter"
type BlockTypeMap = {
    "action": ScriptActionType,
    "event": ScriptEventType,
    "target": TargetType,
    "filter": FilterType
}

type BlockDefData<T extends CardLabBlockType = CardLabBlockType> = {
    name?: string
    labType: T
    scriptType: BlockTypeMap[T] | null
    def: any
    outputSubtypes?: string[]
    skipToolbox?: boolean
    condition?: boolean
    initFunc?: ((block: any) => void),
    toolboxData?: any
}

const blockInitMap = {
    "action": {
        json: {
            "colour": 230,
            "previousStatement": null,
            "nextStatement": null,
        },
        toolboxIdx: 1
    },
    "event": {
        json: {
            "colour": 90,
            "nextStatement": null,
        },
        toolboxIdx: 0
    },
    "target": {
        json: {
            "colour": 40,
            "output": "Target",
        },
        toolboxIdx: 2
    },
    "filter": {
        json: {
            "colour": 120,
            "output": "Filter",
        },
        toolboxIdx: 3
    },
    "condition": {
        json: {
            "colour": 170,
            "previousStatement": null,
            "nextStatement": null,
        },
        toolboxIdx: 4
    }
}

type BlockMap = {
    [T in CardLabBlockType]: Omit<BlockDefData<T>, "labType">[];
};


const blocks: BlockMap = {
    "action": [
        {
            scriptType: "draw",
            def: {
                "message0": "Piocher %1 carte(s) %2 ayant %3",
                "args0": [
                    {
                        "type": "field_number",
                        "name": "num",
                        "value": 1,
                        "min": 0,
                        "max": 4
                    },
                    {"type": "input_end_row"},
                    {
                        "type": "input_value",
                        "name": "filter",
                        "check": "FilterCardCompat"
                    }
                ]
            },
            toolboxData: {
                "inputs": {
                    "filter": {
                        "shadow": {
                            "type": "noneFilter"
                        }
                    }
                }
            }
        },
        {
            scriptType: "discard",
            def: {
                "message0": "Défausser %1 carte(s) %2 %3 ayant %4",
                "args0": [
                    {
                        "type": "field_number",
                        "name": "nCards",
                        "value": 1,
                        "min": 0,
                        "max": 3
                    },
                    {
                        "type": "field_dropdown",
                        "name": "target",
                        "options": [
                            ["de ma main", "myHand"],
                            ["de la main adverse", "advHand"],
                        ]
                    },
                    {"type": "input_end_row"},
                    {
                        "type": "input_value",
                        "name": "filter",
                        "check": "FilterCardCompat"
                    }
                ]
            },
            toolboxData: {
                "inputs": {
                    "filter": {
                        "shadow": {
                            "type": "noneFilter"
                        }
                    }
                }
            }
        },
        {
            scriptType: "modifier",
            def: {
                "message0": "Appliquer un %1 de %2 %3 %4 pour %5 %6 qui expire %7",
                "args0": [
                    {
                        "type": "field_dropdown",
                        "name": "type",
                        "options": [
                            ["bonus", "buff"],
                            ["malus", "debuff"]
                        ]
                    },
                    {
                        "type": "field_number",
                        "name": "value",
                        "value": 1,
                        "min": 0,
                        "max": 6
                    },
                    {
                        "type": "field_dropdown",
                        "name": "attr",
                        "options": [
                            ["ATQ", "attack"],
                            ["PV MAX", "health"],
                            ["COÛT", "cost"]
                        ]
                    },
                    {"type": "input_end_row"},
                    {
                        "type": "input_value",
                        "name": "target",
                        "check": "Target"
                    },
                    {"type": "input_end_row"},
                    {
                        "type": "field_dropdown",
                        "name": "expire",
                        "options": [
                            ["à la fin du tour", "1"],
                            ["après 2 tours", "2"],
                            ["après mon élimination", "0"],
                            ["jamais", "-1"]
                        ]
                    }
                ]
            },
            toolboxData: {
                "inputs": {
                    "target": {
                        "shadow": {
                            "type": "noneTarget"
                        }
                    }
                }
            }
        },
        {
            scriptType: "deploy",
            def: {
                "message0": "Déployer une unité aléatoire %1 ayant %2 %3 situé %4",
                "args0": [
                    {
                        "type": "input_end_row"
                    },
                    {
                        "type": "input_value",
                        "name": "filter",
                        "check": "FilterUnitCompat"
                    },
                    {
                        "type": "input_end_row"
                    },
                    {
                        "type": "field_dropdown",
                        "name": "direction",
                        "options": [
                            ["à ma droite", "right"],
                            ["à ma gauche", "left"],
                            ["devant moi", "up"],
                            ["derrière moi", "down"]
                        ]
                    }
                ]
            },
            toolboxData: {
                "inputs": {
                    "filter": {
                        "shadow": {
                            "type": "noneFilter"
                        }
                    }
                }
            }
        },
        {
            scriptType: "hurt",
            def: {
                "message0": "Infliger %1 dégât(s) %2 à %3",
                "args0": [
                    {
                        "type": "field_number",
                        "name": "damage",
                        "value": 1,
                        "min": 1,
                        "max": 15
                    },
                    {"type": "input_end_row"},
                    {
                        "type": "input_value",
                        "name": "target",
                        "check": "Target"
                    }
                ]
            },
            toolboxData: {
                "inputs": {
                    "target": {
                        "shadow": {
                            "type": "noneTarget"
                        }
                    }
                }
            }
        },
        {
            scriptType: "heal",
            def: {
                "message0": "Soigner %1 PV %2 de %3",
                "args0": [
                    {
                        "type": "field_number",
                        "name": "damage",
                        "value": 1,
                        "min": 1,
                        "max": 15
                    },
                    {"type": "input_end_row"},
                    {
                        "type": "input_value",
                        "name": "target",
                        "check": "Target"
                    }
                ]
            },
            toolboxData: {
                "inputs": {
                    "target": {
                        "shadow": {
                            "type": "noneTarget"
                        }
                    }
                }
            }
        },
        {
            scriptType: "attack",
            def: {
                "message0": "Attaquer %1",
                "args0": [
                    {
                        "type": "input_value",
                        "name": "target",
                        "check": "Target"
                    }
                ]
            },
            toolboxData: {
                "inputs": {
                    "target": {
                        "shadow": {
                            "type": "noneTarget"
                        }
                    }
                }
            }
        },
        {
            scriptType: "singleConditional",
            def: {
                "message0": "Si %1 vérifie %2 alors %3",
                "args0": [
                    {
                        "type": "field_dropdown",
                        "name": "target",
                        "options": [
                            ["je", "me"],
                            ["l'initiateur", "source"],
                            ["la cible", "target"]
                        ]
                    },
                    {
                        "type": "input_value",
                        "name": "condition",
                        "check": "Filter",
                    },
                    {
                        "type": "input_statement",
                        "name": "then",
                        "check": "Action"
                    }
                ],
                "inputsInline": true
            },
            condition: true,
            toolboxData: {
                "inputs": {
                    "condition": {
                        "shadow": {
                            "type": "noneFilter"
                        }
                    }
                }
            }
        },
        {
            scriptType: "multiConditional",
            def: {
                "message0": "Si au moins %1 unité(s) %2 vérifie %3 alors %4",
                "args0": [
                    {
                        "type": "field_number",
                        "name": "num",
                        "value": 1,
                        "min": 1,
                        "max": 4
                    },
                    {
                        "type": "field_dropdown",
                        "name": "team",
                        "options": [
                            ["alliée(s)", "ally"],
                            ["ennemie(s)", "enemy"],
                            ["quelconque", "any"]
                        ]
                    },
                    {
                        "type": "input_value",
                        "name": "condition",
                        "check": "FilterUnitCompat",
                    },
                    {
                        "type": "input_statement",
                        "name": "then",
                        "check": "Action"
                    }
                ],
                "inputsInline": true
            },
            condition: true,
            toolboxData: {
                "inputs": {
                    "condition": {
                        "shadow": {
                            "type": "noneFilter"
                        }
                    }
                }
            }
        }
    ],
    "event": [
        {
            scriptType: "postSpawn",
            def: {
                "message0": "Après avoir été déployé",
            }
        },
        {
            scriptType: "postUnitEliminated",
            def: {
                "message0": "Après l'élimination %1",
                "args0": [
                    {
                        "type": "field_dropdown",
                        "name": "team",
                        "options": [
                            [
                                "de moi-même",
                                "self"
                            ],
                            [
                                "d'une unité ennemie",
                                "enemy"
                            ],
                            [
                                "d'une unité alliée",
                                "ally"
                            ],
                            [
                                "d'une unité quelconque",
                                "any"
                            ]
                        ]
                    }
                ]
            }
        },
        {
            scriptType: "postUnitKill",
            def: {
                "message0": "Après avoir tué une unité",
            }
        },
        {
            scriptType: "postUnitHurt",
            def: {
                "message0": "Après que %1 ait %2 des dégâts",
                "args0": [
                    {
                        "type": "field_dropdown",
                        "name": "team",
                        "options": [
                            [
                                "moi-même",
                                "self"
                            ],
                            [
                                "une unité ennemie",
                                "enemy"
                            ],
                            [
                                "une unité alliée",
                                "ally"
                            ],
                            [
                                "une unité quelconque",
                                "any"
                            ]
                        ]
                    },
                    {
                        "type": "field_dropdown",
                        "name": "dealt",
                        "options": [
                            [
                                "subi",
                                "false"
                            ],
                            [
                                "infligé",
                                "true"
                            ]
                        ]
                    }
                ]
            }
        },
        {
            scriptType: "postUnitHeal",
            def: {
                "message0": "Après que %1 ait %2 des soins",
                "args0": [
                    {
                        "type": "field_dropdown",
                        "name": "team",
                        "options": [
                            [
                                "moi-même",
                                "self"
                            ],
                            [
                                "une unité ennemie",
                                "enemy"
                            ],
                            [
                                "une unité alliée",
                                "ally"
                            ],
                            [
                                "une unité quelconque",
                                "any"
                            ]
                        ]
                    },
                    {
                        "type": "field_dropdown",
                        "name": "dealt",
                        "options": [
                            [
                                "reçu",
                                "false"
                            ],
                            [
                                "donné",
                                "true"
                            ]
                        ]
                    }
                ]
            }
        },
        {
            scriptType: "postUnitAttack",
            def: {
                "message0": "Après que %1 %2",
                "args0": [
                    {
                        "type": "field_dropdown",
                        "name": "team",
                        "options": [
                            [
                                "moi-même",
                                "self"
                            ],
                            [
                                "une unité ennemie",
                                "enemy"
                            ],
                            [
                                "une unité alliée",
                                "ally"
                            ],
                            [
                                "une unité quelconque",
                                "any"
                            ]
                        ]
                    },
                    {
                        "type": "field_dropdown",
                        "name": "dealt",
                        "options": [
                            [
                                "ait attaqué",
                                "true"
                            ],
                            [
                                "ait été attaqué",
                                "false"
                            ]
                        ]
                    }
                ]
            }
        },
        {
            scriptType: "postUnitNthAttack",
            def: {
                "message0": "Après avoir attaqué pour la %1 fois",
                "args0": [
                    {
                        "type": "field_dropdown",
                        "name": "num",
                        "options": [
                            [
                                "1ère",
                                "1"
                            ],
                            [
                                "2e",
                                "2"
                            ],
                            [
                                "3e",
                                "3"
                            ],
                            [
                                "4e",
                                "4"
                            ]
                        ]
                    }
                ]
            }
        },
        {
            scriptType: "postNthCardPlay",
            def: {
                "message0": "Après avoir joué %1 cartes ce tour",
                "args0": [
                    {
                        "type": "field_number",
                        "name": "num",
                        "value": 2,
                        "min": 2,
                        "max": 5
                    }
                ]
            }
        },
        {
            scriptType: "postCardMove",
            def: {
                "message0": "Après avoir %1 une carte",
                "args0": [
                    {
                        "type": "field_dropdown",
                        "name": "action",
                        "options": [
                            [
                                "joué",
                                "played"
                            ],
                            [
                                "pioché",
                                "drawn"
                            ],
                            [
                                "défaussé",
                                "discarded"
                            ]
                        ]
                    }
                ]
            }
        },
        {
            scriptType: "postTurn",
            def: {
                "message0": "Quand le tour %1 commence",
                "args0": [
                    {
                        "type": "field_dropdown",
                        "name": "team",
                        "options": [
                            [
                                "du joueur allié",
                                "self"
                            ],
                            [
                                "du joueur ennemi",
                                "enemy"
                            ],
                            [
                                "de n'importe quel joueur",
                                "any"
                            ]
                        ]
                    }
                ]
            }
        }
    ],
    "target": [
        {
            scriptType: "me",
            def: {
                "message0": "moi-même"
            }
        },
        {
            scriptType: "source",
            def: {
                "message0": "l'initiateur"
            }
        },
        {
            scriptType: "target",
            def: {
                "message0": "la cible"
            }
        },
        {
            name: "allUnit",
            scriptType: null,
            def: {
                "message0": "toutes les unités %1 %2 où %3",
                "args0": [
                    {
                        "type": "field_dropdown",
                        "name": "team",
                        "options": [
                            [
                                "ennemies",
                                "enemy"
                            ],
                            [
                                "alliées",
                                "ally"
                            ],
                            [
                                "quelconques",
                                "any"
                            ]
                        ]
                    },
                    {"type": "input_end_row"},
                    {
                        "type": "input_value",
                        "name": "cond",
                        "check": ["FilterUnitCompat"]
                    }
                ]
            },
            toolboxData: {
                "inputs": {
                    "cond": {
                        "shadow": {
                            "type": "noneFilter"
                        }
                    }
                }
            }
        },
        {
            name: "nUnit",
            scriptType: null,
            def: {
                "message0": "%1 unité(s) %2 aléatoire(s) %3 où %4",
                "args0": [
                    {
                        "type": "field_number",
                        "name": "num",
                        "value": 1,
                        "min": 1,
                        "max": 3
                    },
                    {
                        "type": "field_dropdown",
                        "name": "team",
                        "options": [
                            [
                                "ennemie(s)",
                                "enemy"
                            ],
                            [
                                "alliée(s)",
                                "ally"
                            ],
                            [
                                "quelconque",
                                "any"
                            ]
                        ]
                    },
                    {
                        "type": "input_end_row"
                    },
                    {
                        "type": "input_value",
                        "name": "cond",
                        "check": "FilterUnitCompat"
                    }
                ]
            },
            toolboxData: {
                "inputs": {
                    "cond": {
                        "shadow": {
                            "type": "noneFilter"
                        }
                    }
                }
            }
        },
        {
            name: "allCard",
            scriptType: null,
            def: {
                "message0": "toutes les cartes %1 %2 où %3",
                "args0": [
                    {
                        "type": "field_dropdown",
                        "name": "team",
                        "options": [
                            [
                                "dans la main alliée",
                                "ally"
                            ],
                            [
                                "dans la main ennemie",
                                "enemy"
                            ],
                            [
                                "dans n'importe quelle main",
                                "any"
                            ]
                        ]
                    },
                    {"type": "input_end_row"},
                    {
                        "type": "input_value",
                        "name": "cond",
                        "check": "FilterCardCompat"
                    }
                ]
            },
            toolboxData: {
                "inputs": {
                    "cond": {
                        "shadow": {
                            "type": "noneFilter"
                        }
                    }
                }
            }
        },
        {
            name: "nCard",
            scriptType: null,
            def: {
                "message0": "%1 carte(s) %2 aléatoire(s) %3 où %4",
                "args0": [
                    {
                        "type": "field_number",
                        "name": "num",
                        "value": 1,
                        "min": 1,
                        "max": 3
                    },
                    {
                        "type": "field_dropdown",
                        "name": "team",
                        "options": [
                            [
                                "dans la main alliée",
                                "ally"
                            ],
                            [
                                "dans la main ennemie",
                                "enemy"
                            ],
                            [
                                "dans n'importe quelle main",
                                "any"
                            ]
                        ]
                    },
                    {
                        "type": "input_end_row"
                    },
                    {
                        "type": "input_value",
                        "name": "cond",
                        "check": "FilterCardCompat"
                    }
                ]
            },
            toolboxData: {
                "inputs": {
                    "cond": {
                        "shadow": {
                            "type": "noneFilter"
                        }
                    }
                }
            }
        },
        {
            scriptType: "core",
            def: {
                "message0": "noyau %1",
                "args0": [
                    {
                        "type": "field_dropdown",
                        "name": "team",
                        "options": [
                            [
                                "allié",
                                "ally"
                            ],
                            [
                                "ennemi",
                                "enemy"
                            ]
                        ]
                    }
                ]
            }
        },
        {
            scriptType: "nearbyAlly",
            def: {
                "message0": "l'allié %1",
                "args0": [
                    {
                        "type": "field_dropdown",
                        "name": "dir",
                        "options": [
                            [
                                "à ma droite",
                                "right"
                            ],
                            [
                                "à ma gauche",
                                "left"
                            ],
                            [
                                "devant moi",
                                "up"
                            ],
                            [
                                "derrière moi",
                                "down"
                            ]
                        ]
                    }
                ],
            }
        },
        {
            name: "noneTarget",
            scriptType: null,
            def: {
                "message0": "aucune cible"
            },
            skipToolbox: true
        }
    ],
    "filter": [
        {
            scriptType: "attr",
            def: {
                "message0": "%1 %2 %3",
                "args0": [
                    {
                        "type": "field_dropdown",
                        "name": "attr",
                        "options": [
                            ["PV", "health"],
                            ["ATQ", "attack"],
                            ["COÛT", "cost"]
                        ]
                    },
                    {
                        "type": "field_dropdown",
                        "name": "comp",
                        "options": [
                            ["<", "lower"],
                            [">", "greater"],
                            ["=", "equal"]
                        ]
                    },
                    {
                        "type": "field_number",
                        "name": "value",
                        "value": 5,
                        "min": 1,
                        "max": 20
                    }
                ],
            },
            outputSubtypes: ["FilterCardCompat", "FilterUnitCompat"]
        },
        {
            scriptType: "wounded",
            def: {
                "message0": "est blessé"
            }
            ,
            outputSubtypes: ["FilterUnitCompat"]
        },
        {
            scriptType: "adjacent",
            def: {
                "message0": "est adjacent par rapport à moi"
            },
            outputSubtypes: ["FilterUnitCompat"]
        },
        {
            scriptType: "archetype",
            def: {
                "message0": "est d'archétype %1",
                "args0": [
                    {
                        "type": "field_input",
                        "name": "value",
                        "text": "[Nom]",
                        "spellcheck": true
                    }
                ],
            },
            outputSubtypes: ["FilterCardCompat", "FilterUnitCompat"]
        },
        {
            scriptType: "cardType",
            def: {
                "message0": "est une carte %1",
                "args0": [
                    {
                        "type": "field_dropdown",
                        "name": "value",
                        "options": [
                            ["unité", "unit"],
                            ["sort", "spell"]
                        ]
                    }
                ],
            },
            outputSubtypes: ["FilterCardCompat"]
        },
        {
            name: "and",
            scriptType: null,
            def: {
                "message0": "%1 %2 et %3",
                "args0": [
                    {
                        "type": "input_value",
                        "name": "left",
                        "check": "Filter",
                    },
                    {"type": "input_end_row"},
                    {
                        "type": "input_value",
                        "name": "right",
                        "check": "Filter",
                    }
                ],
            },
            // slightly dumb...
            outputSubtypes: ["FilterCardCompat", "FilterUnitCompat"]
        },
        {
            name: "noneFilter",
            scriptType: null,
            def: {
                "message0": "aucun filtre"
            },
            outputSubtypes: ["FilterCardCompat", "FilterUnitCompat"],
            skipToolbox: true
        }
    ]
}

function defineBlock<T extends CardLabBlockType>(data: BlockDefData<T>) {
    const condition = data.condition ?? false;
    const {json, toolboxIdx} = blockInitMap[condition ? "condition" : data.labType];
    const blockType = data.name ?? data.scriptType;
    if (blockType == null) {
        throw new Error("name or scriptType must be defined");
    }

    Blockly.Blocks[blockType] = {
        init() {
            const initData = {
                type: blockType,
                ...json,
                ...data.def
            };
            if (data.outputSubtypes !== undefined) {
                if (initData.output == null) {
                    initData.output = [];
                } else if (!Array.isArray(initData.output)) {
                    initData.output = [initData.output];
                }
                for (const sb of data.outputSubtypes) {
                    initData.output.push(sb);
                }
            }
            this.jsonInit(initData);

            this.labType = data.labType;
            this.scriptType = data.scriptType;
            if (data.initFunc != null && typeof data.initFunc === 'function') {
                data.initFunc(this);
            }
        }
    }
    if (!(data.skipToolbox ?? false)) {
        const toolbox = {"kind": "block", "type": blockType};
        if (data.toolboxData !== undefined) {
            Object.assign(toolbox, data.toolboxData);
        }
        blocklyToolbox!.contents[toolboxIdx].contents.push(toolbox)
    }
}

export function initBlockly() {
    Blockly.Theme.defineTheme('cardLab', {
        name: "cardLab",
        base: Blockly.Themes.Classic,
        fontStyle: {
            family: "Chakra Petch, sans-serif",
            size: 11
        },
        startHats: true
    });

    for (const [k, v] of Object.entries(blocks)) {
        if (k === "action" || k === "event" || k === "target" || k === "filter") {
            for (const d of v) {
                const data = d as BlockDefData
                data.labType = k;
                defineBlock(data);
            }
        }
    }
}

function isCardLabBlock<T extends CardLabBlockType = CardLabBlockType>(block: Blockly.Block | null, type?: T): block is CardLabBlock<T> {
    return block !== null && "labType" in block && (type === undefined || block.labType === type);
}

// empty array: invalid/nofilter
function blockToScriptFilter(block: Blockly.Block | null): Filter[] {
    if (!isCardLabBlock(block, "filter")) {
        return [];
    }

    const result = [] as Filter[];
    const type = block.scriptType;
    if (type === null) {
        // special case: only "and" for now
        switch (block.type) {
            case "and":
                const left = block.getInputTargetBlock('left');
                const right = block.getInputTargetBlock('right');
                result.push(...blockToScriptFilter(left));
                result.push(...blockToScriptFilter(right));
                break;
            case "noneFilter":
                break;
            default:
                console.error("Unknown target type: " + block.type);
                break;
        }
    } else {
        switch (type) {
            case "attr":
                const attr = block.getFieldValue('attr') as ScriptableAttribute;
                const op = block.getFieldValue('comp') as FilterOp;
                const value = block.getFieldValue('value') as number;

                result.push({type, attr, op, value});
                break;
            case "wounded":
            case "adjacent":
                result.push({type});
                break;
            case "archetype":
                // Will be normalized by server.
                const archetype = block.getFieldValue("value") as string;
                result.push({type, archetype});
                break;
            case "cardType":
                const kind = block.getFieldValue("value") as "unit" | "spell";
                result.push({type, kind});
        }
    }

    return result;
}

function blockToScriptTarget(block: Blockly.Block | null): Target | null {
    if (!isCardLabBlock(block, "target")) {
        return null;
    }

    const type = block.scriptType;
    if (type === null) {
        // special case: query & none
        switch (block.type) {
            case "allUnit":
            case "nUnit":
            case "allCard":
            case "nCard":
                const kind = block.type.endsWith("Card") ? "card" : "unit";
                const team = block.getFieldValue("team") as GameTeam;
                const n = block.getFieldValue("num") as number ?? -1;
                const filters = blockToScriptFilter(block.getInputTargetBlock("cond"));
                return {type: "query", kind, team, filters, n}
            case "noneTarget":
                return null;
            default:
                console.error("Unknown target type: " + block.type);
                return null;
        }
    } else {
        switch (type) {
            case "me":
            case "source":
            case "target":
                return {type};
            case "core":
                const enemy = block.getFieldValue("team") === "enemy";
                return {type, enemy};
            case "nearbyAlly":
                const direction = block.getFieldValue("dir") as UnitDirection;
                return {type, direction};
            default:
                console.error("Unknown script type: " + type);
                return null;
        }
    }
}

function blockToScriptEvent(block: Blockly.Block | null): ScriptEvent | null {
    if (!isCardLabBlock(block, "event")) {
        throw new Error("Not an event block.")
    }

    const type = block.scriptType
    switch (type) {
        case "postSpawn":
        case "postUnitKill":
            return {type}
        case "postUnitHurt":
        case "postUnitHeal":
        case "postUnitAttack":
            const team = block.getFieldValue('team') as GameTeam
            const dealt = block.getFieldValue('dealt') === "true"
            return {type, team, dealt}
        case "postUnitEliminated":
            const teamElim = block.getFieldValue('team') as GameTeam
            return {type, team: teamElim}
        case "postUnitNthAttack":
            const n = parseInt(block.getFieldValue('num'))
            return {type, n}
        case "postNthCardPlay":
            const n2 = block.getFieldValue('num') as number
            return {type, n: n2}
        case "postCardMove":
            const kind = block.getFieldValue('action') as CardMoveKind
            return {type, kind}
        case "postTurn":
            const team2 = block.getFieldValue('team') as GameTeam
            return {type, team: team2}
        default:
            console.error("Unknown event type: " + type);
            return null;
    }
}

// null if action block invalid
function blockToScriptAction(block: Blockly.Block | null): ScriptAction | null {
    if (!isCardLabBlock(block, "action")) {
        return null;
    }

    const type = block.scriptType
    if (type === null) {
        console.error("Unknown action type: " + block.type);
        return null;
    }

    let n: number;
    let filters: Filter[];
    let target: Target | null;
    let conditions: Filter[];
    let actions: ScriptAction[];
    switch (type) {
        case "draw":
            n = parseInt(block.getFieldValue('num'))
            filters = blockToScriptFilter(block.getInputTargetBlock('filter'))
            return {type, n, filters}
        case "discard":
            n = parseInt(block.getFieldValue('nCards'))
            const myHand = block.getFieldValue('target') === "myHand"
            filters = blockToScriptFilter(block.getInputTargetBlock('filter'))
            return {type, n, myHand, filters}
        case "modifier":
            const isBuff = block.getFieldValue('type') === "buff"
            const value = parseInt(block.getFieldValue('value'))
            const attr = block.getFieldValue('attr') as ScriptableAttribute
            target = blockToScriptTarget(block.getInputTargetBlock('target'))
            const duration = parseInt(block.getFieldValue('expire'))

            if (target === null) {
                return null;
            }
            return {type, isBuff, value, attr, target, duration}
        case "hurt":
        case "heal":
            const damage = parseInt(block.getFieldValue('damage'))
            target = blockToScriptTarget(block.getInputTargetBlock('target'))
            if (target === null) {
                return null;
            }
            return {type, damage, target}
        case "attack":
            target = blockToScriptTarget(block.getInputTargetBlock('target'))
            if (target === null) {
                return null;
            }
            return {type, target}
        case "singleConditional":
            const condTarget = block.getFieldValue('target') as ConditionalTarget
            conditions = blockToScriptFilter(block.getInputTargetBlock('condition'))
            actions = readActionSequence(block, "then")
            return {type, target: condTarget, conditions, actions};
        case "multiConditional":
            const minUnits = block.getFieldValue('num') as number
            const team = block.getFieldValue('team') as GameTeam
            conditions = blockToScriptFilter(block.getInputTargetBlock('condition'))
            actions = readActionSequence(block, "then")
            return {type, minUnits, team, conditions, actions};
        case "deploy":
            filters = blockToScriptFilter(block.getInputTargetBlock('filter'))
            const direction = block.getFieldValue('direction') as UnitDirection
            return {type, filters, direction}
        default:
            console.error("Unknown action type: " + type);
            return null;
    }
}

function readActionSequence(block: Blockly.Block, inputStatement?: string): ScriptAction[] {
    let conn = inputStatement != null ?
        block.getInput(inputStatement)?.connection :
        block.nextConnection;

    const actions = [] as ScriptAction[];
    while (conn != null) {
        const targetBlock = conn.targetBlock();
        if (targetBlock === null) {
            break;
        }

        const action = blockToScriptAction(targetBlock);
        if (action !== null) {
            actions.push(action);
        }
        conn = targetBlock.nextConnection
    }

    return actions;
}


export function blocklyWorkspaceToScript(workspace: Blockly.Workspace): CardScript {
    const script: CardScript = {handlers: []}
    const handlers = script.handlers
    for (const block of workspace.getAllBlocks())
        if (isCardLabBlock(block, "event")) {
            const event = blockToScriptEvent(block);
            if (event === null) {
                continue;
            }

            const handler = {
                event: event,
                actions: readActionSequence(block)
            }
            
            if (handler.actions.length !== 0) {
                handlers.push(handler)
            }
        }

    return script
}

(window as any).blocklyWorkspaceToScript = blocklyWorkspaceToScript; // For debugging
(window as any).blockly = Blockly;
// Called in the module for now, should later be called asynchronously while loading
// blockly in the background.
initBlockly();