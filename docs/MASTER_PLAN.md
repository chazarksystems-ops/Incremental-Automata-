# Cellular Automata Automation Game — Master Development Plan

**Status:** Research-backed proposed implementation plan, not yet implemented  
**Date:** November 4, 2026  
**Working concept:** A browser-first incremental automation game in which real Conway's Game of Life patterns provide machine behavior and a separate game layer supplies objectives, research, currency, user controls, and progression.

## 1. Product thesis and scope

**Hypothesis:** The loop **build → simulate → observe → measure → improve → automate → expand** can make physical arrangements of cellular automata as rewarding as traditional incremental-game upgrades.

The first product should be a **vertical slice**, not an entire idle game: one 128×128 chamber, B3/S23 Conway simulation, a Gosper glider gun, a directional glider collector, a small number of build/upgrade affordances, and a visible production graph. Avoid expanding to procedural ecosystems or multiple automata before validating the loop.

**Player promise:** Every claimed machine actually functions under the declared automaton rules. The collector/currency/progression UI is explicitly a *game layer* and does not change cell birth/survival rules.

**Design pillars:**
1. Simulation truth — deterministic B3/S23, with no scripted fake glider paths.
2. Tangible automation — moving patterns earn resources only when demonstrably detected.
3. Readability — visible cause and effect, clear rate reporting, slow/fast/step controls.
4. Safe experimentation — snapshot, branch, restore, repeat; no punishment for curiosity.
5. Capability progression — unlock more useful control, routing, testing, and automation tools, not only multipliers.
6. Low cost and low coupling — browser first, open-source tools, simulation core independent of presentation.

## 2. Technology decision

| Layer | Initial choice | Why | Upgrade trigger |
| --- | --- | --- | --- |
| Development/runtime | TypeScript + Vite (vanilla-ts template) | Fast local/browser iteration, minimal overhead | None initially |
| Life simulation | Small deterministic typed-array B3/S23 stepper | Only 16,384 cells at 128×128; trivial to verify against reference tools | Profile before considering a faster engine |
| Renderer | Canvas 2D + HTML/CSS UI | Lowest time-to-playable | PixiJS/WebGL if glow/large-scale visuals justify it |
| Pattern exchange | RLE import/export | Interoperability with LifeWiki and Golly | Add macrocell only if needed |
| Simulation reference | Golly, used as separate app/test oracle | Mature simulator, scripts, fixture creation | None initially |
| Unit tests | Vitest | Works natively with Vite/TypeScript | None |
| Browser/UI tests | Playwright | Regression, screenshots, interaction scripts | None |
| Version control/CI | Git + GitHub Actions | Checkpoints, replayable changes, automated quality gates | None |
| Future pattern classification | apgsearch/lifelib inspiration, optionally reuse MIT code after architecture/license review | Avoid inventing general object classification prematurely | Only after discovery mechanics prove valuable |

**Not selected for MVP:** Unreal Engine, a backend server, networked multiplayer, ML training, RAG, shader-driven CA, full ECS, custom physics, idle offline accrual, procedural civilizations, or automatic pattern search.

**Alternative:** Phaser 4 is useful if game-scenes/cameras/typical 2D game systems dominate. Godot is a viable desktop-first option. Neither is required for a grid-based web vertical slice.

## 3. Architecture

Keep the pure simulation data separate from the economy and rendering:

```text
User interaction (grid + controls)
           |
        Commands
           v
Game orchestration / fixed-generation scheduler
   |                |                  |
   v                v                  v
B3/S23 core     Pattern library    Game-state / progression
   |                |                  ^
   v                |                  |
Immutable per-step state  --->    Event detectors (glider at gate)
   |                                   |
   +--> Canvas renderer                +--> resources + analytics
   |
   +--> deterministic snapshots/replay/test fixtures
```

**Minimal interfaces/contracts:**
- `WorldState`: `width`, `height`, `generation`, `Uint8Array` cell occupancy.
- `stepLife(world) -> nextWorld`: pure one-generation update, dead/out-of-bounds neighbors at edges (no wrap for MVP). No economy logic.
- `Pattern`: `id`, `rule`, `RLE`, dimensions, canonical orientation, provenance.
- `stampPattern(world, pattern, x, y, rotation, mirror)` returns validation result (bounds, overlap and cost rules). Edits happen at generation boundaries.
- `Detector`: game-layer position/region, orientation, arming state; read-only against the grid.
- `DetectedSignal`: `generation`, `detectorId`, `signature`, `direction`, unique passage identifier.
- `EconomyState`: currency, unlocked plans, purchased capacities, event receipt ledger.
- `GameSnapshot`: version, rule ID, world state, economy, detectors, placed-pattern metadata, generation, UI parameters.
- `replay`: initial snapshot + ordered commands + rules version. Identical inputs must produce identical outputs.

