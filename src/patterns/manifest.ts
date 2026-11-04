/**
 * Pattern manifest: metadata and provenance for every bundled pattern.
 * Measured fields (period, population, outputs, …) are asserted by tests in
 * tests/patterns/manifest.test.ts — they must come from running the engine,
 * not from copying the source page.
 */

export type TestStatus = 'verified' | 'failing' | 'unverified';

export interface PatternOutput {
  type: 'glider';
  /** Heading in the canonical orientation. */
  heading: 'NE' | 'NW' | 'SE' | 'SW';
}

export interface PatternManifestEntry {
  id: string;
  name: string;
  rule: 'B3/S23';
  file: string; // relative to src/patterns/rle/
  width: number;
  height: number;
  population: number;
  kind: 'still-life' | 'oscillator' | 'spaceship' | 'gun' | 'eater';
  /** Period of the pattern (for guns: emission period of the core). */
  period: number;
  outputs: PatternOutput[];
  // Provenance (docs/LICENSE_PROVENANCE.md mirrors this).
  source_url: string;
  author_or_discoverer: string;
  retrieved_date: string;
  retrieval_method: string;
  license_review: string;
  test_status: TestStatus;
  attribution: string;
}

const LIFEWIKI = 'https://conwaylife.com/wiki/';
const RETRIEVAL =
  'Transcribed from the well-known canonical form (conwaylife.com was not reachable from the build environment); ' +
  'behaviour verified against python-lifelib 2.5.6 and engine tests.';
const LICENSE_SMALL =
  'ok: tiny canonical pattern, a mathematical object not subject to LifeWiki article-text GFDL; attribution kept';

export const PATTERN_MANIFEST: readonly PatternManifestEntry[] = [
  {
    id: 'block', name: 'Block', rule: 'B3/S23', file: 'block.rle',
    width: 2, height: 2, population: 4, kind: 'still-life', period: 1, outputs: [],
    source_url: `${LIFEWIKI}Block`, author_or_discoverer: 'unknown (natural)', retrieved_date: '2026-11-04',
    retrieval_method: RETRIEVAL, license_review: LICENSE_SMALL, test_status: 'verified', attribution: 'LifeWiki: Block',
  },
  {
    id: 'blinker', name: 'Blinker', rule: 'B3/S23', file: 'blinker.rle',
    width: 3, height: 1, population: 3, kind: 'oscillator', period: 2, outputs: [],
    source_url: `${LIFEWIKI}Blinker`, author_or_discoverer: 'John Conway (1970)', retrieved_date: '2026-11-04',
    retrieval_method: RETRIEVAL, license_review: LICENSE_SMALL, test_status: 'verified', attribution: 'LifeWiki: Blinker',
  },
  {
    id: 'glider', name: 'Glider', rule: 'B3/S23', file: 'glider.rle',
    width: 3, height: 3, population: 5, kind: 'spaceship', period: 4, outputs: [{ type: 'glider', heading: 'SE' }],
    source_url: `${LIFEWIKI}Glider`, author_or_discoverer: 'Richard K. Guy (1969/1970)', retrieved_date: '2026-11-04',
    retrieval_method: RETRIEVAL, license_review: LICENSE_SMALL, test_status: 'verified', attribution: 'LifeWiki: Glider',
  },
  {
    id: 'gosper-glider-gun', name: 'Gosper glider gun', rule: 'B3/S23', file: 'gosper-glider-gun.rle',
    width: 36, height: 9, population: 36, kind: 'gun', period: 30, outputs: [{ type: 'glider', heading: 'SE' }],
    source_url: `${LIFEWIKI}Gosper_glider_gun`, author_or_discoverer: 'Bill Gosper (1970)', retrieved_date: '2026-11-04',
    retrieval_method: RETRIEVAL, license_review: LICENSE_SMALL, test_status: 'verified',
    attribution: 'LifeWiki: Gosper glider gun',
  },
  {
    id: 'eater-1', name: 'Eater 1', rule: 'B3/S23', file: 'eater-1.rle',
    width: 4, height: 4, population: 7, kind: 'eater', period: 1, outputs: [],
    source_url: `${LIFEWIKI}Eater_1`, author_or_discoverer: 'MIT group (1971)', retrieved_date: '2026-11-04',
    retrieval_method: RETRIEVAL, license_review: LICENSE_SMALL, test_status: 'verified', attribution: 'LifeWiki: Eater 1',
  },
];

export function manifestEntry(id: string): PatternManifestEntry {
  const e = PATTERN_MANIFEST.find((p) => p.id === id);
  if (!e) throw new Error(`Unknown pattern id "${id}"`);
  return e;
}
