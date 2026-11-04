# Test plan

| Layer | Command | What it proves |
| --- | --- | --- |
| Unit (Vitest) | `npm test` | Rule table (all 512 3×3 neighbourhoods), block/blinker/glider, purity, dead boundary, RLE parse/encode/rejections, 8 transforms, stamping validation, camera maths, clock, Gosper period-30 and emission rate, Eater 1 consumption |
| Reference fixtures | `npm run validate:fixtures` (also inside `npm test`) | Our engine matches **python-lifelib 2.5.6** at 59 checkpoints across 8 fixtures (`tests/fixtures/core/*.json`), including full-board soups that touch every edge |
| Reference regeneration | `python3 scripts/validate-fixtures/reference_lifelib.py --check` | Re-derives expectations independently (lifelib's own RLE parser and stepping; boundary emulated by clipping to the board every generation). CI job `reference`. |
| Determinism | `tests/game/simulation.test.ts`, e2e | Single-step = batched = clock-driven with random frame times and speed changes; command replay reproduces the board hash; in-browser 480 gen/s run hashes match the pure engine |
| E2E (Playwright) | `npm run test:e2e` | Start state, step/play/pause, draw, place + validation messages, rotate, zoom/pan/fit (board untouched), RLE import errors + import + export, reset, phone width |
| Benchmark | `npm run bench [-- --browser]` | ms/generation at 128² and 256²; render ms in Chromium |

**Mutation check (done once, 2026-11-04):** changing the rule to B36/S23 failed 6 tests; adding row wrap-around
failed 3. Both were reverted.

Rule: never edit `expected` blocks by hand. Regenerate with `reference_lifelib.py --write` only when *adding*
a fixture, and say so in the commit.