**Boundary policy:** Treat out-of-bounds cells as dead. Projectiles leaving the board are lost. Show a visible edge and warn before stamping a machine whose operating envelope clips the edge. Consider bigger/infinite grids *later*.

**Scheduling policy:** Simulate integer generations at a configurable generations-per-second rate, independently of display FPS. Pause and single-step should preserve identical outcomes. Multiple generations may be computed between renders at higher speeds.

## 4. The critical mechanic: glider detection

A collector is a *nondestructive game-layer sensor* in MVP. It should not arbitrarily steer or delete living cells. Award a resource only when a recognized, moving glider **crosses a configured directional gate**.

Do not count raw live-cell density or any arbitrary pixel overlap: that would reward random noise and could repeatedly count one glider. Start with four-phase glider templates, direction/orientation, movement across generations, and a per-passage disambiguation strategy. In early implementation, constrain collectors to approved corridors with validated known templates; general-purpose multi-object tracking is not required.

**Collector tests:**
1. Exactly one award per known glider crossing.
2. No award from a still life, oscillator, or unrecognized debris.
3. Same glider overlapping the gate over multiple generations is counted once.
4. Two consecutive gun-produced gliders are counted as two passages.
5. Shifting the gate off-lane stops awards.
6. Restart from snapshot reproduces awarded receipts exactly.
7. Large jumps in simulation speed do not skip valid arrivals.

An advanced **physical collector** can combine a signal sensor with a verified `eater 1` pattern. This must be a separately tested mechanic: an eater only consumes gliders in correct relative phases/orientations and must have time to recover.

## 5. Canonical simulation verification

Use known Conway examples as unit tests and compare checkpoints with Golly:
- Block is unchanged after repeated steps.
- Blinker returns to its starting phase after 2 steps.
- Glider reproduces its starting shape after 4 steps, translated diagonally by 1 cell.
- Gosper gun occupies a 36×9 initial bounding box with 36 live cells; after settling, it emits one glider per 30 generations. **Do not treat the entire growing gun+stream as period-30.**
- RLE parser reconstructs exported patterns and rejects invalid/other-rule files gracefully.
- In fixed finite grids, incoming/outgoing streams do not wrap around edges.
- A chosen eater fixture returns to its original state after consuming one correctly aimed glider.

Use a fixed suite of RLE fixture files with source URLs, source snapshot versions where possible, and expected generation/state hashes. Compare outputs from the game's engine and Golly for small windows and selected milestones.

## 6. First playable loop

**Intro/tutorial (player-visible):**
1. Start with a functioning gun in one chamber and a clearly indicated predicted stream lane (assistive overlay, not a simulated path).
2. Place or slide a collector so real gliders are detected; get first real payout.
3. Adjust pause/step/speed; show a transparent production rate and why a detector does or does not trigger.
4. Spend earned energy to unlock a second production plan or a chamber expansion.
5. Face a layout constraint (limited chamber footprint / competing streams / loss to edges), then improve output by actual placement.
6. Unlock `Experiment Mode`: snapshot, modify configuration, compare output and reliability over a fixed number of generations, then commit or revert.

**Suggested initial economy:** Only one resource (`Energy`) plus non-spendable performance measurements (`signals collected`, `lost signals`, `average per 300 generations`, `stability`). Keep numbers small. Reward one energy per **confirmed unique glider**. Avoid purchasing arbitrary speed multipliers at first; simulation-speed control is a user setting for test acceleration. Purchase *capabilities* (second emitter plan, blueprint rotate/mirror, chamber width, design comparison), subject to balance testing.

**Important limitation:** A lone Gosper gun has fixed throughput. Simply placing more identical guns can create linear progression with little design. The first compelling optimization must introduce real tradeoffs: spatial footprint, collision risk, multiple input lanes, partial collection efficiency, and then patterns that *transform* streams. We must explicitly test whether choices improve throughput other than by buying more guns.

**Example usability targets (hypotheses, not measured results):**
- First validated collection within 30 seconds of starting tutorial.
- First meaningful construction/placement decision within 3 minutes.
- At least two viable routes to improve performance within a 15-minute prototype session.
- A player can diagnose a failing production line from the interface alone.

