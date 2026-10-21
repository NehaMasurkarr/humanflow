# HumanFlow

HumanFlow is a full-stack data analytics and AI/ML project exploring human migration globally and within the United States. Its planned experience combines a realistic interactive 3D Earth, glowing migration paths, and analytical views grounded in documented public data.

**Status: Phase 2 — data foundation.** The health API and original React/Vite screen are preserved. Official UN DESA, World Bank, Census, and IRS data now have checksum-pinned Pandas ingestion, validation, PostgreSQL storage, and SQL analytics. The globe, product migration views, and ML models remain planned. No synthetic migration statistics are included.

See the [source catalog and statistical definitions](docs/datasets.md), [pipeline setup](docs/data-pipeline.md), and [Phase 2 verification](docs/phase-2-verification.md).

## Architecture

```text
frontend/              React + TypeScript + Vite application
  src/App.tsx          Existing UI root (appearance preserved)
  src/assets/          Existing visual assets
  src/test/            Shared frontend test setup
  vite.config.ts       Development API proxy and Vitest configuration
backend/               Installable Python API package
  main.py              Application factory and ASGI entry point
  api/health.py        Typed health response and HTTP route
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

The browser will access backend APIs through `/api` during development. Vite forwards those requests to FastAPI and removes the `/api` prefix. The existing UI does not call the API yet. The API route itself remains `/health`; `/docs` provides interactive API documentation. Production hosting must supply its own API routing; the Vite proxy applies only to the development server.

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
python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

Start the frontend in another:

```sh
cd frontend
npm ci
npm run dev -- --host 127.0.0.1
```

Open `http://127.0.0.1:5173`. Check the API at `http://127.0.0.1:8000/health` or its documentation at `http://127.0.0.1:8000/docs`.

```sh
curl http://127.0.0.1:8000/health
curl http://127.0.0.1:5173/api/health
# Both return: {"status":"healthy","project":"HumanFlow"}
```

Vite loads `frontend/.env.local` automatically. `API_PROXY_TARGET` is server-only configuration, not a browser secret or public variable. Restart Vite after changes. The backend needs no application environment variables yet. Its example lists optional Uvicorn settings that must be exported in the shell; `backend/.env` is not automatically loaded. Never commit credentials or put secrets into `VITE_*` variables, which are bundled for the browser.

## Checks and tests

```sh
source .venv/bin/activate
python -m ruff check .
python -m ruff format --check .
python -m pytest

cd frontend
npm run lint
npm test
npm run build
```

Backend tests cover the health response, its OpenAPI entry, unsupported methods, missing routes, and factory registration. Phase 2 adds official-source parser, validation, reproducibility, SQL analytics, and PostgreSQL integration tests; set `TEST_DATABASE_URL` to run database tests locally. Frontend tests use Vitest, Testing Library, and jsdom to exercise the existing screen and counter interaction. `npm run test:watch` runs tests interactively; `npm run typecheck` checks TypeScript separately. The production build also checks TypeScript. `npm run preview` serves the built frontend locally and is not a production server.

GitHub Actions starts PostgreSQL 17 and runs backend/data lint, formatting, and tests alongside frontend lint, tests, and production builds on pushes and pull requests. Frontend installations use the committed npm lockfile. Python direct dependency versions are pinned in `pyproject.toml`; transitive Python dependencies are resolved by pip rather than locked.

## Planned features and roadmap

1. **Phase 1: Foundation.** Repository architecture, manifests, environment templates, health contract, automated tests, CI, and setup documentation.
2. **Phase 2: Data foundation — implemented.** Official datasets, source/license documentation, geographic identifiers, stock/flow and period semantics, checksummed provenance, reproducible Pandas ingestion, PostgreSQL schemas, SQL queries, and automated validation. Coverage and limitations are recorded in the Phase 2 docs.
3. **Phase 3: Global experience.** Develop the realistic interactive 3D Earth and glowing origin/destination paths, filters, and accessible analytical views. Agree on visual design before changing the current frontend.
4. **Phase 4: US migration mode.** Add detailed domestic migration exploration at geographic resolutions supported by the chosen sources, with consistent definitions and coverage indicators.
5. **Phase 5: Analytics and AI/ML.** Establish baselines, temporal validation, and uncertainty reporting before adding predictive or explanatory models. Avoid presenting predictions as observed migration.

Future source expansion, visualization design, and production deployment decisions remain open. Phase 2 selects PostgreSQL storage and documents the current acquisition coverage. New features should include validation appropriate to their behavior. Keep source data and generated model artifacts out of Git, document provenance, and use conventional commit messages.
