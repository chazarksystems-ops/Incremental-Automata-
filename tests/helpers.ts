import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseRleOrThrow } from '../src/core/rle';
import { stampGrid } from '../src/core/stamp';
import { IDENTITY, type Transform } from '../src/core/transform';
import { createWorld, type Grid, type WorldState } from '../src/core/world';
import { manifestEntry } from '../src/patterns/manifest';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function readRepoFile(rel: string): string {
  return readFileSync(resolve(ROOT, rel), 'utf8');
}

export function loadPattern(id: string): Grid {
  return parseRleOrThrow(readRepoFile(`src/patterns/rle/${manifestEntry(id).file}`)).grid;
}

export function rleGrid(rle: string): Grid {
  return parseRleOrThrow(rle).grid;
}

/** Place patterns on an empty board (no clearance check — test setup only). */
export function board(
  width: number,
  height: number,
  items: Array<{ grid: Grid; x: number; y: number; transform?: Transform }>,
): WorldState {
  let w = createWorld(width, height);
  for (const it of items) {
    const r = stampGrid(w, it.grid, it.x, it.y, { transform: it.transform ?? IDENTITY, allowOverlap: true });
    if (!r.ok) throw new Error(r.message);
    w = r.world;
  }
  return w;
}

/** Render a grid as rows of '.'/'O' — handy in assertion messages. */
export function show(g: Grid): string {
  const rows: string[] = [];
  for (let y = 0; y < g.height; y++) {
    let s = '';
    for (let x = 0; x < g.width; x++) s += g.cells[y * g.width + x] ? 'O' : '.';
    rows.push(s);
  }
  return rows.join('\n');
}
