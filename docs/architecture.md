# Architecture decisions

## Phase 1

- Keep `backend.main:app` as the stable server entry point. `create_app()` constructs independent apps, and `backend/api/` owns HTTP routes and response contracts. Add service and persistence layers when concrete behavior needs them.
- Preserve `/health` and its original JSON payload. It reports application liveness; it does not assert database readiness or data availability.
- Keep the existing frontend entry point, screen, assets, and CSS. No globe, migration data, or ML functionality is introduced in Phase 1.
- Enable strict TypeScript checks. Use Vitest with jsdom and Testing Library for UI behavior, pytest with FastAPI TestClient for HTTP contracts, and Ruff for Python linting and formatting.
- Use the Vite development proxy instead of adding permissive CORS. Production deployment must configure API routing explicitly.
- Reserve `pipelines/`, `analytics/`, `ml/`, and `data/` for later work. Do not infer source quality, invent migration counts, or install analytics dependencies until the data requirements are defined.
- Use Python 3.12 and Node 24 in CI. Keep direct Python dependencies pinned and commit the frontend lockfile. A full Python transitive lock and deployment configuration can follow when target infrastructure is chosen.

Testing references: [FastAPI testing](https://fastapi.tiangolo.com/tutorial/testing/) and [Vitest guide](https://vitest.dev/guide/).

## Phase 2

- Add repository-owned `pipelines` and `analytics` Python packages and a `data` dependency extra. Keep backend routes and frontend UI unchanged.
- Use a shared geographic dimension with country/state/county views rather than duplicating geographic identifiers across fact tables. Country codes preserve official provider distinctions; FIPS references use Vintage 2023.
- Keep statistical semantics in batch-specific dataset releases and counts in typed observations. Never pool UN stocks, ACS estimates, or IRS filing transitions.
- Preserve source snapshots outside Git, track SHA-256 provenance, and reject unreviewed revisions. Use deterministic, checksummed processed bundles as the loading boundary.
- Load PostgreSQL transactionally with a migration ledger, natural keys, foreign keys, constrained units, and an active-batch pointer. Retain historical batches and prevent repeat-load duplication.
- Keep network acquisition separate from CI. Tests use genuine official excerpts and a PostgreSQL 17 service. Full local acquisition and data counts are documented separately.

See [dataset definitions](datasets.md), [pipeline commands and schema](data-pipeline.md), and [Phase 2 verification](phase-2-verification.md).

## Phase 3

- Preserve the owner-approved frontend design and rendering files exactly during finalization; record the approved source and asset checksums.
- Add read-only `/v1/datasets`, `/v1/geographies`, and `/v1/corridors` APIs backed by the active PostgreSQL batch. Enforce source/mode/year/measure compatibility and bounded, deterministic pagination. Keep `/health` independent of the database.
- Add an additive anchor table and globe-filter index through migration `002_globe.sql`. Coordinates preserve World Bank/Census provenance; unavailable anchors are counted explicitly. Existing migration facts are unchanged.
- Use local NASA day/night composites, React Three Fiber, Three.js, and Drei. Retain stocks versus flows and real reporting periods in filters, tooltips, and details. Arcs represent statistical relationships rather than actual travel paths.
- Extend CI with a PostgreSQL-backed browser job, source-derived fixture seed, actual API/Vite startup, and desktop/mobile Chromium checks. Include browser configuration and test code in TypeScript checking.
- Phase 4 analytics and ML remain outside this release. See [Phase 3 verification](phase-3-verification.md) and [globe setup](phase-3-preview.md).

## Phase 4 — interactive migration analytics

- Add `/v1/analytics` contracts and a separate PostgreSQL analytics service using the existing read-only transaction dependency. Preserve all Phase 3 endpoints and frontend files.
- Validate dataset/mode/measure/reporting-period combinations before aggregation. Compare only compatible ACS releases for trends; never pool stocks, ACS, and IRS. Include unanchored observations in analytics and report coverage separately from the globe's route limit.
- Expose bounded rankings, corridor results, geography comparisons, trends, magnitude distributions, complete ACS net estimates, and exact-year country economic comparisons. Keep partial sums explicitly labeled and missing values nullable.
- Export complete filtered result sets with source and measurement provenance, with a 5,000-row cap and explicit oversized-export rejection. Do not silently export only the displayed page.
- Implement the owner-approved, closed-by-default analytics drawer and mobile bottom sheet as additive components with scoped CSS and a lazy-loaded Recharts bundle. Keep existing navigation, renderer, imagery, typography, and animations unchanged. Share source/period/geographic state with the globe; reset comparison state on mode/source/measure changes. Preserve exact-year joins and missingness in charts, tooltips, and accessible tables.
- Extend frontend interaction and real desktop/mobile browser tests without adding synthetic migration data. Existing CI jobs cover the new API, UI, and SVG/export interactions. See [analytics contracts](phase-4-analytics.md), [full-data SQL verification](phase-4-database-verification.json), and [Phase 4 verification](phase-4-verification.md).
