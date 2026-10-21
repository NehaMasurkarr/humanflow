# HumanFlow

HumanFlow is a full-stack data analytics and AI/ML project exploring human migration globally and within the United States. Its experience combines a realistic interactive 3D Earth, glowing migration paths, and analytical views grounded in documented public data.

**Status: Phase 4 — interactive migration analytics.** HumanFlow combines its approved realistic Earth with an approved, collapsible analytics drawer. PostgreSQL powers historical trends, top corridors, origin/destination rankings, country/state comparisons, magnitude distributions, complete ACS net estimates, exact-year World Bank comparisons, and provenance-bearing CSV exports. Phase 1–3 functionality remains available. Phase 5 machine learning has not started.

See [analytics controls, API contracts, and statistical limitations](docs/phase-4-analytics.md), [Phase 4 verification](docs/phase-4-verification.md), the [globe setup, controls, and API contracts](docs/phase-3-preview.md), [imagery and coordinate provenance](docs/globe-assets.md), [Phase 3 verification](docs/phase-3-verification.md), [dataset definitions](docs/datasets.md), and [pipeline setup](docs/data-pipeline.md).

## Architecture

```text
frontend/              React + TypeScript + Vite application
  src/App.tsx          Approved filters, source/period controls, and corridor details
  src/analytics/       Lazy-loaded Recharts drawer, accessible tables, and CSV downloads
  src/globe/           Textured Earth, raised directional arcs, camera and particles
  public/textures/     Licensed NASA imagery and checksum provenance
  src/test/            Shared frontend test setup
  vite.config.ts       Development API proxy and Vitest configuration
backend/               Installable Python API package
  main.py              Application factory and ASGI entry point
  api/health.py        Preserved health contract
  api/globe.py         Dataset, geographic-search, and filtered corridor endpoints
  api/analytics.py     Source-specific aggregations and complete filtered CSV exports
  services/            Read-only, bounded PostgreSQL queries
  assets/              Sourced representative geographic anchors
tests/backend/         API contract tests using pytest and TestClient
pipelines/             Official downloads, Pandas transforms, validation, PostgreSQL loader
  sql/                 Versioned PostgreSQL migrations
analytics/             Compatibility guards and parameterized SQL analytics
ml/                    Reserved for future modeling
data/                  Tracked source catalog/lock; raw and processed files excluded
docs/                  Architecture and development notes
.github/workflows/     Backend and frontend CI
pyproject.toml         Python packaging, dependencies, linting, and tests
```

The browser accesses bounded backend APIs through `/api` during development. Vite forwards requests to FastAPI and removes the `/api` prefix. The UI queries `/v1/datasets`, `/v1/geographies`, `/v1/corridors`, and `/v1/analytics`, preserving source definitions and missingness. `/health` retains its original contract; `/docs` provides interactive API documentation. Production hosting must supply its own API routing; the Vite proxy applies only to the development server.

## Local setup

Requirements: Python 3.12 and Node.js 24 LTS with npm. `.nvmrc` selects Node 24 for nvm users. Run commands from the repository root unless noted.

```sh
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install -e '.[dev,data]'
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
```

The base Python manifest installs the API; the `data` extra adds the Phase 2 Pandas/PostgreSQL workflow. Existing unrelated analytics packages are left intact. PostgreSQL 17 is required for loading and integration tests; see [pipeline setup](docs/data-pipeline.md).

Start the backend in one terminal:

```sh
source .venv/bin/activate
# Configure a PostgreSQL database loaded with Phase 2 data:
export DATABASE_URL='postgresql://humanflow:YOUR_LOCAL_PASSWORD@127.0.0.1:5432/humanflow'
python -m backend.sync_anchors
python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

Start the frontend in another:

```sh
cd frontend
npm ci
npm run dev -- --host 127.0.0.1 --port 5174 --strictPort
```

Open `http://127.0.0.1:5174`. Check the API at `http://127.0.0.1:8000/health` or its documentation at `http://127.0.0.1:8000/docs`.

```sh
curl http://127.0.0.1:8000/health
curl http://127.0.0.1:5174/api/health
# Both return: {"status":"healthy","project":"HumanFlow"}
```

Vite loads `frontend/.env.local` automatically. `API_PROXY_TARGET` is server-only configuration, not a browser secret or public variable. Restart Vite after changes. The globe endpoints require `DATABASE_URL`; `/health` remains independent of database availability. Its example lists optional Uvicorn settings that must be exported in the shell; `backend/.env` is not automatically loaded. Never commit credentials or put secrets into `VITE_*` variables, which are bundled for the browser.

