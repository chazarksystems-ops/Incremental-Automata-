import { describe, expect, it } from 'vitest';
import { ALL_TRANSFORMS, IDENTITY, transformName } from '../../src/core/transform';
import { Factory } from '../../src/game/factory';
import { laneForGun, recommendCollectorSpot, streamCoverage } from '../../src/game/guides';
import { newGame } from '../../src/scenarios/default';
import { BLUEPRINTS, board, loadPattern } from '../helpers';

const gun = loadPattern('gosper-glider-gun');

describe('collecting a new stream', () => {
  it('coverage: the starter stream is uncovered until the collector sits on it', () => {
    const f = new Factory(newGame(gun), BLUEPRINTS);
    const lanes = [laneForGun('gun-1', gun, 4, 4, IDENTITY)];
    const gates = () => f.detectors.map((d) => ({ ...d.config }));
    expect(streamCoverage(lanes, gates(), 1).get('gun-1')).toBeNull(); // default collector is 6 lanes off
    f.apply({ type: 'move-detector', id: 'collector-1', x: 78, y: 64 });
    expect(streamCoverage(lanes, gates(), 1).get('gun-1')).toBe('collector-1');
  });

  it('the recommended spot really collects the stream, for every gun orientation', () => {
    for (const t of ALL_TRANSFORMS) {
      const f = new Factory({ world: board(128, 128, []), sandbox: true }, BLUEPRINTS);
      expect(f.apply({ type: 'build-gun', x: 46, y: 46, transform: t }).ok, transformName(t)).toBe(true);
      const id = f.machines[0]!.id;
      const lane = laneForGun(id, gun, 46, 46, t);
      const spot = recommendCollectorSpot(lane, f.gunKeepOuts(), 128, 128);
      expect(spot, transformName(t)).not.toBeNull();
      expect(f.apply({ type: 'build-collector', x: spot!.x, y: spot!.y, heading: spot!.heading }).ok).toBe(true);
      const c = f.detectors[0]!.config.id;
      expect(streamCoverage([lane], [{ ...f.detectors[0]!.config }], f.detectorParams.gateHalfWidth).get(id)).toBe(c);
      f.step(600);
      const got = f.economy.receipts.filter((r) => r.detectorId === c).length;
      expect(got, transformName(t)).toBeGreaterThanOrEqual(15);
    }
  }, 60_000);

  it('the Phase 3 second gun at (4, 40) gets a working recommended collector', () => {
    const f = new Factory({ ...newGame(gun), sandbox: true }, BLUEPRINTS);
    f.apply({ type: 'build-gun', x: 4, y: 40, transform: IDENTITY });
    const lane = laneForGun('gun-3', gun, 4, 40, IDENTITY);
    const spot = recommendCollectorSpot(lane, f.gunKeepOuts(), 128, 128)!;
    f.apply({ type: 'build-collector', x: spot.x, y: spot.y, heading: spot.heading });
    f.step(900);
    expect(f.economy.receipts.some((r) => r.detectorId === f.detectors.at(-1)!.config.id)).toBe(true);
  });
});
