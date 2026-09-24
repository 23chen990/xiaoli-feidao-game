export interface ScreenPoint {
  x: number;
  y: number;
}

export interface ViewportSize {
  width: number;
  height: number;
}

const SAFE_MARGIN = 36;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function clampFinishLabelPosition(point: ScreenPoint, viewport: ViewportSize, margin = SAFE_MARGIN): ScreenPoint {
  const safeWidth = Math.max(1, viewport.width);
  const safeHeight = Math.max(1, viewport.height);
  const safeMargin = Math.max(0, margin);
  return {
    x: clamp(point.x, safeMargin, safeWidth - safeMargin),
    y: clamp(point.y, safeMargin, safeHeight - safeMargin),
  };
}
