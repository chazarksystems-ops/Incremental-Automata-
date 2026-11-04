# Phase 1 report — simulation core + editor (2026-11-04)

## Gate status

| Gate criterion (MASTER_PLAN §7) | Result |
| --- | --- |
| All canonical fixtures pass | **Pass.** 75 unit tests, plus 59/59 checkpoints that match python-lifelib (block, blinker, glider open/edge, Gosper chamber to gen 4000, eater, 2 soups) |
| Stepping and running produce identical boards | **Pass.** Node: single vs batched vs clock-driven with random dt and speed changes. Browser: a 480 gen/s run hashes equal to `stepLifeN` |
| 128×128 responsive in supported browser | **Pass (headless Chromium).** About 0.13 ms per generation, so 480 gen/s ≈ 6% of one core. Render ≈ 0.09 ms per frame |

## Delivered

`stepLife` (pure, dead boundary), SHA-256 board hash, RLE import/export with typed errors, 8-way transforms, validated stamping
(bounds / 1-cell clearance / edge warning), fixed-generation clock, command log + replay, Canvas renderer, camera
(pan / wheel-zoom at cursor / fit), play/pause/step/10 speed levels, reset/clear, draw/pan/place tools, blueprint
palette with ghost preview, RLE import/export dialog, keyboard shortcuts, phone layout, CI (checks, e2e, lifelib reference).

## Benchmark (Node 22, this container)

| Board | Layout | ms/gen | gen/s |
| --- | --- | --- | --- |
| 128×128 | gun chamber | 0.13 | ~7,500 |
| 128×128 | 35% soup | 0.13 | ~7,650 |
| 256×256 | gun chamber | 0.50 | ~2,000 |
| 256×256 | 35% soup | 0.44 | ~2,300 |

Headless Chromium, 1280×800 @1×: render 0.09 ms/frame, step 0.15 ms/gen. These are baselines, not budgets on target devices.

## Screenshots

`docs/screenshots/2026-11-04-phase1/`: `chamber-gen600.png`, `place-eater-preview.png`, `mobile.png`.

## Known limitations / unresolved assumptions

- **Golly not used.** It can't be installed here. python-lifelib is the independent oracle instead. A Golly
  cross-check is still worth doing once on a dev machine.
- **Pattern RLEs were transcribed**, not downloaded (Cloudflare blocked the site). They are behaviourally
  verified, but they have not been byte-compared with LifeWiki.
- In the default chamber the glider stream crashes into the far edge and leaves debris there. This is
  correct behaviour, and it is the problem Phase 2's collector has to sit in front of.
- No touch pinch-zoom (the +/− buttons work on touch). No undo (Phase 4).
- The render benchmark is headless and software-rasterised. Real-device numbers are still needed.
- `stepLife` allocates a new buffer every generation. That is fine at this size. Use double-buffering only if profiling asks for it.

## Next gate — Phase 2 (first genuine factory)

Directional glider detector with four-phase templates and unique passage IDs, an energy ledger fed only by
accepted detections, a throughput UI, and the 7 collector tests from MASTER_PLAN §4. Use `/factory-build`.
