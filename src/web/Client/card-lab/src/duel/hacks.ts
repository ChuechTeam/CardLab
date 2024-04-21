// A scary file where we do really illegal stuff to circumvent pixi's limitations.

import {GpuStencilModesToPixi, Renderer, STENCIL_MODES, StencilMaskInstruction, StencilMaskPipe} from "pixi.js";

const INVERSE_MASK = 5 as STENCIL_MODES;

// Will this survive the test of time? Who knows.
export function usePixiRenderingHacks() {
    GpuStencilModesToPixi[INVERSE_MASK] = {
        stencilWriteMask: 0,
        stencilFront: {
            compare: 'not-equal' as any,
            passOp: 'keep',
        },
        stencilBack: {
            compare: 'not-equal' as any,
            passOp: 'keep',
        },
    };
    
    const origFunc = StencilMaskPipe.prototype.execute;
    StencilMaskPipe.prototype.execute = function(instruction: StencilMaskInstruction) {
        const maskCont = instruction.mask?.mask;
        if (maskCont != null && "inverseMask" in maskCont && maskCont.inverseMask === true && instruction.action === 'pushMaskEnd')   
        {
            const renderer = (this as any)._renderer as Renderer;
            const renderTargetUid = renderer.renderTarget.renderTarget.uid;

            let maskStackIndex = (this as any)._maskStackHash[renderTargetUid] ??= 0;
            
            renderer.stencil.setStencilMode(INVERSE_MASK, maskStackIndex);
            renderer.colorMask.setMask(0xF);
        } else {
            origFunc.call(this, instruction);
        }
    }
}