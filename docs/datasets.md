# Phase 2 source catalog and statistical interpretation

All observations originate from official public downloads. `data/sources.json` is the machine-readable source catalog; `data/sources.lock.json` records exact download URLs, resolved URLs, retrieval times, byte counts, and SHA-256 hashes. Raw data lives outside Git in `data/raw/<sha256>/`. Processed CSV bundles also remain outside Git. No unofficial mirrors or substitute sources are used.

## Integrated sources

| Source and edition | Imported coverage | Statistical meaning | Update frequency and reuse |
| --- | --- | --- | --- |
| [UN DESA International Migrant Stock 2024](https://www.un.org/development/desa/pd/content/international-migrant-stock) | Published bilateral country/area rows; 1990, 1995, 2000, 2005, 2010, 2015, 2020, 2024; both sexes combined | Mid-year **stock** of international migrants by origin and destination; birthplace or citizenship definitions vary by source country. Not the number moving in a year. | Irregular revised editions. Workbook `Table of contents`, cell J6, explicitly states [CC BY 3.0 IGO](https://creativecommons.org/licenses/by/3.0/igo/). Attribute UN DESA Population Division, International Migrant Stock 2024. |
| [World Bank World Development Indicators](https://datahelpdesk.worldbank.org/knowledgebase/articles/889392) | 2015–2024, nonaggregate economies returned by WDI; four series below | Annual economic/demographic observations, including modeled unemployment estimates; null values remain unavailable | Annual observations with database revisions throughout the year. [CC BY 4.0 plus World Bank terms](https://data.worldbank.org/summary-terms-of-use), subject to indicator/provider metadata. |
| [Census ACS state-to-state tables](https://www.census.gov/data/tables/time-series/demo/geographic-mobility/state-to-state-migration.html), 2023 and 2024 | 50 states + DC; 2,550 directed interstate cells per edition | ACS **1-year estimates** for people age 1+ whose state of residence differs from one year earlier. These are survey estimates of movers, not a complete register of all moves during the calendar year. Retain published 90% margins of error. | Annual. US government public-use statistics; attribute Census Bureau and the relevant ACS year. [Public-use/citation guidance](https://www.census.gov/about/policies/citation.html), [federal-work copyright policy](https://www2.census.gov/foia/ds_policies/ds027.pdf). |
| [IRS SOI 2022–2023 migration](https://www.irs.gov/statistics/soi-tax-stats-migration-data-2022-2023) | State-to-state and county-to-county **outflow** files; disclosed domestic bilateral corridors only | Address changes between matched tax returns filed in consecutive years. Import number of returns (`n1`) and covered individuals (`n2`) as distinct measures. Not the full US population. | Annual. Federal employee works are freely reusable with credit requested under the [IRS content policy](https://www.irs.gov/about-irs/use-of-content-from-irsgov). |
| [Census Vintage 2023 geographic codes](https://www.census.gov/geographies/reference-files/2023/demo/popest/2023-fips.html) | 51 states/DC and their counties/equivalents, including Connecticut planning regions | Reference dimension, not a migration dataset | Annual vintage. Census public-use data; attribution as above. |
| [World Bank country metadata API](https://api.worldbank.org/v2/country?format=json&per_page=400) | Nonaggregate economies plus explicit classification of aggregate codes | Geographic reference for filtering WDI regions/income groups | Updated as needed; World Bank terms as above. |

The exact binary/CSV URLs for each table appear in the catalog. All listed download resources were successfully retrieved and parsed during Phase 2; no required source was silently replaced. The UN website sometimes rejected the research browser, but its official workbook downloaded successfully through the pipeline.

### World Bank indicators

| Code | Description | Stored unit |
| --- | --- | --- |
| [SP.POP.TOTL](https://data.worldbank.org/indicator/SP.POP.TOTL) | Population, total | persons |
| [NY.GDP.MKTP.CD](https://data.worldbank.org/indicator/NY.GDP.MKTP.CD) | GDP, current US dollars | current_usd |
| [NY.GDP.PCAP.CD](https://data.worldbank.org/indicator/NY.GDP.PCAP.CD) | GDP per capita, current US dollars | current_usd_per_person |
| [SL.UEM.TOTL.ZS](https://data.worldbank.org/indicator/SL.UEM.TOTL.ZS) | Unemployment, percentage of total labor force, modeled ILO estimate | percent_labor_force |

Indicator definition API responses are separately downloaded and pinned. They preserve source notes, original organizations, and provider links in bundle reports and database run manifests. Credit World Bank WDI and the underlying providers, including ILO for modeled unemployment. Current-dollar GDP comparisons are not inflation-adjusted or PPP-adjusted. No causal connection between migration and economic outcomes is inferred.

## Rules that prevent misleading statistics

- **Stocks versus flows:** UN snapshots always use `stock_persons`; ACS uses `acs_movers`; IRS uses `tax_returns` or `tax_individuals`. Stock changes are labelled `change_in_stock`, never net migration. Deaths, return migration, and definition revisions also affect stocks.
- **Time:** A UN observation is a point in time. ACS editions are 1-year survey estimates referencing residence one year earlier. IRS uses a `filing_year_transition` from 2022 to 2023, not a pooled two-year average or a two-year ACS estimate. Earlier IRS income tax years must not be mistaken for the filing-year period. No ACS multi-year estimates are imported, annualized, or mixed into 1-year series.
- **Scope:** UN corridors are international; Census and IRS imports are US domestic. US country-level WDI indicators cannot be treated as state indicators. Puerto Rico, foreign origins, and island-area categories are explicitly outside the imported 50-state/DC domestic universe.
- **Universe:** IRS covered individuals and returns are distinct from all residents. The [2022–2023 IRS guide](https://www.irs.gov/pub/irs-soi/2223inpublicmigdoc.pdf) documents a matching-method revision; comparisons across that break need explicit methodological review. The imported release uses a separate comparability family.
- **Missingness:** Missing values retain null and a `missing` status. IRS `-1` count suppression markers become null with `suppressed` status when present. Omitted county corridors are not filled with zero. Zero is a genuine observed value only when the source publishes it.
- **Exclusions:** UN regional totals and `Others` origins are excluded to avoid double counting. UN data retain country/area code 830 (Channel Islands), documented as a composite area. IRS totals, foreign/other summary codes, and nonmigrants are excluded. IRS inflow files are not loaded alongside outflows, which would duplicate corridors. AGI remains available in the raw source but is not imported into count observations.
- **Geography:** UN/ISO numeric codes link to World Bank economies using the pinned ISO reference package. World Bank Kosovo remains `country:WB:XKX` with no invented ISO/M49 code. Channel Islands is explicitly mapped from World Bank `CHI` to UN 830. Source-specific names and geographic designations do not imply sovereignty decisions. The county reference vintage is 2023; boundary changes require a reviewed crosswalk before adding other vintages.
- **Comparability:** Query helpers reject unsupported years, mixed measures, and mismatched periods. Economic comparisons use exact years. Trend queries retain real publication gaps. Only 2015, 2020, and 2024 overlap the UN stock years and the imported WDI window; do not attach nearest-year indicators to other stocks.
- **Net migration:** The net query requires all 100 incoming/outgoing off-diagonal cells for each state to be published and observed. It reports a net **interstate ACS estimate** within 50 states + DC, not total population change. It does not return net stock differences or incomplete IRS corridor sums. No derived net-MOE or statistical significance is claimed.

## Revisions and limitations

The UN source covers 233 countries/areas, but not every possible bilateral pair is published. Imported observations therefore describe the published subset, not a dense all-country matrix. Source notes and country-specific data-type fields remain inspectable in the raw workbook through each observation's source-row locator.

Census 2024 changed from a matrix to a long table and contains unavailable (`N`) cells. Its missing estimates are retained; net estimates are withheld wherever the complete-cell criterion fails. Census 2022 is deliberately outside this acquisition window; its comparability cautions must be reviewed before importing it. ACS estimates carry sampling uncertainty, and margins of error must not be summed as if independent.

IRS suppresses or omits small corridors, and county totals need not reproduce state totals. Public outflow/inflow releases can differ due to disclosure rules; this pipeline chooses the outflow release explicitly. Published corridor sums are labelled accordingly. No full net migration is asserted from that incomplete universe.

A refresh may change source bytes, especially for live WDI APIs. Default fetch refuses changed bytes. Reproduction of old data requires retaining the cached official snapshots; if an agency revises a URL, this repository does not host a redistribution archive. Review explicit `fetch --refresh` diffs and retain old raw/processed bundles as needed.
