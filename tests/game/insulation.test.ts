import { describe, expect, it } from 'vitest';
import { hashWorld } from '../../src/core/hash';
import { stepLife } from '../../src/core/life';
import { ALL_TRANSFORMS, IDENTITY, transformGrid, transformName, type Transform } from '../../src/core/transform';
import { crop, type WorldState } from '../../src/core/world';
import { DEFAULT_CONFIG } from '../../src/game/config';
import { Factory } from '../../src/game/factory';
import { laneForGun, laneHazards } from '../../src/game/guides';
import { absolute, boxesOverlap, measureEnvelope } from '../../src/patterns/envelope';
import { BLUEPRINTS, board, loadPattern } from '../helpers';

const gun = loadPattern('gosper-glider-gun');
const N = 110;
const A = { x: 37, y: 50, t: IDENTITY };
const CHECK_GENS = [15, 30, 45, 60, 90, 120];

/** Hashes of a gun's activity box at CHECK_GENS when it runs alone at (x, y). */
function soloSignature(x: number, y: number, t: Transform): string[] {
  return activityHashes(board(N, N, [{ grid: gun, x, y, transform: t }]), x, y, t);
}
function activityHashes(w0: WorldState, x: number, y: number, t: Transform): string[] {
  const act = absolute(measureEnvelope(gun, t).activity, x, y);
  const out: string[] = [];
  let w = w0;
  for (let g = 1; g <= CHECK_GENS.at(-1)!; g++) {
    w = stepLife(w);
    if (CHECK_GENS.includes(g)) out.push(hashWorld({ ...crop(w, act), generation: g }));
  }
  return out;
}

describe('measured envelope', () => {
  it('a running Gosper gun never leaves its starting box (outputs excluded), in every orientation', () => {
    for (const t of ALL_TRANSFORMS) {
      const g = transformGrid(gun, t);
      expect(measureEnvelope(gun, t).activity, transformName(t)).toEqual({ dx: 0, dy: 0, width: g.width, height: g.height });
      expect(measureEnvelope(gun, t).keepOut, transformName(t)).toEqual({ dx: -1, dy: -1, width: g.width + 2, height: g.height + 2 });
    }
  });
});

describe('insulation: guns at the closest allowed distance never affect each other', () => {
  it('every orientation, every position where the insulating borders touch (no stream hazards)', () => {
    const keepA = absolute(measureEnvelope(gun, A.t).keepOut, A.x, A.y);
    const rules = withGunA();
    const soloA = soloSignature(A.x, A.y, A.t);
    let tested = 0;
    for (const t of ALL_TRANSFORMS) {
      const env = measureEnvelope(gun, t);
      const soloB = new Map<string, string[]>();
      // Positions where B's keep-out box touches A's (adjacent, not overlapping).
      for (let by = keepA.y - env.keepOut.height - env.keepOut.dy; by <= keepA.y + keepA.height - env.keepOut.dy; by++) {
        for (let bx = keepA.x - env.keepOut.width - env.keepOut.dx; bx <= keepA.x + keepA.width - env.keepOut.dx; bx++) {
          const keepB = absolute(env.keepOut, bx, by);
          if (boxesOverlap(keepA, keepB)) continue;
          const touching =
            keepB.x + keepB.width === keepA.x || keepA.x + keepA.width === keepB.x || keepB.y + keepB.height === keepA.y || keepA.y + keepA.height === keepB.y;
          if (!touching) continue;
          // Only what the game would actually let a player build here…
          if (!rules.checkGunPlacement(bx, by, t).ok) continue;
          // …and leave out stream crossings (warned about, tested elsewhere): debris from colliding gliders is not proximity.
          const lanes = [laneForGun('A', gun, A.x, A.y, A.t), laneForGun('B', gun, bx, by, t)];
          if (laneHazards(lanes, [{ id: 'A', ...keepA }, { id: 'B', ...keepB }], N, N).length) continue;
          const w = board(N, N, [{ grid: gun, x: A.x, y: A.y, transform: A.t }, { grid: gun, x: bx, y: by, transform: t }]);
          const key = `${bx},${by}`;
          if (!soloB.has(key)) soloB.set(key, soloSignature(bx, by, t));
          expect(activityHashes(w, A.x, A.y, A.t), `A with B ${transformName(t)} at ${key}`).toEqual(soloA);
          expect(activityHashes(w, bx, by, t), `B ${transformName(t)} at ${key}`).toEqual(soloB.get(key));
          tested++;
        }
      }
    }
    expect(tested).toBeGreaterThan(100);
  }, 120_000);

  it('one cell closer is not safe: the reported side-by-side placement wrecks both guns', () => {
    // A spans x 37..72; B one empty column away (x = 74) — what the old 1-cell rule allowed.
    const w = board(N, N, [{ grid: gun, x: A.x, y: A.y, transform: A.t }, { grid: gun, x: 74, y: A.y, transform: IDENTITY }]);
    expect(activityHashes(w, A.x, A.y, A.t)).not.toEqual(soloSignature(A.x, A.y, A.t));
    expect(activityHashes(w, 74, A.y, IDENTITY)).not.toEqual(soloSignature(74, A.y, IDENTITY));
  });
});

