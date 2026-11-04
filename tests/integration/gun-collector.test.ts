import { describe, expect, it } from 'vitest';
import { auditEconomy, receiptsInWindow } from '../../src/economy/ledger';
import { DEFAULT_CONFIG } from '../../src/game/config';
import { Factory } from '../../src/game/factory';
import { DEFAULT_COLLECTOR, ON_LANE_COLLECTOR_POSITION, defaultScenario } from '../../src/scenarios/default';
import { loadPattern } from '../helpers';

describe('Gosper gun + on-lane collector (Phase 2 gate)', () => {
  it('pays exactly one energy per gun period over 3000 generations', () => {
    const f = new Factory(defaultScenario(loadPattern('gosper-glider-gun')), [{ ...DEFAULT_COLLECTOR, ...ON_LANE_COLLECTOR_POSITION }]);
    f.step(3000);
    const gens = f.economy.receipts.map((r) => r.generation);
    const first = gens[0]!;
    expect(first).toBeGreaterThan(0);
    for (let i = 1; i < gens.length; i++) expect(gens[i]! - gens[i - 1]!).toBe(30);
    expect(gens).toHaveLength(Math.floor((3000 - first) / 30) + 1);
    expect(f.economy.energy).toBe(gens.length * DEFAULT_CONFIG.rewardPerGlider);
    expect(receiptsInWindow(f.economy, f.generation, 300)).toBe(10);
    expect(auditEconomy(f.economy)).toBe(true);
    // No inflation: never more receipts than gliders the gun has emitted.
    expect(gens.length).toBeLessThanOrEqual(Math.floor(3000 / 30));
  });
});
