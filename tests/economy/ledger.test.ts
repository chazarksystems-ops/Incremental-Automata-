import { describe, expect, it } from 'vitest';
import type { DetectedSignal } from '../../src/detectors/detector';
import { acceptSignal, auditEconomy, createEconomy, receiptsInWindow } from '../../src/economy/ledger';

const sig = (passageId: string, generation: number): DetectedSignal => ({
  passageId,
  generation,
  crossingGeneration: generation,
  detectorId: 'c',
  heading: 'SE',
  lateralOffset: 0,
});

describe('energy ledger', () => {
  it('awards once per passage id and stays auditable', () => {
    const e = createEconomy();
    expect(acceptSignal(e, sig('a', 10), 1).ok).toBe(true);
    const dup = acceptSignal(e, sig('a', 40), 1);
    expect(dup).toEqual({ ok: false, reason: 'duplicate-passage' });
    expect(acceptSignal(e, sig('b', 40), 1).ok).toBe(true);
    expect(e.energy).toBe(2);
    expect(e.receipts.map((r) => r.passageId)).toEqual(['a', 'b']);
    expect(auditEconomy(e)).toBe(true);
  });

  it('rejects non-positive or non-finite amounts', () => {
    const e = createEconomy();
    for (const amount of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(acceptSignal(e, sig('x', 1), amount).ok).toBe(false);
    }
    expect(e).toEqual(createEconomy());
  });

  it('counts receipts in a trailing window', () => {
    const e = createEconomy();
    for (const g of [10, 40, 70, 300, 330]) acceptSignal(e, sig(`p${g}`, g), 1);
    expect(receiptsInWindow(e, 330, 300)).toBe(4); // 40, 70, 300, 330
    expect(receiptsInWindow(e, 1000, 300)).toBe(0);
  });
});
