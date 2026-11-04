import { describe, expect, it } from 'vitest';
import { ALL_TRANSFORMS, IDENTITY, transformGrid, transformName } from '../../src/core/transform';
import { stepLifeN } from '../../src/core/life';
import { boundingBox, crop, gridsEqual, liveCells } from '../../src/core/world';
import { board, loadPattern, show } from '../helpers';

describe('transformGrid', () => {
  const glider = loadPattern('glider');

  it('identity is a no-op and rot90 ×4 returns the original', () => {
    expect(transformGrid(glider, IDENTITY)).toEqual(glider);
    let g = glider;
    for (let i = 0; i < 4; i++) g = transformGrid(g, { rotation: 90, mirror: false });
    expect(g).toEqual(glider);
  });

  it('rot90 rotates clockwise', () => {
    const l = transformGrid(loadPattern('blinker'), { rotation: 90, mirror: false });
    expect([l.width, l.height]).toEqual([1, 3]);
    // asymmetric check: an L tromino
    const L = { width: 2, height: 2, cells: new Uint8Array([1, 0, 1, 1]) };
    expect(show(transformGrid(L, { rotation: 90, mirror: false }))).toBe('OO\nO.');
    expect(show(transformGrid(L, { rotation: 0, mirror: true }))).toBe('.O\nOO');
  });

  it('produces 8 distinct glider orientations', () => {
    const shapes = new Set(ALL_TRANSFORMS.map((t) => JSON.stringify(liveCells(transformGrid(glider, t)))));
    expect(shapes.size).toBe(8);
  });

  it('every transformed glider is still a glider (shape recurs after 4 gens, moved diagonally)', () => {
    for (const t of ALL_TRANSFORMS) {
      const g = transformGrid(glider, t);
      const w0 = board(20, 20, [{ grid: g, x: 8, y: 8 }]);
      const w4 = stepLifeN(w0, 4);
      const bb = boundingBox(w4)!;
      expect(gridsEqual(crop(w4, bb), g), transformName(t)).toBe(true);
      expect(Math.abs(bb.x - 8), transformName(t)).toBe(1);
      expect(Math.abs(bb.y - 8), transformName(t)).toBe(1);
    }
  });
});
