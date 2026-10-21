# Interactive migration analytics

## Statistical contract

Analytics query the active PostgreSQL batch, including observations without visualization anchors. They do not aggregate the browser's limited set of globe routes. Every response includes source definitions, reference/reporting periods, measurement and unit, source snapshot SHA-256, active batch, applied filters, and coverage counts.

- **UN DESA 2024 edition:** international migrant stocks at mid-year 1990, 1995, 2000, 2005, 2010, 2015, 2020, and 2024. A change in stock is not an annual migration flow. Published bilateral observations do not establish complete global totals; absent corridors are not zero.
- **ACS 2023 and 2024:** compatible annual interstate survey estimates for people age 1+, based on residence one year earlier. Trends can compare these two releases; IRS observations are never pooled with them. Unavailable 2024 cells remain unavailable.
- **IRS SOI 2022→2023:** matched filing-year address transitions, separately measured as returns or covered individuals. Only one reporting period is integrated; no invented historical series. Disclosed corridors are incomplete, so net migration is not inferred.
- **Net interstate estimates:** ACS incoming minus outgoing, restricted to a state's complete 100 off-diagonal cells within the 50 states + DC universe. Incomplete states are withheld. This supports 51 states/DC in 2023 and only three in 2024. Do not sum the incomplete 2024 state subset as a national net measure. Stocks, IRS, magnitude thresholds, and origin/destination-restricted universes are rejected for net calculations. Geographic comparison selection is applied after the completeness check.
- **Economic comparisons:** World Bank GDP (current US dollars), GDP per capita (current US dollars/person), population, and modeled ILO unemployment, 2015–2024. Use exact-year country joins only: integrated UN stock/economic overlap is 2015, 2020, 2024. Missing/unpublished economic values remain null; no nearest-year substitution. State economics are unavailable; US national values are not assigned to states. Associations are descriptive; correlation does not establish causation. Nominal USD comparisons do not adjust for inflation, purchasing power, or population unless the selected indicator itself is per capita.

Rankings, comparisons, and trends report sums of **published observed corridor values**, with counts of observed and unavailable cells. Coverage can differ across periods. These sums must not be described as complete migrant populations or complete flows. Aggregated ACS uncertainty is not calculated; source-cell MOE is retained for corridor results. Magnitude distributions count observed corridors in fixed bins of the selected migration unit, not people within those bins.

## API

`GET /v1/analytics/indicators` lists actually integrated indicators, years, units, and economic provenance.

`GET /v1/analytics/{kind}` supports:

| Kind | Calculation |
| --- | --- |
| `trends` | Per-reference/reporting-period sums, keeping compatible ACS releases distinct in row provenance |
| `corridors` | Largest observed origin→destination observations, retaining source rows and ACS MOE |
| `rankings` | Origin or destination sums of reported values |
| `comparisons` | Same-source, same-period geography comparisons |
| `distribution` | Counts of observed corridors in fixed magnitude bins |
| `net` | Complete ACS incoming minus outgoing estimates |
| `economics` | Origin/destination reported sums joined to exact-year country economic observations |

Required query parameters: `mode`, `dataset_id`, `year`, `measure`. Optional: `origin_id`, `destination_id`, `min_value`, `side=origin|destination`, repeated `geography_ids` (at most six), `indicator`, `limit` (1–250), `offset` (0–10,000). Unknown parameters, incompatible modes/measures/years, and invalid geographic identifiers return 422. Comparisons select the source's own reporting period; callers cannot invent start/end-year combinations. Trends use all integrated reference periods in the selected source family rather than treating the currently selected year as a continuous annual range.

All aggregation/filtering happens server-side using bound SQL parameters and deterministic ordering. Database reads use the existing repeatable-read, read-only transaction and five-second statement timeout. Public response limits cap browser data; no raw migration table is downloaded into the frontend. Existing indexes support source/year/origin/destination selections.

`GET /v1/analytics/{kind}/export` exports **all matching result rows**, ignoring display pagination, up to 5,000 rows. Larger exports return 422 and ask for narrower filters rather than silently truncating. Empty results produce headers only. CSV includes provider, source URL/hash, batch, stock/flow type, reporting period, measure, units, scope, license, economic provenance where applicable, filters, and interpretation notes. Nulls are blank, never zero. Formula-like text cells are escaped for spreadsheet safety.

Example:

```sh
curl --get http://127.0.0.1:8000/v1/analytics/trends \
  --data-urlencode mode=global --data-urlencode dataset_id=un_stock_2024 \
  --data-urlencode year=2024 --data-urlencode measure=stock_persons \
  --data-urlencode origin_id=country:356 --data-urlencode destination_id=country:840
```

Sources, licensing, coverage, acquisition constraints, and raw-data reproducibility remain documented in [datasets](datasets.md) and [pipeline operations](data-pipeline.md). No additional or synthetic observations are introduced in Phase 4.

## Approved frontend integration

The owner approved an **Analytics** button within the existing corridor panel, opening a collapsible desktop drawer with Trends, Rankings, Comparisons, and Economics tabs; mobile uses a dismissible bottom sheet. It stays closed by default. Earth rendering, existing navigation, colors, typography, and animations are preserved. New styles are scoped in `src/analytics/analytics.css`; the chart bundle loads only on opening the drawer.

The drawer has a reporting-period selector sharing the globe year state, interactive chart tooltips, keyboard tab navigation, an accessible table, source links, coverage warnings, pagination, CSV download progress/errors, and loading/empty/error states. Charts use nonanimated SVG with responsive sizing. Escape or the close button dismisses the drawer and returns focus to its launcher; the nonmodal desktop drawer leaves the globe and its filters interactive.

- **Trends:** selecting a globe route follows that exact origin→destination corridor by default. Disable “Follow selected corridor” to use the globe filters instead. The numeric time axis preserves actual reference-year spacing; missing values are not connected. A single IRS period is a point, not an invented trend.
- **Rankings:** select top corridors, origins, destinations, or magnitude distribution. Charts display at most ten rows per page. Magnitude distributions count corridors, not people. Globe filters, magnitude threshold, and optional route scope apply.
- **Comparisons:** choose up to six real geographic identifiers and a migration side. A selected route proposes its two endpoints. Comparisons use the globe filters, not a hidden replacement universe. “Net interstate migration” uses the complete ACS matrix, and is unavailable until restrictive globe filters are reset. Incomplete states are withheld rather than estimated.
- **Economics:** choose one of the four actually integrated World Bank indicators, a migration side, and optionally countries. Up to 250 country rows are returned; only observed economic/migration pairs appear in scatter plots. Missing/unpublished pairs remain visible as unavailable in the table. Unsupported exact years and state economics have explicit explanatory states. No nearest-year or national-for-state substitution occurs.
- **Mode/source/measure changes:** reset drawer-local selection and keep API parameters aligned with the globe. Pagination resets on filter changes, and stale API responses are discarded.
- **CSV:** exports the complete matching server-side analysis rather than the chart's page. Oversized exports explain the 5,000-row cap; failed downloads display errors instead of saving an API error as a data file.

[Verification results](phase-4-verification.md) include PostgreSQL calculations, frontend interactions, responsive browser checks, production build, and CI. No new datasets or ML functionality are introduced in Phase 4.
