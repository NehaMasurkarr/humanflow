# Phase 3 finalization verification

The owner approved the current HumanFlow globe design on October 21, 2026 and requested no further visual changes. Finalization preserved all 19 rendering/source/asset files in [phase-3-approved-rendering.json](phase-3-approved-rendering.json) byte-for-byte. The final production bundles retain the approved rendering outputs, including `index-BDNlVk_k.css`, `index-CBj_oufi.js`, and `GlobeViewport-DyFYbhVr.js`.

## Checks actually run

| Check | Result |
| --- | --- |
| Ruff lint and format checks | Passed |
| `git diff --check` | Passed |
| Python tests with PostgreSQL 17 | **60 passed**, no skips |
| Clean frontend `npm ci` | Passed; zero reported npm vulnerabilities |
| Frontend ESLint | Passed |
| Frontend Vitest / Testing Library / geometry tests | **11 passed** |
| `npm run typecheck` | Passed, including app, browser tests and tool configuration |
| `npm run build` | Passed |
| Playwright desktop and mobile, CI server-startup path | **6 passed**, no skips |
| Python wheel build and packaged resources | Passed; includes globe API, coordinate assets and both SQL migrations |
| Approved rendering checksum comparison | **19 / 19 unchanged** |

The Python suite includes the Phase 1 health contract, Phase 2 parsers/validation/analytics/reproducibility, and Phase 3 database-backed API contracts. It checks actual geographic coordinates, origin/destination direction, periods, invalid filters, pagination, explicit missingness, and source provenance.

The browser suite starts the actual FastAPI and Vite development servers through the same Playwright configuration used in CI. Local verification used separate ports 18000/15174 and the dedicated `humanflow_browser` database, preserving the user's 8000/5174 preview. It tests actual WebGL rendering, Global/US switching, Census/IRS source selection, server-side filtering, route details, empty states, desktop drag/zoom, mobile touch/pinch gestures, and browser console errors. No console errors were observed by the browser tests.

The CI seed contains 6,006 genuine migration observations, 80 economic observations, 2,651 distinct corridors, and 120 available geographic anchors derived from reviewed official excerpts. It is isolated from the full development database, which retains the Phase 2 data. Seed scripts reject database names that do not end in `_browser`. No migration values or coordinates were invented for CI.

## CI and release gates

The [GitHub Actions workflow](https://github.com/NehaMasurkarr/humanflow/actions/workflows/ci.yml) has independent backend, frontend, and browser jobs. Backend and browser jobs each provision PostgreSQL 17. The browser job installs Chromium and its Linux dependencies, seeds official excerpts, launches both servers, and runs all six browser tests. Failed browser runs retain traces for inspection.

Finalization requires the pushed `main` commit to pass all three jobs and the local worktree to be clean and synchronized with `origin/main`. Exact final commit hashes and the verified Actions run link are reported in the task completion response.

## Known warnings and limits

- The existing Starlette/HTTPX TestClient integration emits an upstream deprecation warning; tests pass. Three.js emits a Clock deprecation warning through the installed renderer stack. These are warnings, not browser console errors.
- Vite warns that the lazy renderer chunk exceeds 500 KB uncompressed (approximately 256 KB gzip). The approved bundle and rendering design are unchanged.
- NASA imagery dates, illustrative lighting, representative anchor semantics, missing coordinate coverage, rendering limits and device-dependent GPU behavior are documented in [globe setup](phase-3-preview.md) and [imagery/anchor provenance](globe-assets.md).
- CI uses real source excerpts rather than downloading mutable full agency datasets. Full data acquisition and validation remain available through Phase 2.

No Phase 4 analytics, geographic expansion, or ML forecasting is included.
