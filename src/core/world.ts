/**
 * Pure world state. A board of `width × height` cells stored row-major in a
 * Uint8Array (0 = dead, 1 = alive). Cells outside the board are permanently
 * dead (no wrapping).
 */
export interface Grid {
  readonly width: number;
  readonly height: number;
  readonly cells: Uint8Array;
}

export interface WorldState extends Grid {
  readonly generation: number;
}

export function assertDimensions(width: number, height: number): void {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new RangeError(`Invalid board size ${width}×${height}`);
  }
}

export function createWorld(width: number, height: number, generation = 0): WorldState {
  assertDimensions(width, height);
  return { width, height, generation, cells: new Uint8Array(width * height) };
}

export function createGrid(width: number, height: number): Grid {
  assertDimensions(width, height);
  return { width, height, cells: new Uint8Array(width * height) };
}

export function inBounds(g: Grid, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < g.width && y < g.height;
}

export function getCell(g: Grid, x: number, y: number): 0 | 1 {
  if (!inBounds(g, x, y)) return 0;
  return g.cells[y * g.width + x] ? 1 : 0;
}

/** Returns a new world with one cell changed (generation unchanged). */
export function withCell(w: WorldState, x: number, y: number, alive: boolean): WorldState {
  if (!inBounds(w, x, y)) throw new RangeError(`Cell (${x}, ${y}) is outside the board`);
  const cells = w.cells.slice();
  cells[y * w.width + x] = alive ? 1 : 0;
  return { ...w, cells };
}

export function population(g: Grid): number {
  let n = 0;
  for (let i = 0; i < g.cells.length; i++) n += g.cells[i]!;
  return n;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Bounding box of live cells, or null for an empty grid. */
export function boundingBox(g: Grid): BoundingBox | null {
  let minX = Infinity, minY = Infinity, maxX = -1, maxY = -1;
  for (let y = 0; y < g.height; y++) {
    const row = y * g.width;
    for (let x = 0; x < g.width; x++) {
      if (g.cells[row + x]) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/** Live cells as [x, y] pairs in row-major order. */
export function liveCells(g: Grid): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let y = 0; y < g.height; y++) {
    for (let x = 0; x < g.width; x++) if (g.cells[y * g.width + x]) out.push([x, y]);
  }
  return out;
}

export function gridFromCells(width: number, height: number, cells: Iterable<readonly [number, number]>): Grid {
  const g = createGrid(width, height);
  for (const [x, y] of cells) {
    if (!inBounds(g, x, y)) throw new RangeError(`Cell (${x}, ${y}) is outside ${width}×${height}`);
    g.cells[y * width + x] = 1;
  }
  return g;
}

/** Copy of `g` cropped to the given rectangle (out-of-board area is dead). */
export function crop(g: Grid, box: BoundingBox): Grid {
  const out = createGrid(box.width, box.height);
  for (let y = 0; y < box.height; y++) {
    for (let x = 0; x < box.width; x++) out.cells[y * box.width + x] = getCell(g, box.x + x, box.y + y);
  }
  return out;
}

export function gridsEqual(a: Grid, b: Grid): boolean {
  if (a.width !== b.width || a.height !== b.height) return false;
  for (let i = 0; i < a.cells.length; i++) if (a.cells[i] !== b.cells[i]) return false;
  return true;
}

/**
 * New world of size `width × height` keeping every cell at the same
 * coordinates (the board grows right/down). Shrinking is not allowed:
 * the game layer must never delete live cells implicitly.
 */
export function resizeWorld(w: WorldState, width: number, height: number): WorldState {
  assertDimensions(width, height);
  if (width < w.width || height < w.height) throw new RangeError('resizeWorld cannot shrink the board');
  const cells = new Uint8Array(width * height);
  for (let y = 0; y < w.height; y++) cells.set(w.cells.subarray(y * w.width, (y + 1) * w.width), y * width);
  return { width, height, generation: w.generation, cells };
}

/** New world with every cell inside `box` (clipped to the board) set dead. */
export function clearRect(w: WorldState, box: BoundingBox): WorldState {
  const cells = w.cells.slice();
  const x0 = Math.max(0, box.x), y0 = Math.max(0, box.y);
  const x1 = Math.min(w.width, box.x + box.width), y1 = Math.min(w.height, box.y + box.height);
  for (let y = y0; y < y1; y++) cells.fill(0, y * w.width + x0, y * w.width + Math.max(x0, x1));
  return { ...w, cells };
}
