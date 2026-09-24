export const visibleDecision=({pixelY,confidence,elapsedSinceTap,threshold})=>confidence&&pixelY>threshold&&elapsedSinceTap>=650;
