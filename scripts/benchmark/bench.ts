// Generation benchmark (pure engine, Node) and render benchmark (Chromium via
// Playwright against `vite preview`/dev server when --browser is passed).
// Usage: npm run bench [-- --browser]
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { stepLife } from '../../src/core/life';
import { parseRleOrThrow } from '../../src/core/rle';
import { stampGrid } from '../../src/core/stamp';
import { createWorld, type WorldState } from '../../src/core/world';

function soup(size: number, seed: number): WorldState {
  const w = createWorld(size, size);
  let s = seed;
  for (let i = 0; i < w.cells.length; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    w.cells[i] = s % 100 < 35 ? 1 : 0;
  }
  return w;
}

function gunChamber(size: number): WorldState {
  const gun = parseRleOrThrow(readFileSync('src/patterns/rle/gosper-glider-gun.rle', 'utf8')).grid;
  const r = stampGrid(createWorld(size, size), gun, 4, 4);
  if (!r.ok) throw new Error(r.message);
  return r.world;
}

function timeSteps(w0: WorldState, gens: number): { msPerGen: number; gensPerSec: number } {
  let w = w0;
  for (let i = 0; i < 200; i++) w = stepLife(w); // warm-up
  w = w0;
  const t = performance.now();
  for (let i = 0; i < gens; i++) w = stepLife(w);
  const ms = performance.now() - t;
  return { msPerGen: ms / gens, gensPerSec: (gens * 1000) / ms };
}

console.log(`Node ${process.version} — stepLife (pure, allocating) — median of 5 runs`);
console.log('board     layout          ms/gen    gen/s');
for (const size of [128, 256]) {
  for (const [label, w] of [['gun chamber', gunChamber(size)], ['35% soup', soup(size, 7)]] as const) {
    const runs = Array.from({ length: 5 }, () => timeSteps(w, 2000)).sort((a, b) => a.msPerGen - b.msPerGen);
    const m = runs[2]!;
    console.log(`${`${size}×${size}`.padEnd(10)}${label.padEnd(16)}${m.msPerGen.toFixed(4).padStart(7)}  ${Math.round(m.gensPerSec).toString().padStart(7)}`);
  }
}

{
  const { Factory } = await import('../../src/game/factory');
  const { DEFAULT_COLLECTOR, ON_LANE_COLLECTOR_POSITION } = await import('../../src/scenarios/default');
  const time = (withDetector: boolean) => {
    const f = new Factory(gunChamber(128), withDetector ? [{ ...DEFAULT_COLLECTOR, ...ON_LANE_COLLECTOR_POSITION }] : []);
    f.step(200);
    const t = performance.now();
    f.step(3000);
    return (performance.now() - t) / 3000;
  };
  const runs = (d: boolean) => Array.from({ length: 5 }, () => time(d)).sort((a, b) => a - b)[2]!;
  const base = runs(false), det = runs(true);
  console.log(`\nFactory 128×128 gun chamber: ${base.toFixed(4)} ms/gen without collector, ${det.toFixed(4)} ms/gen with 1 collector (+${(det - base).toFixed(4)})`);
}

if (process.argv.includes('--browser')) {
  const port = 4318;
  const server = spawn('npx', ['vite', '--port', String(port), '--strictPort'], { stdio: 'ignore' });
  try {
    const { chromium } = await import('@playwright/test');
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    for (let i = 0; i < 50; i++) {
      try { await page.goto(`http://localhost:${port}`); break; } catch { await new Promise((r) => setTimeout(r, 200)); }
    }
    await page.waitForFunction(() => !!(window as never as { __ia?: unknown }).__ia);
    const r = await page.evaluate(() => (window as never as { __ia: { benchmark(n: number): unknown } }).__ia.benchmark(300));
    console.log(`\nChromium (headless, 1280×800 @1x), 128×128 chamber: ${JSON.stringify(r)}`);
    await browser.close();
  } finally {
    server.kill();
  }
}
