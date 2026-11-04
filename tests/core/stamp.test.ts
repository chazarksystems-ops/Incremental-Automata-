import { describe, expect, it } from 'vitest';
import { stampGrid } from '../../src/core/stamp';
import { createWorld, population, withCell } from '../../src/core/world';
import { loadPattern } from '../helpers';

describe('stampGrid', () => {
  const gun = loadPattern('gosper-glider-gun');
  const empty = createWorld(64, 64);

  it('places a pattern without mutating the input world', () => {
    const r = stampGrid(empty, gun, 4, 4);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(population(r.world)).toBe(36);
    expect(population(empty)).toBe(0);
    expect(r.world.generation).toBe(0);
    expect(r.warnings).toEqual([]);
    expect(r.footprint).toEqual({ x: 4, y: 4, width: 36, height: 9 });
  });

  it('applies the transform to the footprint', () => {
    const r = stampGrid(empty, gun, 4, 4, { transform: { rotation: 90, mirror: false } });
    expect(r.ok && r.footprint).toEqual({ x: 4, y: 4, width: 9, height: 36 });
  });

  it.each([[-1, 0], [0, -1], [29, 0], [0, 56]])('rejects out-of-bounds placement at (%i, %i)', (x, y) => {
    const r = stampGrid(empty, gun, x, y);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('out-of-bounds');
  });

  it('rejects overlap and placement within the clearance margin', () => {
    const occupied = withCell(empty, 20, 20, true);
    expect(stampGrid(occupied, gun, 10, 16).ok).toBe(false); // covers (20,20)
    const touching = stampGrid(occupied, gun, 21, 20); // adjacent, margin 1
    expect(touching.ok).toBe(false);
    if (!touching.ok) expect(touching.reason).toBe('overlap');
    expect(stampGrid(occupied, gun, 22, 20).ok).toBe(true); // 1 clear cell
    expect(stampGrid(occupied, gun, 21, 20, { allowOverlap: true }).ok).toBe(true);
  });

  it('warns (but allows) placement against the edge', () => {
    const r = stampGrid(empty, gun, 0, 0);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.warnings.map((w) => w.code)).toEqual(['near-edge']);
  });
});
