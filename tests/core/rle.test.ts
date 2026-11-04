import { describe, expect, it } from 'vitest';
import { encodeRle, normaliseRule, parseRle, parseRleOrThrow } from '../../src/core/rle';
import { createGrid, gridFromCells, liveCells, population } from '../../src/core/world';
import { PATTERN_MANIFEST } from '../../src/patterns/manifest';
import { readRepoFile } from '../helpers';

describe('parseRle', () => {
  it('parses the glider with metadata', () => {
    const p = parseRleOrThrow(readRepoFile('src/patterns/rle/glider.rle'));
    expect(p.name).toBe('Glider');
    expect(p.author).toBe('Richard K. Guy');
    expect(p.ruleDeclared).toBe(true);
    expect(liveCells(p.grid)).toEqual([[1, 0], [2, 1], [0, 2], [1, 2], [2, 2]]);
  });

  it('parses every bundled pattern to its manifest size and population', () => {
    for (const e of PATTERN_MANIFEST) {
      const p = parseRleOrThrow(readRepoFile(`src/patterns/rle/${e.file}`));
      expect([p.grid.width, p.grid.height, population(p.grid)], e.id).toEqual([e.width, e.height, e.population]);
    }
  });

  it('handles run counts, multi-row skips, wrapped lines and trailing content', () => {
    const p = parseRleOrThrow('x = 5, y = 4\n2o\n3b$\n2$4bo! trailing text ignored');
    expect(liveCells(p.grid)).toEqual([[0, 0], [1, 0], [4, 3]]);
    expect(p.ruleDeclared).toBe(false);
  });

  it('accepts Conway rule aliases', () => {
    for (const r of ['B3/S23', 'b3s23', '23/3', 'Life']) expect(normaliseRule(r), r).toBe('B3/S23');
    expect(parseRle('x = 1, y = 1, rule = 23/3\no!').ok).toBe(true);
  });

  it.each([
    ['', 'empty'],
    ['#C only a comment', 'empty'],
    ['bo$2bo$3o!', 'missing-header'],
    ['x = 3 y = 3\n3o!', 'bad-header'],
    ['x = 0, y = 3\n!', 'bad-header'],
    ['x = 3, y = 3, rule = B36/S23\n3o!', 'unsupported-rule'],
    ['x = 3, y = 3, rule = B3/S23Super\n3o!', 'unsupported-rule'],
    ['x = 3, y = 3, rule = B3/S23\n3A!', 'bad-token'],
    ['x = 3, y = 3\n3o.!', 'bad-token'],
    ['x = 2, y = 2\n3o!', 'out-of-bounds'],
    ['x = 2, y = 2\n2o$2o$o!', 'out-of-bounds'],
    ['x = 2, y = 2\n2o$2', 'bad-token'],
    ['x = 99999, y = 99999\no!', 'too-large'],
  ])('rejects %j with %s', (text, code) => {
    const r = parseRle(text);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe(code);
  });
});

describe('encodeRle', () => {
  it('round-trips every bundled pattern', () => {
    for (const e of PATTERN_MANIFEST) {
      const p = parseRleOrThrow(readRepoFile(`src/patterns/rle/${e.file}`));
      const again = parseRleOrThrow(encodeRle(p.grid, { name: e.name }));
      expect(again.grid, e.id).toEqual(p.grid);
      expect(again.name).toBe(e.name);
    }
  });

  it('round-trips leading/trailing blank rows and columns', () => {
    const g = gridFromCells(7, 6, [[3, 2], [6, 2], [0, 4]]);
    const text = encodeRle(g);
    expect(text).toContain('x = 7, y = 6, rule = B3/S23');
    expect(parseRleOrThrow(text).grid).toEqual(g);
    expect(parseRleOrThrow(encodeRle(createGrid(3, 3))).grid).toEqual(createGrid(3, 3));
  });

  it('round-trips random grids and wraps lines at 70 characters', () => {
    let seed = 12345;
    const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let t = 0; t < 25; t++) {
      const g = createGrid(1 + Math.floor(rand() * 40), 1 + Math.floor(rand() * 40));
      for (let i = 0; i < g.cells.length; i++) g.cells[i] = rand() < 0.4 ? 1 : 0;
      const text = encodeRle(g);
      for (const line of text.split('\n')) expect(line.length).toBeLessThanOrEqual(70);
      expect(parseRleOrThrow(text).grid).toEqual(g);
    }
  });
});
