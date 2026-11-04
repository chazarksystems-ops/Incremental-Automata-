/**
 * Camera: maps board cells ↔ screen (CSS) pixels.
 * screen = (cell - origin) * zoom, where `origin` is the cell coordinate at
 * the top-left of the viewport and `zoom` is CSS pixels per cell.
 */
export interface Camera {
  originX: number;
  originY: number;
  zoom: number;
}

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 48;

export function clampZoom(z: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
}

export function screenToCell(cam: Camera, sx: number, sy: number): { x: number; y: number } {
  return { x: cam.originX + sx / cam.zoom, y: cam.originY + sy / cam.zoom };
}

export function screenToCellInt(cam: Camera, sx: number, sy: number): { x: number; y: number } {
  const c = screenToCell(cam, sx, sy);
  return { x: Math.floor(c.x), y: Math.floor(c.y) };
}

export function cellToScreen(cam: Camera, cx: number, cy: number): { x: number; y: number } {
  return { x: (cx - cam.originX) * cam.zoom, y: (cy - cam.originY) * cam.zoom };
}

/** Zoom by `factor` keeping the cell under screen point (sx, sy) fixed. */
export function zoomAt(cam: Camera, sx: number, sy: number, factor: number): Camera {
  const zoom = clampZoom(cam.zoom * factor);
  const anchor = screenToCell(cam, sx, sy);
  return { zoom, originX: anchor.x - sx / zoom, originY: anchor.y - sy / zoom };
}

/** Pan by a screen-space drag delta. */
export function panBy(cam: Camera, dxScreen: number, dyScreen: number): Camera {
  return { ...cam, originX: cam.originX - dxScreen / cam.zoom, originY: cam.originY - dyScreen / cam.zoom };
}

/** Fit a board inside a viewport with `padding` CSS px, centred. */
export function fitBoard(boardW: number, boardH: number, viewW: number, viewH: number, padding = 16): Camera {
  const zoom = clampZoom(Math.min((viewW - 2 * padding) / boardW, (viewH - 2 * padding) / boardH));
  return { zoom, originX: boardW / 2 - viewW / 2 / zoom, originY: boardH / 2 - viewH / 2 / zoom };
}