## 7. Staged development with go/no-go gates

### Phase 0 — Reference/fixtures (pre-development)
**Deliverables:** annotated canonical RLE files for block, blinker, glider, Gosper gun, and eater; rule and boundary decisions; license/provenance ledger; proof of gun emission and collector-candidate lane in Golly.

**Gate:** Reference patterns behave predictably. Document precise coordinates and generation checkpoints.

### Phase 1 — Simulation core + editor
**Deliverables:** TypeScript `stepLife`, RLE parser/stamper, Canvas renderer, start/pause/step/speed, placement validation, reset, pan/zoom.

**Gate:** All canonical fixtures pass tests; stepping and running produce identical boards; 128×128 is responsive in the supported browser(s).

### Phase 2 — First genuine factory
**Deliverables:** canonical gun, visible output, one movable directional detector, unique passage counting, energy ledger, simple throughput UI.

**Gate:** Correct payout/period; off-lane and false-signal tests pass; no economy inflation from a single glider.

### Phase 3 — Incremental progression
**Deliverables:** energy expenses, second gun blueprint, chamber expansion, placement rules, basic tutorial, ability to save and load, production losses and goals.

**Gate:** A new player can progress without understanding RLE or memorizing Conway patterns. Player has an engineering choice, not only an upgrade button.

### Phase 4 — Experimentation UX
**Deliverables:** snapshots, undo/redo, experiment branch, predicted display of *tested* throughput, side-by-side measurement, construction guides, warning overlays.

**Gate:** Players can make an experiment, detect if it worked, and restore previous configuration with no state corruption.

### Phase 5 — Feedback and pivot review
**Deliverables:** 3 tiny test scenarios (collection alignment, compact layout, collision/reliability), 5–10 playtest notes if available, instrumented funnel and production metrics.

**Gate:** Players voluntarily reconfigure machinery to improve output; if not, test an alternative rule family such as Wireworld before investing in a larger content system.

### Phase 6 — Conditional expansion (not preauthorized MVP work)
Potential priorities: physically verified eater/reflector modules, multi-stage signal processing, more powerful experiment automation, blueprint marketplace/import, new rule environments, offline progression for verified circuits, PixiJS visual effects, packaging for desktop.

## 8. Proposed issue/work breakdown for an implementation agent

1. Initialize Vite `vanilla-ts`, lint/typecheck/test/playwright and GitHub CI.
2. Implement pure fixed-boundary Conway `stepLife`, plus tests.
3. Implement RLE import/export and stable canonical pattern fixture loader.
4. Build Canvas grid, camera transforms, pan, zoom, pause/step/speed.
5. Validate Gosper output and export reproducible state checks.
6. Implement directional glider detector and deduplication, with adversarial tests.
7. Build resource ledger from accepted detector events only.
8. Add build/unlock UI, second machine, and spatial placement constraints.
9. Add save/load, snapshots and deterministic command replay.
10. Add tutorial, scenario goals, telemetry and browser regression screenshots.
11. Run focused design tests; document failures and recommend next iteration.

Each issue should require tests and a before/after screenshot or benchmark when UI/performance changes, plus a brief note about unresolved assumptions. No unreviewed bulk rewrites. Put all experimental gameplay rules behind data/config flags.

## 9. Repository layout

```text
cellular-automation-game/
  README.md
  docs/
    PRODUCT_VISION.md
    GAMEPLAY_HYPOTHESES.md
    ARCHITECTURE.md
    TEST_PLAN.md
    LICENSE_PROVENANCE.md
    PLAYTEST_RESULTS.md
  src/
    core/               # Pure automaton and RLE codecs
    patterns/           # Manifest, verified fixtures, transforms
    detectors/          # Signal detection and unique passage logic
    economy/            # Balances, costs, event receipts
    game/               # State coordination, clock, saving, replay
    render/             # Canvas 2D presentation
    ui/                 # Controls, inspector, upgrades, guidance
    scenarios/          # Tutorial and diagnostic layouts
  tests/
    fixtures/           # RLE and canonical hashes
    core/
    detectors/
    economy/
    integration/
    e2e/
  scripts/
    benchmark/
    validate-fixtures/
  package.json
  vite.config.ts
  playwright.config.ts
```

## 10. Testing, reproducibility, and measurable quality

