import { createGrid, type Grid } from './world';

/**
 * RLE codec for two-state B3/S23 patterns.
 * Format reference: https://conwaylife.com/wiki/Run_Length_Encoded
 */

export interface RlePattern {
  name?: string;
  author?: string;
  comments: string[];
  /** Always B3/S23 — other rules are rejected. */
  rule: 'B3/S23';
  /** False when the header omitted `rule =` (B3/S23 is then assumed). */
  ruleDeclared: boolean;
  grid: Grid;
}

export type RleErrorCode =
  | 'empty'
  | 'missing-header'
  | 'bad-header'
  | 'unsupported-rule'
  | 'bad-token'
  | 'out-of-bounds'
  | 'too-large';

export interface RleError {
  code: RleErrorCode;
  message: string;
  line?: number;
}

export type RleParseResult = { ok: true; pattern: RlePattern } | { ok: false; error: RleError };

/** Hard cap to stop a malicious/huge header from allocating gigabytes. */
export const MAX_RLE_CELLS = 4096 * 4096;

const CONWAY_ALIASES = new Set(['b3/s23', 'b3s23', '23/3', 's23/b3', 'life', 'conway']);

export function normaliseRule(rule: string): 'B3/S23' | null {
  const r = rule.trim().toLowerCase().replace(/\s+/g, '');
  return CONWAY_ALIASES.has(r) ? 'B3/S23' : null;
}

export function parseRle(text: string): RleParseResult {
  const fail = (code: RleErrorCode, message: string, line?: number): RleParseResult => ({
    ok: false,
    error: line === undefined ? { code, message } : { code, message, line },
  });

  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  let name: string | undefined;
  let author: string | undefined;
  const comments: string[] = [];
  let i = 0;
  for (; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (line === '') continue;
    if (!line.startsWith('#')) break;
    const tag = line.charAt(1);
    const body = line.slice(2).trim();
    if (tag === 'N') name = body;
    else if (tag === 'O') author = body;
    else if (tag === 'C' || tag === 'c') comments.push(body);
    // #P, #R, #r and unknown tags are ignored.
  }
  if (i >= lines.length) return fail('empty', 'No RLE header or body found');

  const headerLine = lines[i]!.trim();
  const headerNo = i + 1;
  const header = /^x\s*=\s*(\d+)\s*,\s*y\s*=\s*(\d+)\s*(?:,\s*rule\s*=\s*(\S+))?\s*$/i.exec(headerLine);
  if (!header) {
    if (!/^x\s*=/i.test(headerLine)) return fail('missing-header', 'Expected "x = <w>, y = <h>" header', headerNo);
    return fail('bad-header', `Malformed header: ${headerLine}`, headerNo);
  }
  const width = Number(header[1]);
  const height = Number(header[2]);
  if (width < 1 || height < 1) return fail('bad-header', 'Pattern dimensions must be positive', headerNo);
  if (width * height > MAX_RLE_CELLS) return fail('too-large', `Pattern ${width}×${height} exceeds limit`, headerNo);
  const ruleText = header[3];
  if (ruleText !== undefined && normaliseRule(ruleText) === null) {
    return fail('unsupported-rule', `Rule "${ruleText}" is not B3/S23`, headerNo);
  }

  const grid = createGrid(width, height);
  let x = 0;
  let y = 0;
  let count = '';
  let done = false;
  for (i = i + 1; i < lines.length && !done; i++) {
    const line = lines[i]!;
    if (line.trim().startsWith('#')) continue;
    for (const ch of line) {
      if (ch >= '0' && ch <= '9') {
        count += ch;
        continue;
      }
      if (ch === ' ' || ch === '\t') {
        if (count !== '') return fail('bad-token', 'Whitespace inside a run count', i + 1);
        continue;
      }
      const n = count === '' ? 1 : Number(count);
      count = '';
      if (ch === 'b') {
        x += n;
      } else if (ch === 'o') {
        if (x + n > width || y >= height) {
          return fail('out-of-bounds', `Live cells beyond declared ${width}×${height} at row ${y}`, i + 1);
        }
        for (let k = 0; k < n; k++) grid.cells[y * width + x + k] = 1;
        x += n;
      } else if (ch === '$') {
        y += n;
        x = 0;
      } else if (ch === '!') {
        done = true;
        break;
      } else {
        return fail('bad-token', `Unsupported RLE token "${ch}" (only b, o, $, ! for two-state Life)`, i + 1);
      }
    }
  }
  if (count !== '') return fail('bad-token', 'Dangling run count at end of pattern');

  const pattern: RlePattern = { comments, rule: 'B3/S23', ruleDeclared: ruleText !== undefined, grid };
  if (name !== undefined) pattern.name = name;
  if (author !== undefined) pattern.author = author;
  return { ok: true, pattern };
}

/** Parse or throw — for trusted, bundled patterns only. */
export function parseRleOrThrow(text: string): RlePattern {
  const r = parseRle(text);
  if (!r.ok) throw new Error(`RLE ${r.error.code}: ${r.error.message}`);
  return r.pattern;
}

export interface EncodeOptions {
  name?: string;
  author?: string;
  comments?: string[];
  lineWidth?: number;
}

export function encodeRle(grid: Grid, opts: EncodeOptions = {}): string {
  const lineWidth = opts.lineWidth ?? 70;
  const out: string[] = [];
  if (opts.name) out.push(`#N ${opts.name}`);
  if (opts.author) out.push(`#O ${opts.author}`);
  for (const c of opts.comments ?? []) out.push(`#C ${c}`);
  out.push(`x = ${grid.width}, y = ${grid.height}, rule = B3/S23`);

  const tokens: string[] = [];
  const run = (n: number, tag: string) => tokens.push(n === 1 ? tag : `${n}${tag}`);
  let pendingRows = 0;
  for (let y = 0; y < grid.height; y++) {
    const rowTokens: string[] = [];
    let x = 0;
    let lastLive = -1;
    for (let k = 0; k < grid.width; k++) if (grid.cells[y * grid.width + k]) lastLive = k;
    while (x <= lastLive) {
      const v = grid.cells[y * grid.width + x];
      let n = 0;
      while (x + n <= lastLive && grid.cells[y * grid.width + x + n] === v) n++;
      rowTokens.push(n === 1 ? (v ? 'o' : 'b') : `${n}${v ? 'o' : 'b'}`);
      x += n;
    }
    if (rowTokens.length === 0) {
      pendingRows++;
      continue;
    }
    if (tokens.length > 0 || pendingRows > 0) {
      // Separator from the previous non-empty row (or from the top for leading blank rows).
      const sep = tokens.length > 0 ? pendingRows + 1 : pendingRows;
      if (sep > 0) run(sep, '$');
    }
    pendingRows = 0;
    tokens.push(...rowTokens);
  }
  tokens.push('!');

  let line = '';
  for (const t of tokens) {
    if (line.length + t.length > lineWidth) {
      out.push(line);
      line = '';
    }
    line += t;
  }
  if (line) out.push(line);
  return out.join('\n') + '\n';
}