## Checks and tests

```sh
source .venv/bin/activate
python -m ruff check .
python -m ruff format --check .
python -m pytest

cd frontend
npm run lint
npm test
npm run typecheck
npm run build
# With backend/frontend servers running:
npm run test:browser
```

Backend tests cover the health response, its OpenAPI entry, unsupported methods, missing routes, and factory registration. Phase 2 adds official-source parser, validation, reproducibility, SQL analytics, and PostgreSQL integration tests; set `TEST_DATABASE_URL` to run database tests locally. Frontend tests use Vitest, Testing Library, and jsdom to exercise filters, source/mode switching, route selection, errors, empty states, and geographic placement. Playwright tests the actual globe in desktop and mobile Chromium, including touch gestures and console errors. `npm run test:watch` runs tests interactively; `npm run typecheck` checks TypeScript separately. The production build also checks TypeScript. `npm run preview` serves the built frontend locally and is not a production server.

GitHub Actions runs backend/data lint, formatting, and PostgreSQL tests alongside frontend lint, unit tests, TypeScript, and builds. A separate browser job seeds an isolated PostgreSQL database from genuine official excerpts, launches the API and frontend, and runs desktop/mobile Chromium tests. CI does not download live migration datasets. Frontend installations use the committed npm lockfile. Python direct dependency versions are pinned in `pyproject.toml`; transitive Python dependencies are resolved by pip rather than locked.

## Interactive analytics

Open **Analytics** inside the corridor panel (on mobile, open **Corridors** first). The drawer stays closed by default; the globe renderer and existing navigation, styles, and animations are preserved.

- **Trends:** published reference/reporting periods, optionally following a selected globe corridor. UN stock changes are never annual flows; ACS 2023/2024 remain compatible but distinct source releases.
- **Rankings:** top corridors, origins, destinations, or corridor-magnitude bins. Pagination and aggregations run on PostgreSQL, including records without globe anchors.
- **Comparisons:** choose up to six countries/areas or states and an origin/destination side. Net interstate ACS estimates require all 100 incoming/outgoing cells for each state; 2024 has only three eligible states.
- **Economics:** compare reported migration values with World Bank GDP, GDP per capita, unemployment, or population in the exact same year. Integrated UN/economic overlap is 2015, 2020, 2024. No state economic dataset is integrated. Correlation does not establish causation.
- **CSV:** export all matching analytical rows, independently of chart pagination, with source URL/hash, units, measurement type, reporting period, license, filters, and interpretation notes. Exports over 5,000 rows require narrower filters.

Charts have tooltips and an accessible data table. Missing values remain unavailable; partial sums are labeled and coverage is shown. See the [complete analytics contract](docs/phase-4-analytics.md) before interpreting totals or changes.

## Planned features and roadmap

1. **Phase 1: Foundation.** Repository architecture, manifests, environment templates, health contract, automated tests, CI, and setup documentation.
2. **Phase 2: Data foundation — implemented.** Official datasets, source/license documentation, geographic identifiers, stock/flow and period semantics, checksummed provenance, reproducible Pandas ingestion, PostgreSQL schemas, SQL queries, and automated validation. Coverage and limitations are recorded in the Phase 2 docs.
3. **Phase 3: Interactive 3D globe — implemented and design approved.** NASA Earth imagery, day/night shading, atmosphere, directional arcs, source/period/geographic filters, Global/US modes, provenance, and bounded PostgreSQL APIs. The approved visual design is preserved during finalization.
4. **Phase 4: Interactive migration analytics — implemented.** Approved desktop drawer/mobile bottom sheet; historical trends, corridor and geography rankings, comparisons, magnitude distributions, eligible ACS net estimates, exact-year World Bank scatter plots, accessible data tables, and CSV exports. All calculations query PostgreSQL and preserve coverage, units, reporting periods, and provenance.
5. **Phase 5: AI/ML — requires approval.** Establish baselines, temporal validation, and uncertainty reporting before adding predictive or explanatory models. Avoid presenting predictions as observed migration.

Future source expansion, visualization design, and production deployment decisions remain open. Phase 2 selects PostgreSQL storage and documents the current acquisition coverage. New features should include validation appropriate to their behavior. Keep source data and generated model artifacts out of Git, document provenance, and use conventional commit messages.
