import { parseRle } from '../core/rle';
import { DEFAULT_CONFIG, type GameConfig } from './config';
import { Factory, type Blueprints, type GameSnapshot } from './factory';

/**
 * Save files: a versioned envelope around a GameSnapshot. Loading validates
 * structure, rule and world before building a Factory, and returns a typed
 * error instead of throwing, so a corrupt save never crashes the game.
 */
export const SAVE_FORMAT = 'incremental-automata-save';
export const SAVE_VERSION = 2;
export const SAVE_KEY = 'incremental-automata.save.v2';

export interface SaveFile {
  format: typeof SAVE_FORMAT;
  version: typeof SAVE_VERSION;
  savedAt: string;
  snapshot: GameSnapshot;
}

export type LoadResult = { ok: true; factory: Factory; save: SaveFile } | { ok: false; error: string };

export function serializeSave(factory: Factory, now: Date = new Date()): string {
  if (factory.sandbox) throw new Error('Sandbox games are not saved');
  const save: SaveFile = { format: SAVE_FORMAT, version: SAVE_VERSION, savedAt: now.toISOString(), snapshot: factory.snapshot() };
  return JSON.stringify(save);
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown): v is number => Number.isInteger(v);

export function parseSave(text: string, blueprints: Blueprints, config: GameConfig = DEFAULT_CONFIG): LoadResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Save is not valid JSON' };
  }
  if (!isObj(data) || data.format !== SAVE_FORMAT) return { ok: false, error: 'Not an Incremental Automata save' };
  if (data.version !== SAVE_VERSION) return { ok: false, error: `Unsupported save version ${String(data.version)}` };
  const s = data.snapshot;
  if (!isObj(s) || s.version !== 2) return { ok: false, error: 'Save has no valid snapshot' };
  if (s.rule !== 'B3/S23') return { ok: false, error: `Save uses rule ${String(s.rule)}, not B3/S23` };
  if (s.sandbox !== false) return { ok: false, error: 'Sandbox games cannot be loaded as saves' };
  if (!isInt(s.generation) || s.generation < 0) return { ok: false, error: 'Save has an invalid generation' };
  const w = s.world;
  if (!isObj(w) || !isInt(w.width) || !isInt(w.height) || typeof w.rle !== 'string') {
    return { ok: false, error: 'Save has no valid world' };
  }
  const allowed = [config.chamber.initialSize, config.chamber.expandedSize];
  if (!allowed.includes(w.width) || w.width !== w.height) {
    return { ok: false, error: `Unexpected chamber size ${w.width}×${w.height}` };
  }
  const rle = parseRle(w.rle);
  if (!rle.ok) return { ok: false, error: `Save world is corrupt: ${rle.error.message}` };
  for (const k of ['machines', 'detectors', 'unlocks', 'goals'] as const) {
    if (!Array.isArray(s[k])) return { ok: false, error: `Save is missing ${k}` };
  }
  const e = s.economy;
  if (!isObj(e) || typeof e.energy !== 'number' || !Array.isArray(e.receipts) || !Array.isArray(e.entries) || !isObj(e.archived)) {
    return { ok: false, error: 'Save has no valid economy' };
  }
  try {
    const factory = Factory.fromSnapshot(s as unknown as GameSnapshot, blueprints, config);
    return { ok: true, factory, save: data as unknown as SaveFile };
  } catch (err) {
    return { ok: false, error: `Save could not be restored: ${(err as Error).message}` };
  }
}
