# Phase 2 verification

Verified locally on October 21, 2026, with Python 3.12.7, Pandas 3.0.6, PostgreSQL 17.10, Node 24.22.0, and npm 11.21.1. Machine-readable evidence is in [phase-2-report.json](phase-2-report.json). Official source checksums and acquisition times are in [sources.lock.json](../data/sources.lock.json).

## Imported coverage and counts

Counts are normalized observation rows, not asserted migrant totals. IRS has two measure rows per published corridor. Missing values are included in record counts.

| Dataset | Years/period | Observation rows | Unavailable values |
| --- | --- | ---: | ---: |
| UN DESA 2024 bilateral stock, both sexes | 1990, 1995, 2000, 2005, 2010, 2015, 2020, 2024 | 74,784 | 1 missing |
| Census ACS interstate movers | 2023 1-year estimate | 2,550 | 0 |
| Census ACS interstate movers | 2024 1-year estimate | 2,550 | 255 missing |
| IRS state outflows, returns + covered individuals | 2022 → 2023 filing years | 5,088 | No suppression markers in retained cells; omitted corridors remain absent |
| IRS county outflows, returns + covered individuals | 2022 → 2023 filing years | 107,228 | No suppression markers in retained cells; omitted corridors remain absent |
| World Bank population | Annual 2015–2024 | 2,170 | 0 |
| World Bank GDP, current US$ | Annual 2015–2024 | 2,170 | 81 missing |
| World Bank GDP per capita, current US$ | Annual 2015–2024 | 2,170 | 81 missing |
| World Bank modeled unemployment | Annual 2015–2024 | 2,170 | 309 missing |

Total: **192,200 migration observations**, **8,680 economic observations**, **65,512 distinct directed corridors**. The shared geography dimension contains **236 countries/areas/provider economies**, **51 states/DC**, and **3,144 counties/equivalents**. WDI observations cover 217 nonaggregate economies. The UN imported subset has 233 distinct origins and 231 destinations; absence of a published corridor is not zero.

UN aggregate/other rows were excluded (18,682 raw rows). IRS state files excluded 254 summary/foreign rows and 51 nonmigrant rows; county files excluded 33,601 summary/foreign rows and 3,143 nonmigrant rows. WDI excluded 490 aggregate observations per indicator. Detailed reports preserve these exclusions separately from missing observations.

## PostgreSQL status

A dedicated local PostgreSQL 17.10 cluster is initialized at `data/postgres` (ignored by Git). It listens only on the repository Unix socket at `data/postgres-socket`, port 55432; it is not registered as a startup service. Database `humanflow` contains the full batch, and `humanflow_test` is separate for rollback-based integration tests.

```sh
export DATABASE_URL='postgresql:///humanflow?host=/Users/neha/Projects/humanflow/data/postgres-socket&port=55432'
export TEST_DATABASE_URL='postgresql:///humanflow_test?host=/Users/neha/Projects/humanflow/data/postgres-socket&port=55432'
```

The full bundle `0b5c4bf04f915617cbb337119fb7727dbf066c19c2e430a4215ebafb29ba7063` was loaded successfully. Repeating the load reported `already_loaded=true`, with one ingestion run and unchanged fact/dimension counts. The database active pointer matches that bundle. Transactional rollback and repeated schema migrations were tested separately.

For this local cluster only:

```sh
/opt/homebrew/opt/postgresql@17/bin/pg_ctl -D data/postgres status
/opt/homebrew/opt/postgresql@17/bin/pg_ctl -D data/postgres stop
# To restart after stopping:
/opt/homebrew/opt/postgresql@17/bin/pg_ctl -D data/postgres -l data/postgres/server.log -o '-h "" -k /Users/neha/Projects/humanflow/data/postgres-socket -p 55432' start
```

Local socket access uses the current user's trust-authenticated development cluster. Use password authentication and appropriate role/network restrictions for another host or a production deployment. No production deployment was performed.

## Checks actually run

- Install via `python -m pip install -e '.[dev,data]'` succeeded. A distributable wheel also built successfully and includes all six schema/analytics SQL files.
- Ruff lint and formatting checks passed; `git diff --check` passed.
- **46 Python tests passed**, including real PostgreSQL integration tests with no skips. The existing upstream Starlette/HTTPX TestClient deprecation warning remains; tests pass.
- A source-cache `fetch` verified all 15 pinned resources without network calls. All official source resources were successfully acquired during the initial refresh.
- Complete official data passed preprocessing validation for required values, geographic references, duplicate natural keys, units, supported years/periods, value/status consistency, and nonnegative integral migration counts.
- A fixture-based rebuild produced identical bundle metadata and CSV bytes from the same inputs. Full bundle checksums were validated again before loading.
- All five SQL analytics query types ran against the full database. The stock trend returned eight published years. The 2023 ACS net query returned all 51 states/DC, whose net interstate estimates sum to zero. The 2024 query returned only three states with all required cells available; it withheld the others. This partial 2024 result must not be interpreted as a complete national net distribution.
- Frontend `npm ci`, ESLint, **2 UI tests**, and TypeScript/production build passed. Frontend and backend application source files are unchanged from Phase 1.

GitHub Actions now includes PostgreSQL 17 and runs all database tests alongside existing lint, backend tests, frontend tests, and builds. Remote outcomes are available in the [repository Actions history](https://github.com/NehaMasurkarr/humanflow/actions/workflows/ci.yml).

## Remaining limits

Raw data and the local database remain local, outside Git. A new machine must acquire pinned files and run the loader. Public providers may revise URLs; a changed checksum requires review and explicit refresh. Python direct dependencies are pinned; the full transitive environment is not locked. Routine CI uses genuine source excerpts rather than downloading full live data. State/county economic series, IRS corridor AGI, additional annual releases, and geographic-vintage crosswalks remain outside this acquisition scope.

See [datasets.md](datasets.md) for stock/flow semantics, source licenses, coverage exclusions, IRS disclosure/methodology constraints, ACS uncertainty, geographic-vintage limits, and exact-year comparison rules. No globe, frontend redesign, ML, or Phase 3 work has been started.