- **Unit tests:** Automaton generations, parser edge cases, orientation transforms, payout deduplication, purchase constraints.
- **Fixture tests:** Compare board checksums at pre-committed generation checkpoints against a trusted independent implementation.
- **Integration tests:** Run 1,000+ generations with emitter+collector, check count and persistent ledger; reload and replay.
- **Browser tests:** Start tutorial, place detector, earn energy, buy module, save, reload, pan/zoom, restore snapshot, verify accessible controls.
- **Performance:** Benchmark generation time and render time separately at 128×128 and 256×256. Define pass budgets on actual target devices *after* a baseline run. Avoid premature GPU optimization.
- **Game design analytics:** Time to first success, unproductive clicks, restart frequency, attempts before first working optimization, fraction of players experimenting voluntarily.
- **Failure corpus:** Record configurations that produce false detections, cascading collisions, blocked streams, or negative user feedback; turn each reproducible technical failure into a regression fixture.

## 11. Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Simulation is merely decorative | All machine behavior comes from Conway's actual state transitions; overlay sensors never fake motion |
| Wrong/double payouts | Verified phase/direction and passage IDs; deterministic receipt ledger |
| Tedious manual cell placement | Reusable RLE blueprints, snapping, previews, rotation/mirroring, guided placement |
| Economy devolves into purchasing copies of guns | Test spatial/routing problems that reward design, not just count of producers |
| General pattern classification consumes project | Defer apgsearch integration; use explicitly supported known patterns for MVP |
| Browser stalls at high sim speed | Separate simulation and rendering; measured cap; consider worker and optimized engine later |
| Project scope inflates | Phase gates and conditionally authorized later features |
| License uncertainty | Track code and pattern provenance separately and preserve required notices |
| Offline income rewards invalid factories | Defer offline progression; later use analytical accumulation *only* for verified stationary/periodic production circuits |

## 12. Licensing and asset provenance

- Phaser and PixiJS: MIT-licensed; suitable later if adopted, preserving notices.
- Golly: GPL-2.0-or-later and some additional license components in distributed packaging, per Fedora package listing; use as a separate research/test tool rather than embedding its code without a license review.
- `apgluxe` and `lifelib`: authors describe their software as MIT-licensed; no immediate reason to ship either in MVP.
- LifeWiki *article text* is under GFDL, not public-domain text. RLE files and other contributed artifacts require source-specific provenance review before bulk redistribution; don't assume the whole archive is automatically MIT/CC0.
- Source metadata for each third-party pattern: `name`, `source_url`, `author_or_discoverer`, `retrieved_date`, `license_review`, `digest`, `test_status`, `rule`, `attribution`.

## 13. Sources (checked November 4, 2026)

- Golly (simulation/reference): https://golly.sourceforge.net/ ; source mirror https://github.com/AlephAlpha/golly
- LifeWiki Gosper glider gun (36×9, 36 cells, period 30): https://conwaylife.com/wiki/Gosper_glider_gun
- LifeWiki Eater 1: https://conwaylife.com/wiki/Eater_1
- LifeWiki reflector reference: https://conwaylife.com/wiki/Reflector
- RLE format and worked examples: https://conwaylife.com/wiki/RLE
- LifeWiki copyright: https://conwaylife.com/wiki/LifeWiki:Copyrights
- Vite setup: https://vite.dev/guide/
- Vitest: https://vitest.dev/guide/
- Playwright: https://playwright.dev/docs/intro
- PixiJS renderers: https://pixijs.com/8.x/guides/components/renderers
- Phaser docs and licensing: https://www.phaser.io/oss/docs/ ; https://phaser.io/download/license
- apgsearch licensing: https://github.com/HuntingBot/apgsearch

## 14. First implementation instruction / handoff

> Implement only Phase 1 and Phase 2 initially, using this plan as a requirements and validation specification. Keep the Life engine pure and fully deterministic, implement RLE fixtures and source provenance, and build the smallest browser UI that can visualize a canonical Gosper gun generating gliders that a movable collector correctly identifies. Write and run unit tests for known patterns and false positive/duplicate payout cases. Do not add prestige, machine learning, extra automaton rules, online services, or unnecessary UI frameworks. Report results, benchmark, screenshots, known limitations, and the next phase gate before expanding scope.

**Immediate next decision after a playable test:** Did actual collector-routing and machine placement feel like a game? If no, investigate more transformative signal processing or compare a Wireworld prototype rather than adding idle multipliers.
