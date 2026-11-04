# Development tooling: skills, MCP, hooks

Decision record for how Claude Code (or another coding agent) works on this
repository. Companion to `docs/MASTER_PLAN.md`.

## Principle

Give the agent four capabilities: **build** the game, **verify** the automaton
is mathematically correct, **observe** the game through a real browser, and
**experiment** without breaking known-good behavior. Use the lightest
mechanism for each:

| Mechanism | Used for |
| --- | --- |
| `CLAUDE.md` | Project-wide invariants that apply to every task |
| Skills (`.claude/skills/*/SKILL.md`) | Repeatable workflows with explicit validation criteria |
| MCP servers (`.mcp.json`) | Access to external programs — currently only a browser |
| Scripts + tests + CI | Deterministic work that must not depend on model judgement |

## Skills

| Skill | Status | Purpose |
| --- | --- | --- |
| `/life-verify` | active | B3/S23 correctness via fixtures, hashes, determinism checks, Golly cross-checks |
| `/pattern-lab` | active | Import/characterise/transform patterns; provenance and licensing |
| `/factory-build` | active | Detectors, ledger, blueprints, placement — game layer never alters the automaton |
| `/playtest` | active | Browser-driven verification through Playwright MCP |
| `/experiment` | gated (Phase 4+) | Reproducible layout comparisons from snapshots |
| `/release-gate` | **not created** | Use the bundled `/verify` skill plus the "Definition of done" in `CLAUDE.md`. Create a custom skill only if that proves insufficient. |

Invariants live in `CLAUDE.md` only; skills reference them rather than
restating them.

## MCP servers

| Server | Status | Notes |
| --- | --- | --- |
| Playwright MCP (`@playwright/mcp`) | **enabled** in `.mcp.json`, pinned to `0.0.83` | Canvas UI interaction, screenshots, console errors |
| Chrome DevTools MCP | deferred | Add only when profiling is needed (simulation speed, render cost, memory) |
| GitHub MCP | not added | Local `git` plus the host's GitHub integration cover our needs |
| Golly MCP | **not built** (python-lifelib script is the reference oracle) | Golly stays an independent reference app driven by local scripts. Revisit only if frequent programmatic access becomes necessary, and then expose a small restricted interface |

Adding Chrome DevTools later (pin a reviewed version, don't use `@latest`):

```bash
claude mcp add --scope project chrome-devtools -- npx -y chrome-devtools-mcp@1.11.0 --no-performance-crux
```

Check connection status with `/mcp` inside Claude Code. When bumping a pinned
MCP version, review its changelog and update this table.

## Subagents, hooks, models

- **Subagents:** none yet. Candidate later: a read-only *simulation validator*
  that independently reviews `src/core/` changes and rejects anything only
  visually correct.
- **Hooks:** none yet. Enforcement comes from tests and GitHub Actions. A
  candidate hook later: block edits to `tests/fixtures/**/expected*` unless a
  `/life-verify` reference run is recorded.
- **ML / fine-tuning:** not planned. The hard work is deterministic simulation
  and verification, where code and tests are cheaper and more reliable.

## Rollout checklist

1. Foundation — Vite `vanilla-ts` + git ✔; `CLAUDE.md` ✔; Vitest + Playwright Test ✔; Playwright MCP ✔; CI ✔
2. Simulation — `/life-verify` ✔ and `/pattern-lab` ✔ written; canonical RLE imported ✔; cross-checked with python-lifelib ✔ (Golly optional)
3. Gameplay — `/factory-build` ✔ and `/playtest` ✔ written; build collectors + economy; run browser verification
4. Optimisation — Chrome DevTools MCP if needed; `/experiment` ✔ written (gated); deterministic layout comparisons; review playtests before expanding
