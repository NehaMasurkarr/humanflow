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
