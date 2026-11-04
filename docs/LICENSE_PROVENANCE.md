# Licence and provenance ledger

## Patterns (`src/patterns/rle/`, metadata in `src/patterns/manifest.ts`)

| id | Discoverer | Source | Retrieved | Method | Licence review | Test status |
| --- | --- | --- | --- | --- | --- | --- |
| block | natural | https://conwaylife.com/wiki/Block | 2026-11-04 | transcribed* | ok (tiny canonical pattern) | verified |
| blinker | John Conway | https://conwaylife.com/wiki/Blinker | 2026-11-04 | transcribed* | ok | verified |
| glider | Richard K. Guy | https://conwaylife.com/wiki/Glider | 2026-11-04 | transcribed* | ok | verified |
| gosper-glider-gun | Bill Gosper | https://conwaylife.com/wiki/Gosper_glider_gun | 2026-11-04 | transcribed* | ok | verified (36×9, 36 cells, p30, +5 cells / 30 gens) |
| eater-1 | MIT group | https://conwaylife.com/wiki/Eater_1 | 2026-11-04 | transcribed* | ok | verified (consumes a SE glider at offset (−8, −8) and recovers) |

\* conwaylife.com returned a Cloudflare challenge to the build environment, so the RLE files were
transcribed from their well-known canonical forms. Each one was checked against python-lifelib, using
lifelib's own RLE parser, and by the engine tests. Re-download and diff them when the site is reachable.
LifeWiki *article text* is GFDL. None of it is copied here.

## Tools

| Tool | Licence | Use |
| --- | --- | --- |
| python-lifelib 2.5.6 (A. P. Goucher) | MIT | Test-time reference oracle only. Not shipped. |
| Vite, Vitest, TypeScript, ESLint, typescript-eslint, tsx | MIT / Apache-2.0 | Dev dependencies |
| Playwright / @playwright/mcp | Apache-2.0 | E2E tests and agent browser control |
| Golly | GPL-2.0+ | Not used yet (not installable here). Remains an optional external cross-check. |
