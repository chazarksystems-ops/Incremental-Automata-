# CLAUDE.md — Incremental Automata

Browser-first incremental automation game where real Conway's Game of Life
(B3/S23) patterns provide machine behavior, and a separate game layer supplies
collectors, currency, research and progression.

- Requirements and phase gates: `docs/MASTER_PLAN.md` (source of truth for scope).
- Development tooling decisions (skills, MCP, hooks): `docs/DEV_TOOLING.md`.
- Current scope: **Phase 1 + Phase 2 only** (simulation core + editor, first
  genuine factory). Do not start later phases without an explicit go decision
  recorded against that phase's gate.

## Project invariants (apply to every task and every skill)

1. Conway rules remain **B3/S23**. Out-of-bounds cells are dead; no wrapping in MVP.
2. **Simulation and economy are separate.** `src/core/` never imports from
   `economy/`, `detectors/`, `game/`, `render/` or `ui/`.
3. **No fabricated simulation events.** Nothing in the game layer may write,
   move, delete or steer live cells to make a machine "work". Detectors are
   read-only against the grid.
4. Resources are awarded **only** from accepted detector events (confirmed,
   deduplicated glider passages) — never from cell density or pixel overlap.
5. **Deterministic tests before integration.** Same snapshot + same command
   list + same rules version ⇒ identical board hashes and identical receipts.
   Running, stepping and batched-fast-forward must produce identical boards.
6. **Preserve known-good fixture results.** Never update an expected hash in
   `tests/fixtures/` to make a test pass; a changed hash is a bug until proven
   otherwise with an independent reference (Golly).
7. Every experiment is reproducible: snapshot + parameters + generation count.
8. Document failed experiments (`docs/` or `tests/fixtures/failures/`); turn
   reproducible technical failures into regression fixtures.
9. Do not change core architecture (module boundaries, `WorldState`/`stepLife`
   contracts) without evidence and a note in `docs/ARCHITECTURE.md`.
10. Visual resemblance is not proof. A screenshot never substitutes for a
    fixture hash or detector test.
11. Every third-party pattern carries provenance metadata (see `/pattern-lab`).
12. Out of scope unless authorized: prestige, ML, extra automaton rules,
    backend/online services, offline accrual, UI frameworks beyond Canvas 2D +
    HTML/CSS, a Golly MCP server.

## Stack

TypeScript + Vite (`vanilla-ts`), Canvas 2D, Vitest (unit/fixture/integration),
Playwright Test (e2e, pinned to 1.63.0 to match the preinstalled Chromium), GitHub Actions CI.
Independent reference oracle: python-lifelib (`scripts/validate-fixtures/reference_lifelib.py`);
Golly is an optional external cross-check. Neither is a runtime dependency.

Status: Phase 1 complete (`docs/PHASE1_REPORT.md`). Next: Phase 2.

Scripts (keep these names stable — the skills rely on them):

| Command | Purpose |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | lint |
| `npm test` | Vitest (all unit/fixture/integration) |
| `npm run test:e2e` | Playwright Test |
| `npm run build` | production build |
| `npm run validate:fixtures` | recompute fixture hashes and diff against committed (lifelib-generated) expectations |
| `npm run bench` | generation/render benchmarks (128×128, 256×256) |

If a script does not exist yet, say so in the report rather than silently skipping it.

Layout: `src/core` (pure engine) · `src/patterns` (RLE + manifest) · `src/game` (clock, simulation, command log)
· `src/render` · `src/ui` · `src/scenarios` · `tests/{core,game,patterns,render,e2e,fixtures}`. See `docs/ARCHITECTURE.md`.

## Skills in this repo (`.claude/skills/`)

| Skill | Use when |
| --- | --- |
| `/life-verify` | Any change to `src/core/`, RLE codec, transforms, scheduler stepping, or fixtures |
| `/pattern-lab` | Importing, transforming, cataloguing or characterising a pattern |
| `/factory-build` | Implementing detectors, economy, blueprints, placement, unlocks |
| `/playtest` | Driving the running game in a browser (Playwright MCP) |
| `/experiment` | Phase 4+: controlled comparison of factory layouts |

For release/regression checks use the bundled `/verify` skill together with the
"Definition of done" below; there is intentionally no custom `/release-gate` yet.

## Definition of done (every change)

- `typecheck`, `lint`, `test` pass; `test:e2e` passes when UI changed.
- Simulation-touching changes: `/life-verify` report attached.
- UI changes: before/after screenshot. Performance-sensitive changes: benchmark.
- A short note on unresolved assumptions and known limitations.
- No unreviewed bulk rewrites. Experimental gameplay rules sit behind data/config flags.
