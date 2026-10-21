# Phase 3 globe: setup and approved design

The owner approved the current 3D globe design on October 21, 2026. Finalization preserves its frontend design, layout, colors, and animations exactly. The approved source and asset checksums are recorded in `phase-3-approved-rendering.json`; verification results are in `phase-3-verification.md`.

Open **http://127.0.0.1:5174/** on this Mac. The backend is **http://127.0.0.1:8000**, with interactive API documentation at `/docs`. Port 5173 was already occupied, so the dedicated preview uses 5174.

## Restarting locally

Keep the existing repository-local PostgreSQL cluster running, as described in `phase-2-verification.md`. Apply the additive globe migration and reviewed geographic anchors once (repeating it is safe):

```sh
source .venv/bin/activate
export DATABASE_URL='postgresql:///humanflow?host=/Users/neha/Projects/humanflow/data/postgres-socket&port=55432'
python -m backend.sync_anchors
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

In another terminal, select Node 24 and start the frontend:

```sh
cd frontend
npm ci
npm run dev -- --host 127.0.0.1 --port 5174 --strictPort
```

Vite proxies `/api/*` requests to FastAPI on port 8000. The browser receives real, bounded PostgreSQL results; there is no fallback migration dataset. Health remains independent of database availability.

## Review interactions

- Drag to rotate; scroll or pinch to zoom. Pause motion or enable low power to stop automatic rotation and particles.
- Hover a visible arc for origin, destination, value, unit, reporting period and provider. Click an arc or a listed connection to open details, source-row provenance, and the official source link. Gold highlights selection.
- Switch between Global UN DESA stocks and US Census/IRS modes. Filters reset on source/mode changes so incompatible populations and periods are not mixed.
- Global years: 1990, 1995, 2000, 2005, 2010, 2015, 2020, 2024. US sources: Census ACS 2023 and 2024, and IRS state migration for the 2022→2023 filing-year transition. IRS returns and covered individuals remain separate measures.
- Search places, select origin/destination, choose reference years and set a minimum value. Use pagination to explore more corridors without downloading the entire dataset.
- On mobile, use the Filters and Corridors drawers. The globe remains available behind the drawers.

## Semantics, imagery and performance

UN values remain labelled **international migrant stock**, never annual flows. Census uses ACS 1-year estimates and retains 90% margins of error; IRS uses matched filing-year addresses. Missing observations are not converted to zero. The selected source, period, and missing-anchor/value coverage remain visible.

Representative World Bank capital-city points and Census state internal points anchor the arcs. These are statistical origin–destination relationships, not actual travel paths. Particles show direction, not journeys in progress. See `globe-assets.md` for licenses, exact coordinates' provenance, NASA image URLs, checksums, and the 25 country/area coordinate gaps.

NASA day/night composites are served locally. Lighting is illustrative rather than a live solar simulation. Imagery does not change to match historical migration dates. No external fonts or runtime imagery CDNs are required.

The globe renders at most 48 corridors on desktop, 32 on mobile, or 24 in low-power mode. Particles are instanced; geometries are memoized and disposed. Rendering uses demand mode with a nominal 30 Hz animation scheduler, pauses when the tab is hidden, and becomes idle when motion stops. Camera interaction can temporarily render more frequently for smoothness. Device pixel ratio is capped at 1.5 (1 in low-power mode). Reduced-motion preferences disable continuous motion. The lazy-loaded Three/Fiber/Drei chunk is approximately 256 KB gzip; Vite flags its uncompressed size. Two Earth textures total approximately 2.45 MB; actual device GPU performance varies.

## API contracts

- `GET /v1/datasets?mode=global|us`: active supported datasets, actual periods/measures, definitions and source hashes.
- `GET /v1/geographies?mode=global|us&search=...&limit=...&offset=...`: geographic entities with nullable sourced anchors. Maximum 250 per page.
- `GET /v1/corridors?mode=...&dataset_id=...&year=...&measure=...`: filtered observed corridors, anchored endpoints, source-row provenance, missingness/anchor exclusions and pagination. Optional origin, destination, minimum value, limit and offset. Maximum 150 per page, while the UI uses smaller limits.

The API uses parameterized SQL, repeatable-read read-only transactions, a query timeout, supported-source/year/measure checks, and deterministic descending-magnitude pagination. Migration `002_globe.sql` adds geographic anchors and an indexed globe query path; it does not change Phase 2 observations.

## Local checks

Run Python checks with the existing dedicated test database:

```sh
export TEST_DATABASE_URL='postgresql:///humanflow_test?host=/Users/neha/Projects/humanflow/data/postgres-socket&port=55432'
python -m ruff check .
python -m ruff format --check .
python -m pytest
```

Frontend checks:

```sh
cd frontend
npm run lint
npm test
npm run build
# With both local development servers running:
npm run test:browser
```

The browser suite uses Chromium with software WebGL to verify the real local renderer, Global/US switching, Census/IRS definitions, server geographic filtering, empty results, desktop drag/zoom, mobile touch gestures, and console errors. It does not mock migration responses. Unit fixtures are genuine local API responses captured from the Phase 2 active batch; their origin is documented beside the fixture files.

## CI browser verification

The browser job provisions PostgreSQL 17, then runs `python scripts/seed_browser_database.py` against a dedicated database ending in `_browser`. It builds a validated bundle from genuine, checksum-reviewed official excerpts and loads sourced geographic anchors. No mock migration observations or external live downloads are used. The source excerpts include 100 large UN bilateral corridors plus selected regression records, complete Census state tables, and selected Alabama/California IRS records. Fixture provenance identifies every retained source row.

Playwright starts the real API and Vite servers automatically when `CI` is set, using the isolated database. Local runs reuse the servers already running at the configured preview URL. `HUMANFLOW_PREVIEW_URL` and `HUMANFLOW_API_PORT` allow independent test ports without interrupting a design-review server. The approved frontend is identical in both paths.
