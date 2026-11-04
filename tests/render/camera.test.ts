import { describe, expect, it } from 'vitest';
import { MAX_ZOOM, MIN_ZOOM, cellToScreen, fitBoard, panBy, screenToCell, screenToCellInt, zoomAt } from '../../src/render/camera';

describe('camera', () => {
  const cam = { originX: 10, originY: 20, zoom: 4 };

  it('screen ↔ cell round-trips', () => {
    const s = cellToScreen(cam, 13.5, 27);
    expect(s).toEqual({ x: 14, y: 28 });
    expect(screenToCell(cam, s.x, s.y)).toEqual({ x: 13.5, y: 27 });
    expect(screenToCellInt(cam, 15.9, 0)).toEqual({ x: 13, y: 20 });
  });

  it('zoomAt keeps the anchor cell under the cursor', () => {
    const before = screenToCell(cam, 200, 150);
    const z = zoomAt(cam, 200, 150, 2.5);
    expect(z.zoom).toBe(10);
    const after = screenToCell(z, 200, 150);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it('clamps zoom', () => {
    expect(zoomAt(cam, 0, 0, 1000).zoom).toBe(MAX_ZOOM);
    expect(zoomAt(cam, 0, 0, 0.0001).zoom).toBe(MIN_ZOOM);
  });

  it('panBy moves content with the drag', () => {
    const p = panBy(cam, 40, -8);
    expect(p).toEqual({ originX: 0, originY: 22, zoom: 4 });
  });

  it('fitBoard centres the board in the viewport', () => {
    const f = fitBoard(128, 128, 800, 600, 16);
    expect(f.zoom).toBeCloseTo((600 - 32) / 128);
    const centre = screenToCell(f, 400, 300);
    expect(centre.x).toBeCloseTo(64);
    expect(centre.y).toBeCloseTo(64);
  });
});
