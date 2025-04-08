class Rect {
    constructor (public x:number, public y: number, public width: number, public height: number) {}
}

// Copied from duel/util.ts
export function fitImageCover(aW: number, aH: number, tW: number, tH: number) {
    // Our end goal: artAspectRatio = targetAspectRatio; which we can write using this equation
    // aW/aH = tW/tH     (where aW = artWidth ; aH = artHeight ; tW = targetWidth ; tH = targetHeight)
    // We choose one of two solutions:
    //   aW' = aH*(tW/tH) = aH*tAR
    //   aH' = aW*(tH/tW) = aW*(1/tAR) = aW/tAR
    // However, we do not want to stretch the art, in other words, we want aW' <= aW and aH' <= aH.
    // So, when will we have aW' <= aW? That happens when the art is wider than the target area; 
    // and that occurs when tAR<aAR.
    // In the opposite situation, when tAR>aAR, we have aH' <= aH.
    //
    // However, we don't need to compute this, if we just calculate aW' and then check if it
    // fits, that works too. Since this is the most common case, it just works fine(tm).

    let artRect: Rect

    const tAR = tW / tH;
    const newAW = aH * tAR;
    if (newAW <= aW) {
        // The art is too wide! Crop it.
        const lostPixels = aW - newAW; // >= 0
        artRect = new Rect(lostPixels / 2, 0, newAW, aH);
    } else {
        // The art is too tall! Crop it.
        const newAH = aW / tAR;
        const lostPixels = aH - newAH;
        artRect = new Rect(0, lostPixels / 2, aW, newAH);
    }

    return artRect;
}

// Does the user agent signal a mobile device?
export const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

// Is fullscreen *really* supported?
export const isFullscreenSupported = "fullscreenElement" in document 
    && "fullscreenEnabled" in document 
    && document.fullscreenEnabled;