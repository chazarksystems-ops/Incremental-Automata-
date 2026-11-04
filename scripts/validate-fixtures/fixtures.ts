import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashWorld } from '../../src/core/hash';
import { stepLife } from '../../src/core/life';
import { parseRleOrThrow } from '../../src/core/rle';
import { stampGrid } from '../../src/core/stamp';
import { createWorld, population, type WorldState } from '../../src/core/world';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const FIXTURE_DIR = join(ROOT, 'tests/fixtures/core');

export interface FixtureSpec {
  id: string;
  description: string;
  board: { width: number; height: number };
  initial: Array<{ file?: string; rle?: string; x: number; y: number }>;
  checkpoints: number[];
  expected: Record<string, { population: number; hash: string }>;
  reference?: { tool: string; method: string };
}

export function loadFixtures(): FixtureSpec[] {
  return readdirSync(FIXTURE_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(FIXTURE_DIR, f), 'utf8')) as FixtureSpec);
}

export function initialWorld(spec: FixtureSpec): WorldState {
  let w = createWorld(spec.board.width, spec.board.height);
  for (const item of spec.initial) {
    const text = item.rle ?? readFileSync(join(ROOT, item.file!), 'utf8');
    const r = stampGrid(w, parseRleOrThrow(text).grid, item.x, item.y, { allowOverlap: true, margin: 0 });
    if (!r.ok) throw new Error(`${spec.id}: ${r.message}`);
    w = r.world;
  }
  return w;
}

export interface CheckpointResult {
  generation: number;
  expected: { population: number; hash: string } | undefined;
  actual: { population: number; hash: string };
  pass: boolean;
}

export function runFixture(spec: FixtureSpec): CheckpointResult[] {
  let w = initialWorld(spec);
  const out: CheckpointResult[] = [];
  for (const target of [...spec.checkpoints].sort((a, b) => a - b)) {
    while (w.generation < target) w = stepLife(w);
    const actual = { population: population(w), hash: hashWorld(w) };
    const expected = spec.expected[String(target)];
    out.push({
      generation: target,
      expected,
      actual,
      pass: !!expected && expected.hash === actual.hash && expected.population === actual.population,
    });
  }
  return out;
}
