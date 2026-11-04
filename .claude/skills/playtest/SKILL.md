---
name: playtest
description: Drive the running game in a real browser via the Playwright MCP server — start/pause/step, place collectors and blueprints, read counters, capture screenshots — to check usability and readable cause-and-effect that unit tests can't establish. Use after UI changes, before declaring a phase gate met, or when diagnosing "the factory stopped producing". Not a substitute for /life-verify.
---

# /playtest — interactive browser verification

Requires the project MCP server `playwright` (`.mcp.json`). If its tools are
not available, fall back to writing/running a Playwright Test script in
`tests/e2e/` and say so in the report.

## Test hooks the game should expose

Canvas content is opaque to the DOM, so the app should provide (dev builds only):

- `data-testid` on every control and counter (`play`, `pause`, `step`,
  `speed`, `energy`, `signals-collected`, `signals-lost`, `rate-300`, `generation`).
- `window.__ia` debug handle: `generation()`, `boardHash()`, `energy()`,
  `receipts()`, `detectors()`. Read-only. Never use it to change state during a
  playtest — interact as a player would.

If a hook is missing, note it as a finding instead of scraping pixels.

## Procedure

1. Start the dev server in the background (`npm run dev`) and note the actual port.
2. Open the app with Playwright MCP; capture console errors throughout.
3. Run the scenario requested, or by default the Phase 2 smoke path:
   1. load → gun visible, generation counter at 0
   2. step ×1 → generation 1; play → generation increases; pause → stops
   3. place/slide the collector onto the predicted lane → first payout
      within the expected number of generations (gun period 30 + travel time)
   4. move collector off-lane → payouts stop; counters explain why
      (lost signals increase)
   5. change speed → rate per 300 generations unchanged (it's per-generation, not per-second)
4. Cross-check: UI `energy` == `receipts().length`-derived total;
   `generation` UI == `__ia.generation()`.
5. Screenshots at deviceScaleFactor 2 for anything a human will review; save
   under `docs/screenshots/<date>-<scenario>/`.
6. Usability judgement — answer explicitly:
   - Is it obvious what to do first?
   - Can the player tell why a detector did or didn't fire?
   - Are production numbers visible without hunting?

## Report

```
/playtest — <scenario> — <PASS|FAIL|ISSUES>
Steps: n/n passed (list failures with generation + screenshot path)
Console errors: …
State cross-checks: energy ✔/✘, generation ✔/✘
Usability findings: …
Missing test hooks: …
```
