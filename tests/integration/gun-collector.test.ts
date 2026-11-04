import { describe, expect, it } from 'vitest';
import { auditEconomy, collectedCount, receiptsInWindow } from '../../src/economy/ledger';
import { DEFAULT_CONFIG } from '../../src/game/config';
import { RECEIPT_KEEP_GENERATIONS } from '../../src/game/factory';
import { DEFAULT_COLLECTOR, ON_LANE_COLLECTOR_POSITION, defaultScenario } from '../../src/scenarios/default';
import { factoryOf, loadPattern } from '../helpers';

describe('Gosper gun + on-lane collector (Phase 2 gate)', () => {
  it('pays exactly one energy per gun period over 3000 generations', () => {
    const f = factoryOf(defaultScenario(loadPattern('gosper-glider-gun')), [{ ...DEFAULT_COLLECTOR, ...ON_LANE_COLLECTOR_POSITION }]);
    const gens: number[] = [];
    while (f.generation < 3000) gens.push(...f.step(1).receipts.map((r) => r.generation));
    const first = gens[0]!;
    expect(first).toBeGreaterThan(0);
    for (let i = 1; i < gens.length; i++) expect(gens[i]! - gens[i - 1]!).toBe(30);
    expect(gens).toHaveLength(Math.floor((3000 - first) / 30) + 1);
    expect(collectedCount(f.economy)).toBe(gens.length);
    expect(f.economy.energy).toBe(gens.length * DEFAULT_CONFIG.rewardPerGlider);
    expect(receiptsInWindow(f.economy, f.generation, 300)).toBe(10);
    expect(auditEconomy(f.economy)).toBe(true);
    // No inflation: never more receipts than gliders the gun has emitted.
    expect(gens.length).toBeLessThanOrEqual(Math.floor(3000 / 30));
    // Compaction keeps only recent receipts but the totals still add up.
    expect(f.economy.receipts.every((r) => r.generation > 3000 - RECEIPT_KEEP_GENERATIONS - 500)).toBe(true);
    expect(f.economy.archived.count).toBeGreaterThan(0);
  });
});
