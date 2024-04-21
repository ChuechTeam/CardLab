import {ColorSource} from "pixi.js";

export enum AttrState {
    // Greater than base value
    BUFFED = 1,
    // Same as base value
    NEUTRAL = 0,
    // Less than base value
    NERFED = -1
}

export enum AttrCompMode {
    LESS_IS_BETTER,
    MORE_IS_BETTER
}

export function attrStateCompare(mode: AttrCompMode, base: number, actual: number): AttrState {
    let res: AttrState
    if (actual > base) {
        res = AttrState.BUFFED;
    } else if (actual < base) {
        res = AttrState.NERFED;
    } else {
        res = AttrState.NEUTRAL;
    }

    if (mode === AttrCompMode.LESS_IS_BETTER)
        res = -res;

    return res;
}

export function attrTextColor(state: AttrState): ColorSource {
    switch (state) {
        case AttrState.BUFFED:
            return 0x00cf14;
        case AttrState.NEUTRAL:
            return 0xffffff;
        case AttrState.NERFED:
            return 0xea1121;
    }
}