import { describe, expect, it } from 'vitest';
import { GenerationClock } from '../../src/game/clock';

describe('GenerationClock', () => {
  it('converts elapsed time to whole generations, carrying the remainder', () => {
    const c = new GenerationClock({ generationsPerSecond: 10 });
    expect(c.tick(50)).toBe(0);
    expect(c.tick(50)).toBe(1);
    expect(c.tick(250)).toBe(2);
    expect(c.tick(50)).toBe(1); // 50 carried + 50
  });

  it('is independent of frame rate over a long run', () => {
    for (const fps of [30, 60, 144]) {
      const c = new GenerationClock({ generationsPerSecond: 37 });
      let total = 0;
      for (let f = 0; f < fps * 10; f++) total += c.tick(1000 / fps);
      expect(Math.abs(total - 370), `${fps} fps`).toBeLessThanOrEqual(1);
    }
  });

  it('caps work per tick and reports lag instead of skipping generations', () => {
    const c = new GenerationClock({ generationsPerSecond: 1000, maxGenerationsPerTick: 16 });
    expect(c.tick(1000)).toBe(16);
    expect(c.lagging).toBe(true);
    expect(c.tick(5)).toBe(5); // backlog dropped, not replayed later
    expect(c.lagging).toBe(false);
  });

  it('rejects invalid rates and ignores invalid dt', () => {
    expect(() => new GenerationClock({ generationsPerSecond: 0 })).toThrow();
    const c = new GenerationClock({ generationsPerSecond: 10 });
    expect(() => (c.generationsPerSecond = -1)).toThrow();
    expect(c.tick(Number.NaN)).toBe(0);
    expect(c.tick(-100)).toBe(0);
  });
});
