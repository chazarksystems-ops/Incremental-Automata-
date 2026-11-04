import { createGrid, type Grid } from './world';

export type Rotation = 0 | 90 | 180 | 270;

/** Mirror (flip x) is applied first, then a clockwise rotation. */
export interface Transform {
  rotation: Rotation;
  mirror: boolean;
}

export const IDENTITY: Transform = { rotation: 0, mirror: false };

export const ALL_TRANSFORMS: readonly Transform[] = ([0, 90, 180, 270] as const).flatMap((rotation) => [
  { rotation, mirror: false },
  { rotation, mirror: true },
]);

export function transformName(t: Transform): string {
  return `${t.mirror ? 'mirror+' : ''}rot${t.rotation}`;
}

export function transformGrid(g: Grid, t: Transform): Grid {
  const swap = t.rotation === 90 || t.rotation === 270;
  const outW = swap ? g.height : g.width;
  const outH = swap ? g.width : g.height;
  const out = createGrid(outW, outH);
  for (let y = 0; y < g.height; y++) {
    for (let x = 0; x < g.width; x++) {
      if (!g.cells[y * g.width + x]) continue;
      const mx = t.mirror ? g.width - 1 - x : x;
      let nx: number, ny: number;
      switch (t.rotation) {
        case 0: nx = mx; ny = y; break;
        case 90: nx = g.height - 1 - y; ny = mx; break;
        case 180: nx = g.width - 1 - mx; ny = g.height - 1 - y; break;
        case 270: nx = y; ny = g.width - 1 - mx; break;
      }
      out.cells[ny * outW + nx] = 1;
    }
  }
  return out;
}
