# Architecture (Phase 1)

```text
UI (src/ui)  ──commands──▶  Simulation (src/game/simulation.ts) ◀── GenerationClock (src/game/clock.ts)
   │                            │  applies commands between generations, logs them
   │                            ▼
   │                      Pure core (src/core): WorldState, stepLife, RLE, transforms, stamp, hash
   │                            ▲
   │                      Pattern library (src/patterns): RLE files + manifest/provenance
   ▼
Renderer (src/render): camera math + Canvas 2D board renderer (read-only)
```

## Module rules

| Module | May import | Notes |
| --- | --- | --- |
| `src/core` | nothing outside `src/core` | Enforced by ESLint `no-restricted-imports`. No DOM, no time, no randomness. |
| `src/patterns` | `core` | `manifest.ts` is plain data (usable from Node); `library.ts` uses Vite `?raw` imports (browser/Vitest). |
| `src/game` | `core` | Scheduler + command log. Phase 2 detectors/economy will live beside it and only *read* worlds. |
| `src/render` | `core` types | Never mutates state. |
| `src/ui` | everything | The only module touching the DOM besides the renderer. |
| `src/scenarios` | `core` | Starting layouts. |

## Contracts

- `WorldState { width, height, generation, cells: Uint8Array }` — row-major, 0/1. Treated as immutable: every
  operation returns a new object.
- `stepLife(world) → world'` — one B3/S23 generation, `generation + 1`, dead cells beyond the edge.
- `stampGrid(world, grid, x, y, {transform, margin, allowOverlap}) → StampResult` — validates bounds and
  clearance (default 1 cell), returns `near-edge` warnings; never advances the generation.
- `hashWorld(world)` — SHA-256 over `IA1:<w>x<h>@<gen>\n` + cell bytes. Shared with the Python reference.
- `Simulation.apply(command)` — applies at the current generation boundary and logs `{generation, command}`;
  `replay(initial, log, toGeneration)` reproduces the run exactly.
- `GenerationClock.tick(dtMs) → n` — integer generations for elapsed time; caps per-frame work and drops the
  backlog (the run slows down; generations are never skipped). Results depend only on the generation count.

## Decisions

- **Boundary:** fixed 128×128, dead outside. A glider reaching a corner becomes a block (verified against
  lifelib); in the default chamber the stream piles debris at the far edge. That is real behaviour, kept as
  the "loss to edges" constraint the plan wants.
- **Rendering:** cells go into a 1-pixel-per-cell bitmap and are scaled with nearest-neighbour sampling. The
  cost depends on the number of cells, not the zoom.
- **Debug handle:** `window.__ia` (dev builds only; not in production) exposes read-only state for e2e tests
  and `/playtest`.
