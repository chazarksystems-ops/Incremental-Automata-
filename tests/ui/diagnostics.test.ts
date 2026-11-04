import { describe, expect, it } from 'vitest';
import { Factory } from '../../src/game/factory';
import { receiptsInWindow } from '../../src/economy/ledger';
import { DEFAULT_COLLECTOR, ON_LANE_COLLECTOR_POSITION, defaultScenario } from '../../src/scenarios/default';
import { diagnoseCollector } from '../../src/ui/diagnostics';
import { loadPattern } from '../helpers';

const gun = loadPattern('gosper-glider-gun');
const diag = (f: Factory) => diagnoseCollector(f.detectors[0]!, f.generation, receiptsInWindow(f.economy, f.generation, 300), 300);

describe('collector diagnostics', () => {
  it('idle before any glider arrives', () => {
    const f = new Factory(defaultScenario(gun), [DEFAULT_COLLECTOR]);
    expect(diag(f)).toEqual({ level: 'idle', text: 'No gliders near the collector. It only counts gliders moving ↘ through its gate.' });
  });

  it('tells the player which way to move an off-lane collector', () => {
    const f = new Factory(defaultScenario(gun), [DEFAULT_COLLECTOR]);
    f.step(500);
    expect(diag(f)).toEqual({ level: 'warn', text: 'Gliders are passing 6 lanes off the gate. Move the collector 6 cells right.' });
  });

  it('reports production once on-lane, and the advice clears', () => {
    const f = new Factory(defaultScenario(gun), [DEFAULT_COLLECTOR]);
    f.step(500);
    f.apply({ type: 'move-detector', id: DEFAULT_COLLECTOR.id, ...ON_LANE_COLLECTOR_POSITION });
    f.step(330);
    expect(diag(f)).toEqual({ level: 'ok', text: 'Collecting: 10 gliders in the last 300 generations.' });
  });
});
