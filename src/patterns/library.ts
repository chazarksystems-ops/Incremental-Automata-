// Browser-side pattern library (Vite `?raw` imports). Node scripts read the
// same files from disk via tests/helpers.
import { parseRleOrThrow, type RlePattern } from '../core/rle';
import { PATTERN_MANIFEST, type PatternManifestEntry } from './manifest';
import block from './rle/block.rle?raw';
import blinker from './rle/blinker.rle?raw';
import glider from './rle/glider.rle?raw';
import gosper from './rle/gosper-glider-gun.rle?raw';
import eater1 from './rle/eater-1.rle?raw';

const RAW: Record<string, string> = {
  block,
  blinker,
  glider,
  'gosper-glider-gun': gosper,
  'eater-1': eater1,
};

export interface LibraryPattern {
  entry: PatternManifestEntry;
  rle: string;
  pattern: RlePattern;
}

export const LIBRARY: readonly LibraryPattern[] = PATTERN_MANIFEST.map((entry) => {
  const rle = RAW[entry.id];
  if (rle === undefined) throw new Error(`No RLE bundled for ${entry.id}`);
  return { entry, rle, pattern: parseRleOrThrow(rle) };
});

export function getPattern(id: string): LibraryPattern {
  const p = LIBRARY.find((l) => l.entry.id === id);
  if (!p) throw new Error(`Unknown pattern id "${id}"`);
  return p;
}
