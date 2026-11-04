# Incremental Automata

A browser-first incremental automation game where real Conway's Game of Life
(B3/S23) patterns are the machines. A separate game layer supplies collectors,
energy, research and progression. Every claimed machine actually works under
the automaton's rules.

**Status:** Phase 1 (simulation core + editor) complete. See [`docs/PHASE1_REPORT.md`](docs/PHASE1_REPORT.md).

![Chamber at generation 600](docs/screenshots/2026-11-04-phase1/chamber-gen600.png)

## Run

```bash
npm install
npm run dev            # http://localhost:5173
npm test               # unit + reference fixtures
npm run test:e2e       # Playwright (Chromium)
npm run bench          # add -- --browser for render timing
```

Controls: Space play/pause · N step · R rotate · M mirror · F fit · Esc draw tool · wheel zoom · right-drag pan.

## Docs

- Plan and phase gates: [`docs/MASTER_PLAN.md`](docs/MASTER_PLAN.md)
- Architecture: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · Tests: [`docs/TEST_PLAN.md`](docs/TEST_PLAN.md) · Provenance: [`docs/LICENSE_PROVENANCE.md`](docs/LICENSE_PROVENANCE.md)
- Agent tooling (skills, MCP): [`docs/DEV_TOOLING.md`](docs/DEV_TOOLING.md) · Agent rules: [`CLAUDE.md`](CLAUDE.md)
