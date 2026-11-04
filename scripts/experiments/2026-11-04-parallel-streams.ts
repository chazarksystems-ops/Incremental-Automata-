// Experiment 2026-11-04: can two south-east Gosper streams run within ±10 lanes so one
// collector gate could catch both? Gun A fixed at the starter position (4,4), lane 14; gun B
// tried at every legal position in a 128×128 chamber in both SE-firing orientations
// (rot0, mirror+rot270). Both streams must still carry ≥3 gliders downstream of both bodies
// after 420 generations. Result recorded in docs/EXPERIMENTS.md. Runtime ≈ 9 min.
// Run: npx tsx scripts/experiments/2026-11-04-parallel-streams.ts
import { readFileSync } from 'node:fs';
import { parseRleOrThrow } from '../../src/core/rle';
import { stampGrid } from '../../src/core/stamp';
import { stepLifeN } from '../../src/core/life';
import { createWorld, getCell, type WorldState } from '../../src/core/world';
import { TEMPLATE_BY_MASK } from '../../src/detectors/templates';
import { ALL_TRANSFORMS, transformName, transformGrid } from '../../src/core/transform';
const gun = parseRleOrThrow(readFileSync('src/patterns/rle/gosper-glider-gun.rle','utf8')).grid;
function gliders(w: WorldState) {
  const out: Array<{h:string; lat:number; ax:number; ay:number}> = [];
  for (let y=-1;y<w.height;y++) for (let x=-1;x<w.width;x++){ let m=0,n=0; for(let i=0;i<9;i++) if(getCell(w,x+i%3,y+((i/3)|0))){m|=1<<i;n++;} if(n!==5) continue; const t=TEMPLATE_BY_MASK.get(m); if(!t) continue;
    let ok=true; for(let i=-1;i<=3&&ok;i++){ if(getCell(w,x+i,y-1)||getCell(w,x+i,y+3)) ok=false;} for(let j=0;j<=2&&ok;j++){ if(getCell(w,x-1,y+j)||getCell(w,x+3,y+j)) ok=false;}
    if(!ok) continue; const ax=x+t.anchorDx, ay=y+t.anchorDy; out.push({h:t.heading, lat: ax-ay, ax, ay}); }
  return out;
}
// which transforms emit SE, and their lane relative to placement?
const se: Array<{t: typeof ALL_TRANSFORMS[number]; lane0: number}> = [];
for (const t of ALL_TRANSFORMS) {
  const r = stampGrid(createWorld(160,160), gun, 60, 60, { transform: t }); if (!r.ok) continue;
  const g = gliders(stepLifeN(r.world, 200));
  if (g.length && g.every(x=>x.h==='SE')) se.push({ t, lane0: g[0]!.lat - 0 });
  console.log(transformName(t), g.length ? g[0]!.h : '-', g.length? g[0]!.lat : '');
}
const N=128, GENS=420;
const res: string[] = [];
for (const { t } of se) {
  const tg = transformGrid(gun, t);
  for (let by = 4; by <= 118 - tg.height; by += 1) for (let bx = 4; bx <= 124 - tg.width; bx += 1) {
    let w = createWorld(N, N);
    let r = stampGrid(w, gun, 4, 4); w = r.ok ? r.world : w;
    r = stampGrid(w, gun, bx, by, { transform: t }); if (!r.ok) continue; w = r.world;
    // lane of B
    const solo = stampGrid(createWorld(N,N), gun, bx, by, { transform: t }); if (!solo.ok) continue;
    const gb = gliders(stepLifeN(solo.world, 120)); if (!gb.length) continue;
    const laneB = gb[0]!.lat;
    if (laneB === 14 || Math.abs(laneB - 14) > 10) continue;
    const g = gliders(stepLifeN(w, GENS)).filter(x => x.h === 'SE');
    // downstream of both bodies
    const ymin = Math.max(13, by + tg.height) + 4;
    const a = g.filter(x => x.lat === 14 && x.ay > ymin).length, b = g.filter(x => x.lat === laneB && x.ay > ymin).length;
    if (a >= 3 && b >= 3) res.push(`${transformName(t)} B(${bx},${by}) laneB ${laneB} sep ${laneB-14} downstreamA ${a} B ${b}`);
  }
}
console.log(res.length); console.log(res.sort((p,q)=>Math.abs(+p.split('sep ')[1]!.split(' ')[0]!)-Math.abs(+q.split('sep ')[1]!.split(' ')[0]!)).slice(0,15).join('\n'));
