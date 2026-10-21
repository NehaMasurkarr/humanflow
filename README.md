# HumanFlow

HumanFlow is a full-stack data analytics and AI/ML project exploring human migration globally and within the United States. Its planned experience combines a realistic interactive 3D Earth, glowing migration paths, and analytical views grounded in documented public data.

**Status: Phase 1 — engineering foundation.** The API exposes a working health endpoint; the frontend retains the original React/Vite starter screen. Migration visualizations, datasets, pipelines, and models are planned, not implemented. No synthetic migration statistics are included.

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
pipelines/             Reserved for data ingestion and validation
analytics/             Reserved for migration analysis
ml/                    Reserved for future modeling
data/                 Local raw and processed data (excluded from Git)
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
python -m pip install -e '.[dev]'
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
```

The Python manifest declares only the dependencies needed for Phase 1. Existing locally installed analytics packages are left intact but are not required by this phase.

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

Backend tests cover the health response, its OpenAPI entry, unsupported methods, missing routes, and factory registration. Frontend tests use Vitest, Testing Library, and jsdom to exercise the existing screen and counter interaction. `npm run test:watch` runs tests interactively; `npm run typecheck` checks TypeScript separately. The production build also checks TypeScript. `npm run preview` serves the built frontend locally and is not a production server.

GitHub Actions runs backend lint, formatting, and tests alongside frontend lint, tests, and production builds on pushes and pull requests. Frontend installations use the committed npm lockfile. Python direct dependency versions are pinned in `pyproject.toml`; transitive Python dependencies are resolved by pip rather than locked.

## Planned features and roadmap

1. **Phase 1: Foundation.** Repository architecture, manifests, environment templates, health contract, automated tests, CI, and setup documentation.
2. **Phase 2: Data foundation.** Evaluate authoritative migration sources and licenses; define geographic identifiers, time ranges, flow versus stock semantics, provenance, and missing-data handling. Build ingestion and validation around real source data, with reproducible transformations and documented limitations.
3. **Phase 3: Global experience.** Develop the realistic interactive 3D Earth and glowing origin/destination paths, filters, and accessible analytical views. Agree on visual design before changing the current frontend.
4. **Phase 4: US migration mode.** Add detailed domestic migration exploration at geographic resolutions supported by the chosen sources, with consistent definitions and coverage indicators.
5. **Phase 5: Analytics and AI/ML.** Establish baselines, temporal validation, and uncertainty reporting before adding predictive or explanatory models. Avoid presenting predictions as observed migration.

Source selection, coverage, visualization design, storage, and deployment decisions remain open. New features should include validation appropriate to their behavior. Keep source data and generated model artifacts out of Git, document provenance, and use conventional commit messages.
