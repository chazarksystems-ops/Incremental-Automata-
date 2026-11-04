import { transformGrid, IDENTITY, type Transform } from './transform';
import type { BoundingBox, Grid, WorldState } from './world';

export interface StampOptions {
  transform?: Transform;
  /** Cells of clearance required between the stamp and existing live cells. Default 1. */
  margin?: number;
  /** Permit stamping onto/next to live cells (editor freehand use). Default false. */
  allowOverlap?: boolean;
}

export type StampWarning = { code: 'near-edge'; message: string };

export type StampResult =
  | { ok: true; world: WorldState; footprint: BoundingBox; warnings: StampWarning[] }
  | { ok: false; reason: 'out-of-bounds' | 'overlap'; message: string; footprint: BoundingBox };

/**
 * Place a pattern with its top-left corner at (x, y). Pure: returns a new
 * world; never advances the generation. Live pattern cells are OR-ed in.
 * Callers (the scheduler) are responsible for only applying stamps between
 * generations.
 */
export function stampGrid(world: WorldState, pattern: Grid, x: number, y: number, opts: StampOptions = {}): StampResult {
  const g = transformGrid(pattern, opts.transform ?? IDENTITY);
  const margin = opts.margin ?? 1;
  const footprint: BoundingBox = { x, y, width: g.width, height: g.height };

  if (x < 0 || y < 0 || x + g.width > world.width || y + g.height > world.height) {
    return {
      ok: false,
      reason: 'out-of-bounds',
      message: `Pattern ${g.width}×${g.height} at (${x}, ${y}) does not fit the ${world.width}×${world.height} board`,
      footprint,
    };
  }

  if (!opts.allowOverlap) {
    const x0 = Math.max(0, x - margin), y0 = Math.max(0, y - margin);
    const x1 = Math.min(world.width, x + g.width + margin), y1 = Math.min(world.height, y + g.height + margin);
    for (let yy = y0; yy < y1; yy++) {
      for (let xx = x0; xx < x1; xx++) {
        if (world.cells[yy * world.width + xx]) {
          return {
            ok: false,
            reason: 'overlap',
            message: `Live cell at (${xx}, ${yy}) is within ${margin} cell(s) of the placement`,
            footprint,
          };
        }
      }
    }
  }

  const warnings: StampWarning[] = [];
  if (x < margin || y < margin || x + g.width + margin > world.width || y + g.height + margin > world.height) {
    warnings.push({ code: 'near-edge', message: 'Placement touches the board edge; outputs may be lost off-board' });
  }

  const cells = world.cells.slice();
  for (let yy = 0; yy < g.height; yy++) {
    for (let xx = 0; xx < g.width; xx++) {
      if (g.cells[yy * g.width + xx]) cells[(y + yy) * world.width + x + xx] = 1;
    }
  }
  return { ok: true, world: { ...world, cells }, footprint, warnings };
}
