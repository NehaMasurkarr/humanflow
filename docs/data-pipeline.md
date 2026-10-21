# Running the Phase 2 pipeline

Requirements: Python 3.12, Node 24 for frontend checks, and PostgreSQL 17. Run commands from the repository root.

```sh
source .venv/bin/activate
python -m pip install -e '.[dev,data]'
python -m pipelines fetch
python -m pipelines build
```

`fetch` uses the committed checksum lock. A present cache is verified without network access. Missing snapshots are downloaded only from the catalog's official URL and must match the pinned hash. Corrupt local files fail validation. Live APIs may have changed since the pinned acquisition; an error is intentional, not an invitation to substitute a mirror.

For an explicit data update:

```sh
python -m pipelines fetch --refresh
# Review data/sources.lock.json and the subsequent validation report before publishing.
python -m pipelines build
```

Failed downloads leave the previous lock intact. Downloads use bounded transient retries, temporary files, and atomic renames. No data provider account or API key is needed for the integrated files.

`build` prints a bundle path under `data/processed/<batch_id>/`. The identity includes source checksums, catalog definitions, transformation code, and parser library versions. Files are deterministically sorted and checksummed. Existing bundles are verified and reused; rebuilding the same inputs produces identical CSV content. The manifest contains row counts, missing/suppressed counts, exclusions, source metadata, and provenance. Validation failures prevent publication.

```sh
python -m pipelines report data/processed/ACTUAL_BATCH_ID
```

The `humanflow-data` console command is equivalent to `python -m pipelines`. The optional global `--root /path/to/humanflow` argument goes before the subcommand. This is a repository workflow; source catalogs remain in the repository rather than being embedded into the Python wheel.

## PostgreSQL setup

Use a database dedicated to HumanFlow. The example below assumes a local PostgreSQL administrator role; your PostgreSQL installation may use your operating-system username instead of `postgres`.

```sh
createuser -U postgres --pwprompt humanflow
createdb -U postgres --owner=humanflow humanflow
createdb -U postgres --owner=humanflow humanflow_test
cp .env.example .env
# Export DATABASE_URL and TEST_DATABASE_URL with your local credentials.
```

The pipeline does not auto-load `.env`; export values in the shell or use your environment manager. Do not pass a database URL through committed files. The application role owns its schema but needs no superuser privileges.

```sh
export DATABASE_URL='postgresql://humanflow:YOUR_LOCAL_PASSWORD@127.0.0.1:5432/humanflow'
python -m pipelines load data/processed/ACTUAL_BATCH_ID
# Repeating the same load reports already_loaded=true without duplicating facts.
```

Versioned SQL migrations under `pipelines/sql/` use a checksummed ledger. Applied migrations cannot be edited silently; add a new migration for schema changes. The `humanflow` schema contains:

| Relation | Purpose |
| --- | --- |
| `geographies`; `countries`, `us_states`, `us_counties` views | Shared geographic dimension with UN M49/provider country codes and US FIPS hierarchy |
| `corridors` | Directed origin-destination relationships with geographic foreign keys |
| `datasets`, `dataset_releases` | Source definitions and immutable batch-specific statistical semantics |
| `source_snapshots` | Exact official URLs, byte counts, retrieval times, and SHA-256 per batch/resource |
| `ingestion_runs`, `active_batch` | Historical bundle manifests and one active complete snapshot |
| `migration_measures`, `migration_observations` | Typed stock/flow counts, periods, status, MOE, and source-row locators |
| `economic_indicators`, `economic_observations` | WDI definitions, country/year values, units, missingness, and provenance |
| `migration_current`, `economic_current` views | Analytics confined to the active batch |

Loads validate bundle checksums and statistical/geographic contracts before touching facts. A transaction and advisory lock serialize schema/load operations. Each batch is loaded in full before the active pointer changes. Errors roll back the whole load; older batches remain available. Replaying an older bundle explicitly switches the active pointer back to that bundle. Do not manually alter imported facts.

The Phase 2 local verification database uses an ignored repository-local cluster and Unix socket, not a system service. Its status and exact connection command are recorded in `docs/phase-2-verification.md`. Do not commit that cluster or treat its local trust authentication as a production configuration.

## Analytics

All five query files are under `analytics/sql/`. The Python helper and CLI bind parameters and reject unsupported measure/period/year combinations.

```sh
python -m pipelines query top_corridors --params '{"dataset_id":"un_stock_2024","year_start":2024,"year_end":2024,"measure":"stock_persons","limit":10}'
python -m pipelines query geography_comparison --params '{"dataset_id":"irs_state_2223","year_start":2022,"year_end":2023,"measure":"tax_individuals"}'
python -m pipelines query migration_trends --params '{"family":"un_stock_2024","measure":"stock_persons","origin_id":"country:356","destination_id":"country:840"}'
python -m pipelines query net_migration --params '{"dataset_id":"census_acs_2023","year_start":2023,"year_end":2023}'
python -m pipelines query economic_comparison --params '{"year":2023,"indicator":"NY.GDP.PCAP.CD"}'
```

These queries do not combine stocks with flows or add different periods together. Geography comparisons show sums of **reported** corridors, with unavailable-cell counts. A missing corridor cannot be inferred to be zero from that sum. `net_migration` is restricted to complete ACS interstate estimates. Refer to `docs/datasets.md` before interpreting results.

## Testing and CI

```sh
python -m ruff check .
python -m ruff format --check .
export TEST_DATABASE_URL='postgresql://humanflow:YOUR_LOCAL_PASSWORD@127.0.0.1:5432/humanflow_test'
python -m pytest
```

Without `TEST_DATABASE_URL`, PostgreSQL tests explicitly skip. Set it to a separate development/test database to run the entire suite. Tests wrap their database changes in rollback transactions. CI always starts PostgreSQL 17 and runs these integration tests, so it does not rely on skips. Small genuine official excerpts, checksums, and regeneration instructions live in `tests/fixtures/`; normal tests require no external source downloads. Full live acquisition is deliberately separate from deterministic CI to avoid depending on agency uptime or mutable APIs.

Tests cover both Census layouts, OD direction, UN stock semantics, explicit missing/suppressed/zero handling, pagination errors, invalid codes, duplicate keys, unit consistency, unsupported periods/years, corrupt snapshots, source changes, byte-identical rebuilds, database constraints, atomic rollback, repeated loads, and all analytics queries. Existing health and frontend tests remain part of CI.
