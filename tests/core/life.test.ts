import { describe, expect, it } from 'vitest';
import { RULE, nextState, stepLife, stepLifeN } from '../../src/core/life';
import { hashWorld } from '../../src/core/hash';
import { boundingBox, crop, createWorld, gridsEqual, population, withCell } from '../../src/core/world';
import { board, loadPattern, rleGrid } from '../helpers';

describe('B3/S23 rule table', () => {
  it('matches Conway for every (state, neighbour count)', () => {
    expect(RULE).toBe('B3/S23');
    for (let n = 0; n <= 8; n++) {
      expect(nextState(0, n), `dead with ${n}`).toBe(n === 3 ? 1 : 0);
      expect(nextState(1, n), `alive with ${n}`).toBe(n === 2 || n === 3 ? 1 : 0);
    }
  });

  it('stepLife applies the table for every neighbourhood configuration of a 3×3 centre', () => {
    // Exhaustive: all 512 3×3 neighbourhoods placed in the middle of a 5×5 board.
    for (let mask = 0; mask < 512; mask++) {
      let w = createWorld(5, 5);
      for (let b = 0; b < 9; b++) if (mask & (1 << b)) w = withCell(w, 1 + (b % 3), 1 + Math.floor(b / 3), true);
      const centre = (mask >> 4) & 1;
      let n = 0;
      for (let b = 0; b < 9; b++) if (b !== 4 && mask & (1 << b)) n++;
      const next = stepLife(w);
      expect(next.cells[2 * 5 + 2], `mask ${mask}`).toBe(nextState(centre as 0 | 1, n));
    }
  });
});

describe('canonical patterns', () => {
  it('block is unchanged after repeated steps', () => {
    const w0 = board(8, 8, [{ grid: loadPattern('block'), x: 3, y: 3 }]);
    const w = stepLifeN(w0, 50);
    expect(gridsEqual(w, w0)).toBe(true);
    expect(w.generation).toBe(50);
  });

  it('blinker has period 2', () => {
    const w0 = board(7, 7, [{ grid: loadPattern('blinker'), x: 2, y: 3 }]);
    const w1 = stepLife(w0);
    const w2 = stepLife(w1);
    expect(gridsEqual(w1, w0)).toBe(false);
    expect(boundingBox(w1)).toEqual({ x: 3, y: 2, width: 1, height: 3 });
    expect(gridsEqual(w2, w0)).toBe(true);
  });

  it('glider reproduces its shape after 4 generations, translated (+1, +1)', () => {
    const glider = loadPattern('glider');
    const w0 = board(20, 20, [{ grid: glider, x: 5, y: 5 }]);
    let w = w0;
    for (let g = 1; g <= 3; g++) {
      w = stepLife(w);
      expect(population(w), `gen ${g}`).toBe(5);
      expect(gridsEqual(crop(w, boundingBox(w)!), glider), `gen ${g} differs from phase 0`).toBe(false);
    }
    w = stepLife(w);
    expect(boundingBox(w)).toEqual({ x: 6, y: 6, width: 3, height: 3 });
    expect(gridsEqual(crop(w, boundingBox(w)!), glider)).toBe(true);
    w = stepLifeN(w, 36);
    expect(boundingBox(w)).toEqual({ x: 15, y: 15, width: 3, height: 3 });
  });
});

describe('purity and determinism', () => {
  it('stepLife does not mutate its input', () => {
    const w0 = board(64, 64, [{ grid: loadPattern('gosper-glider-gun'), x: 2, y: 2 }]);
    const before = hashWorld(w0);
    const snapshot = w0.cells.slice();
    stepLife(w0);
    stepLifeN(w0, 10);
    expect(hashWorld(w0)).toBe(before);
    expect(w0.cells).toEqual(snapshot);
  });

  it('stepping one at a time equals stepLifeN', () => {
    const w0 = board(64, 64, [{ grid: loadPattern('gosper-glider-gun'), x: 2, y: 2 }]);
    let a = w0;
    for (let i = 0; i < 200; i++) a = stepLife(a);
    expect(hashWorld(a)).toBe(hashWorld(stepLifeN(w0, 200)));
  });

  it('rejects invalid step counts', () => {
    const w = createWorld(4, 4);
    expect(() => stepLifeN(w, -1)).toThrow();
    expect(() => stepLifeN(w, 1.5)).toThrow();
    expect(stepLifeN(w, 0)).toBe(w);
  });
});

describe('fixed dead boundary', () => {
  it('a glider leaving the board never reappears on the opposite side', () => {
    const w0 = board(12, 12, [{ grid: loadPattern('glider'), x: 7, y: 7 }]);
    let w = w0;
    for (let g = 1; g <= 60; g++) {
      w = stepLife(w);
      // Nothing may ever appear in the top-left quadrant (wrap-around target).
      for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) {
        expect(w.cells[y * 12 + x], `gen ${g} cell (${x},${y})`).toBe(0);
      }
    }
  });

  it('a glider hitting the corner leaves a block (dead-boundary debris)', () => {
    // Known bounded-grid behaviour: the glider is truncated by the edge and
    // settles into a 2×2 block in the corner.
    const w = stepLifeN(board(12, 12, [{ grid: loadPattern('glider'), x: 7, y: 7 }]), 60);
    expect(crop(w, boundingBox(w)!)).toEqual(rleGrid('x = 2, y = 2\n2o$2o!'));
    expect(boundingBox(w)).toEqual({ x: 10, y: 10, width: 2, height: 2 });
  });

  it('cells on every edge see only in-board neighbours', () => {
    // A blinker lying along the top edge cannot oscillate (its vertical phase
    // would need row −1); it dies to a 2-cell remnant then nothing.
    const w0 = board(5, 5, [{ grid: loadPattern('blinker'), x: 1, y: 0 }]);
    const w1 = stepLife(w0);
    expect(boundingBox(w1)).toEqual({ x: 2, y: 0, width: 1, height: 2 });
    expect(population(stepLife(w1))).toBe(0);
  });
});
