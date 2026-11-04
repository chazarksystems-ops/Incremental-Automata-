import { describe, expect, it } from 'vitest';
import { loadFixtures, runFixture } from '../../scripts/validate-fixtures/fixtures';

const fixtures = loadFixtures();

describe('reference fixtures (python-lifelib, dead boundary)', () => {
  it('has the canonical fixture set', () => {
    expect(fixtures.map((f) => f.id)).toEqual(
      expect.arrayContaining(['block-still', 'blinker-p2', 'glider-open', 'glider-edge-corner', 'gosper-chamber-128', 'eater-consumes-glider', 'soup-interior', 'soup-full-board']),
    );
  });

  it.each(fixtures.map((f) => [f.id, f] as const))('%s matches the reference at every checkpoint', (_id, spec) => {
    expect(spec.reference?.tool).toMatch(/lifelib/);
    for (const r of runFixture(spec)) {
      expect(r.actual, `generation ${r.generation}`).toEqual(r.expected);
    }
  });
});
