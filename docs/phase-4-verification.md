# Phase 4 verification

Phase 4 adds the owner-approved collapsible desktop analytics drawer and mobile bottom sheet. It preserves the realistic Earth, textures, geographic anchors, existing navigation/styles/typography, and animations. The sole integration change in the approved rendering files is additive `App.tsx` state, launcher, and lazy drawer mounting; all other 18 files in the Phase 3 hash record remain byte-for-byte unchanged.

## Implemented analytics

- PostgreSQL historical reference/reporting-period trends; source-specific top corridors; origin/destination rankings; up to six country/state comparisons; fixed-bin corridor magnitude distributions.
- Complete-universe ACS incoming/outgoing/net interstate estimates, with incomplete states withheld.
- Exact-year country scatter plots for the four integrated World Bank indicators, with missing values excluded from plotted pairs and retained as unavailable in tables.
- Shared globe filters/year, selected-route scope, pagination, interactive SVG tooltips, keyboard tabs, accessible data tables, explicit source/measurement/period context, loading/empty/error/unsupported states, and CSV exports with download error handling.
- Lazy-loaded, nonanimated Recharts SVG charts. The initial JavaScript remains approximately 75 kB gzip; analytics loads approximately 115 kB gzip when opened. The existing lazy Earth chunk remains approximately 256 kB gzip. Production build sizes are approximate and may vary by build.

## Results actually run

| Check | Result |
| --- | --- |
| Python pytest with dedicated PostgreSQL test database | 80 passed |
| Ruff lint / formatting | Passed |
| Frontend Vitest / Testing Library | 19 passed |
| ESLint | Passed |
| TypeScript (`tsc -b`) | Passed |
| Production Vite build | Passed |
| Complete Playwright suite with CI-managed API/frontend servers and official PostgreSQL excerpts | 10 passed, desktop + mobile |
| Full-data browser checks | Both desktop analytics cases, mobile chart/CSV case, and all six existing globe regressions passed; the mobile mode-switch regression was rerun after its fix |
| SQL calculation verification | Full-data country rankings and 2023/2024 complete ACS net estimates match independent SQL |
| Approved rendering preservation | All 18 unchanged Phase 3 rendering/style/asset files match recorded hashes; only additive App integration changed |

Browser tests verify real SVG tooltips, pagination, source/year and mode switching, selected-corridor scope, geography/economic filters, exact-year unsupported states, ACS completeness, provenance-bearing CSV downloads, responsive viewport bounds, and console-error absence. The mobile regression closes the underlying corridor panel while analytics is open and restores it on dismissal so it cannot obscure mode navigation.

## Sources and calculations

No new observations or datasets were introduced. Analytics reads the existing real Phase 2 active batch through read-only PostgreSQL queries. Source definitions, licensing, and provenance remain in [datasets](datasets.md) and [analytics contracts](phase-4-analytics.md).

| Source | Available reference/reporting periods | Interpretation |
| --- | --- | --- |
| UN DESA 2024 edition | 1990, 1995, 2000, 2005, 2010, 2015, 2020, 2024 | Mid-year international migrant stocks, never annual flows |
| Census ACS | 2023, 2024 | Interstate one-year survey estimates, age 1+ |
| IRS SOI interstate | 2022→2023 filing transition | Matched returns or covered individuals; disclosed corridors only |
| World Bank WDI | 2015–2024 | GDP, GDP per capita, population, modeled ILO unemployment; country-level |

Full-data rankings and net estimates were checked against independent PostgreSQL queries. [Recorded results](phase-4-database-verification.json) show 9,348 UN corridors in 2024, 231 destination aggregates, eight trend reference years, and five magnitude bins. The GDP-per-capita comparison contains 199 observed country pairs and 32 unavailable/unpublished pairs for that selection. Complete ACS net estimates exist for 51 states/DC in 2023 and three states in 2024. Single-run local endpoint observations were 47–151 ms; these are not production performance guarantees.

## Verification commands

Run from the repository root with the documented Python 3.12/Node 24 environments:

```sh
TEST_DATABASE_URL='YOUR_DEDICATED_TEST_DATABASE_URL' .venv/bin/python -m pytest
.venv/bin/ruff check .
.venv/bin/ruff format --check .
npm --prefix frontend run lint
npm --prefix frontend test
npm --prefix frontend run typecheck
npm --prefix frontend run build
# Local API and frontend running against the existing full real database:
npm --prefix frontend run test:browser
# CI-equivalent lifecycle, using a dedicated *_browser database seeded with official excerpts:
DATABASE_URL='YOUR_DEDICATED_BROWSER_DATABASE_URL' .venv/bin/python scripts/seed_browser_database.py
# With Python/Node on PATH, from frontend/:
# CI=1 DATABASE_URL=... HUMANFLOW_API_PORT=8002 HUMANFLOW_PREVIEW_URL=http://127.0.0.1:5175 npm run test:browser
```

CI uses the existing backend, frontend, and browser jobs in [GitHub Actions](https://github.com/NehaMasurkarr/humanflow/actions/workflows/ci.yml). It installs the committed frontend lockfile and seeds PostgreSQL from genuine official excerpts; it does not download live migration data or use fabricated migration fixtures. The final commit's remote CI result is reported with the completion message.

## Limitations

- Partial published corridor sums and incomplete coverage must not be interpreted as complete national/global populations or flows. Coverage can change between periods; charts show counts and warnings rather than pretending missing cells are zero.
- No complete net migration from UN stocks or disclosed IRS corridors. No combined ACS margin of error is calculated; net values are point estimates for a defined interstate universe.
- Economic comparisons require exact-year overlap (UN/WDI: 2015, 2020, 2024). No integrated US state economics, inflation/PPP adjustment, causal model, regression, or population normalization beyond a source-defined per-capita indicator. Correlation does not establish causation.
- Charts show bounded result pages; economics is capped at 250 country rows. CSV exports are capped at 5,000 analytical rows and reject larger requests explicitly. Narrow filters to export more focused corridor analyses.
- Browser verification uses Chromium desktop/mobile emulation and SwiftShader, not a physical-device GPU benchmark or Safari/Firefox certification. The existing large Three.js chunk warning and Starlette HTTPX deprecation remain nonfatal.
- ML forecasting, Phase 5, additional datasets, county visualization, and production deployment are not implemented.
