import { describe, expect, it } from 'vitest';
import { hashWorld } from '../../src/core/hash';
import { stepLifeN } from '../../src/core/life';
import { clearRect, crop, gridsEqual, population, resizeWorld } from '../../src/core/world';
import { board, loadPattern } from '../helpers';

describe('resizeWorld', () => {
  it('keeps cells at the same coordinates and the generation', () => {
    const w = { ...board(20, 10, [{ grid: loadPattern('glider'), x: 15, y: 6 }]), generation: 7 };
    const r = resizeWorld(w, 30, 25);
    expect([r.width, r.height, r.generation]).toEqual([30, 25, 7]);
    expect(gridsEqual(crop(r, { x: 0, y: 0, width: 20, height: 10 }), w)).toBe(true);
    expect(population(r)).toBe(population(w));
    expect(population(w)).toBe(5); // input untouched
  });

  it('refuses to shrink', () => {
    expect(() => resizeWorld(board(10, 10, []), 9, 10)).toThrow();
  });

  it('a glider that would have died at the old edge keeps flying after expansion', () => {
    const w = board(16, 16, [{ grid: loadPattern('glider'), x: 8, y: 8 }]);
    const small = stepLifeN(w, 40);
    const big = stepLifeN(resizeWorld(w, 32, 32), 40);
    expect(population(big)).toBe(5);
    expect(hashWorld(small)).not.toBe(hashWorld(crop(big, { x: 0, y: 0, width: 16, height: 16 }) as never));
  });
});

describe('clearRect', () => {
  it('kills exactly the cells inside the rectangle, clipped to the board', () => {
    const gun = loadPattern('gosper-glider-gun');
    const w = board(64, 64, [{ grid: gun, x: 2, y: 2 }, { grid: loadPattern('block'), x: 50, y: 50 }]);
    const c = clearRect(w, { x: 2, y: 2, width: 36, height: 9 });
    expect(population(c)).toBe(4);
    expect(population(w)).toBe(40);
    expect(population(clearRect(w, { x: -10, y: -10, width: 200, height: 200 }))).toBe(0);
    expect(population(clearRect(w, { x: 70, y: 70, width: 5, height: 5 }))).toBe(40);
  });
});