describe('factory placement rules', () => {
  const sandbox = () => withGunA();

  it('refuses a gun inside another gun\'s insulating border and explains why', () => {
    const f = sandbox();
    const r = f.apply({ type: 'build-gun', x: 74, y: A.y, transform: IDENTITY });
    expect(r).toMatchObject({ ok: false });
    if (!r.ok) expect(r.message).toContain('insulating border');
    expect(f.apply({ type: 'build-gun', x: 75, y: A.y, transform: IDENTITY })).toMatchObject({ ok: false }); // borders still overlap (x 74)
  });

  it('allows the closest insulated spot, and refuses guns in a stream or streams into guns', () => {
    const f = sandbox();
    expect(f.checkGunPlacement(2, 61, IDENTITY)).toEqual({ ok: true }); // below-left, borders touching, clear of the stream
    expect(f.checkGunPlacement(37, 61, IDENTITY)).toMatchObject({ ok: false, reason: 'stream' }); // directly below is in gun-1's stream
    const intoStream = f.checkGunPlacement(60, 80, IDENTITY); // body across gun-1's stream (lane 37−50+14 = 1)
    expect(intoStream).toMatchObject({ ok: false, reason: 'stream' });
    const fireInto = f.checkGunPlacement(2, 30, IDENTITY); // its stream heads SE into gun-1
    expect(fireInto).toMatchObject({ ok: false, reason: 'stream' });
  });

  it('removing a gun clears its whole activity area', () => {
    const f = sandbox();
    f.step(17);
    f.apply({ type: 'remove-machine', id: 'gun-1' });
    expect(crop(f.world, absolute(measureEnvelope(gun, IDENTITY).activity, A.x, A.y)).cells.every((c) => c === 0)).toBe(true);
  });

  it('the flags switch the rules off (for experiments with collisions)', () => {
    const f = withGunA({ ...DEFAULT_CONFIG, insulation: false, blockStreamIntoMachines: false });
    expect(withGunA().checkGunPlacement(0, A.y, IDENTITY)).toMatchObject({ ok: false, reason: 'insulation' }); // 1 empty column
    expect(f.checkGunPlacement(0, A.y, IDENTITY)).toEqual({ ok: true });
  });
});

function withGunA(config = DEFAULT_CONFIG): Factory {
  return new Factory(
    {
      world: board(N, N, [{ grid: gun, x: A.x, y: A.y }]),
      machines: [{ id: 'gun-1', kind: 'gun', x: A.x, y: A.y, transform: IDENTITY, width: 36, height: 9, paid: 0, builtAt: 0 }],
      sandbox: true,
    },
    BLUEPRINTS,
    config,
  );
}
