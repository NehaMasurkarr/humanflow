# Migration heatmap

The Phase 4 heatmap extension adds PostgreSQL-backed geographic overlays to the existing Earth. The owner approved the local heatmap visuals before publication. No Phase 5 work is included.

## Preview and controls

Open **http://localhost:5174** with the local API on port 8000 connected to the existing Phase 2 PostgreSQL database. The initial view remains **Arcs**. Select **Heatmap** in the left **Explore connections** panel. On mobile, open **Filters** to switch layers, then close Filters and open **Corridors** for the legend and heatmap controls.

- Global / United States, data source, reporting period, measure, origin/destination filters, and minimum corridor observation value remain shared with the existing globe.
- **Incoming** sums observations by destination; **Outgoing** sums by origin. No net migration or population density is inferred by this layer.
- The blue→cyan→gold color scale uses `log(1 + reported value) / log(1 + selection maximum)`. Numeric ticks, hover readouts, and keyboard-accessible highlight controls expose actual measurement units. Changing a selection resets the color domain and highlight; compare numeric values rather than colors across periods or sources.
- The legend threshold dims lower values without removing records or changing SQL totals. The minimum observation filter instead selects which corridor observations enter the SQL sum; below-threshold counts remain explicit.
- Opacity ranges from 0% to 85%, initially 48%, leaving the original Earth textures beneath the overlay. Ocean pixels are transparent; the atmosphere and illustrative day/night lighting remain. The overlay follows the original light direction.
- Gray hatching denotes unavailable/unpublished/filtered-out values. Partial sums with explicit unavailable cells are also hatched. Observed zero is blue. An empty numeric domain is explicitly unavailable rather than presented as observed zero.
- Hover a geographic polygon (tap on mobile) for its reported sum, direction, source, units, actual reporting period, observation counts, missing/suppressed counts, and caveats. Camera interaction clears the geographic tooltip. An accessible geographic table also exposes values, statuses, and missing-boundary indicators.
- Arcs and heatmap fills fade when switching modes. Existing rotation, zoom, particles in arc mode, low-power controls, and analytics drawer remain available. Errors never substitute arc statistics as heatmap results.

## Boundary sources and licenses

| Layer | Source | License / vintage | Identifiers |
| --- | --- | --- | --- |
| Countries/areas | [Natural Earth v5.1.2, 1:50m admin-0 map units](https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_50m_admin_0_map_units.geojson) | [Public domain](https://www.naturalearthdata.com/about/terms-of-use/); version-pinned modern generalized outlines | Source ISO_A3_EH → verified ISO numeric via pycountry; explicit documented provider exceptions |
| US states/DC | [US Census Generalized ACS2024 States 20M GeoJSON query](https://tigerweb.geo.census.gov/arcgis/rest/services/Generalized_ACS2024/State_County/MapServer/9/query?where=1%3D1&outFields=STATE%2CNAME%2CGEOID&outSR=4326&f=geojson&returnGeometry=true) | US government public-use geography; January 1, 2024 generalized outlines; [Census citation guidance](https://www.census.gov/about/policies/citation.html) | STATE must equal GEOID; retained FIPS codes are exactly the 50 states + DC |

Map units keep French Guiana separate from metropolitan France and other separately reported areas. Verified ISO alpha-3 mapping resolves Natural Earth's obsolete France numeric identifier to HumanFlow's `country:250`. UK constituent map units merge into `country:826`; Guernsey and Jersey merge into the existing provider-defined Channel Islands `country:830`; Kosovo uses the existing World Bank `country:WB:XKX` identifier. No name-based fuzzy matching is used.

Natural Earth units lacking an unambiguous statistical match (Somaliland, Northern Cyprus, Siachen Glacier), Jan Mayen's ambiguous provider correspondence, and the Antarctic polar outline are explicitly excluded in the provenance manifest. No source country is silently assigned those units' values. Puerto Rico is explicitly excluded from the interstate state/DC universe. Modern, generalized outlines are visualization aids rather than historical borders or a statement about disputed sovereignty.

There are 245 processed country/area outlines and 51 state/DC outlines. Of the full database's 236 country/area identifiers, 235 match a polygon; **Gibraltar is absent at this generalized scale and remains table-only**, with its real value retained and `has_boundary=false`. All 51 state/DC identifiers match. Extra geographic outlines without integrated statistical geographies remain unavailable rather than zero. Tiny islands may be subpixel at the mobile texture resolution.

Only geometry, verified IDs, and labels are retained. Natural Earth's demographic/economic attributes are discarded; migration colors always come from HumanFlow's PostgreSQL observations.

## Reproduction and provenance

```sh
# Existing Python environment with the data extra installed:
.venv/bin/python scripts/build_boundaries.py
```

`data/boundaries.lock.json` records exact provider URLs and SHA-256 hashes. The build script downloads missing snapshots into ignored `data/raw/boundaries/<sha256>/`, rejects unreviewed content changes, verifies codes/coordinate ranges/closed rings, groups explicitly matched map units, rounds geometry coordinates to four decimals, and removes consecutive duplicate vertices. Repeated builds produce identical artifacts. The source snapshots are not committed.

Processed files are `frontend/public/boundaries/global.geojson` and `us.geojson` (approximately 1.79 MB and 265 kB uncompressed). `backend/assets/boundary-index.json` and `frontend/public/boundaries/provenance.json` record source and output hashes, version/vintage, code mappings, exclusions, and licenses. Boundary asset URLs returned by the API carry a content-version query string. CI validates committed asset hashes, identifier uniqueness, ring closure, coordinate ranges, and the France/French Guiana, UK, Channel Islands, and state/DC correspondences without downloading providers' live data.

## PostgreSQL API and measurement semantics

`GET /v1/heatmap` requires `mode`, `dataset_id`, `year`, and `measure`. Optional parameters are `direction=incoming|outgoing`, `origin_id`, `destination_id`, and `min_value`. Unknown parameters, incompatible dataset/mode/measure/period combinations, and invalid geographic filters return 422. The endpoint returns all selected-mode dimension geographies, capped at 250; it never uses the paginated set of arcs to calculate heatmap magnitudes.

The query groups the active PostgreSQL source/period/measure observations by destination or origin, applies any corridor filters, and left joins the geographic dimension. Every result includes:

- `value`: sum of included observed corridor values, nullable; a genuine observed zero remains `0`.
- `published`, `observed`, `included`, `missing`, `suppressed`, and `below_threshold` counts.
- `status`: `reported` (known values without explicit unavailable cells), `partial` (known sum plus missing/suppressed cells), `unavailable` (published cells but no observed values), `not_published` (no matching published cells), or `filtered_out` (observed values all below the corridor threshold).
- Verified geographic ID, code, label, ISO3 where available, and `has_boundary`.

Response metadata preserves the dataset definition, provider, source URL/license/hash, active batch, exact reference/reporting period, measure/unit, filters, boundary provenance, color-domain maximum, unmatched geographic IDs, and interpretation notes. The existing repeatable-read/read-only transaction and five-second statement timeout apply. No schema migration, observation changes, or new migration dataset is required.

UN DESA observations remain **mid-year international migrant stocks**, never annual flows. ACS observations retain their one-year survey definition and reporting year; IRS observations retain their filing-year transition and returns/covered-individual units. Sources, periods, and measures are never pooled. `reported` does not mean complete: absent/suppressed corridors, especially IRS disclosure omissions, prevent interpreting sums as complete totals. Aggregate ACS uncertainty is not estimated. A country/state polygon's fill does not describe precise locations within that geography.

## Rendering and performance

The overlay adds one transparent sphere/draw call above the existing Earth and leaves `globe/shaders.ts` and NASA textures unchanged. Source rings are unwrapped at the antimeridian; both raster fills and raycast picking respect polygon holes. Geographic picking uses the actual vector outlines, independently of migration visualization anchors.

Cached `Path2D` geometry paints one reusable equirectangular canvas texture: 2048×1024 on desktop, 1024×512 on mobile or low power (approximately 8 MB / 2 MB RGBA). Only data, highlight, visibility, or resolution changes repaint/upload it; opacity and mode transitions update shader uniforms. No per-frame polygon triangulation, migration interpolation, or thousands of individual polygon meshes are needed. Existing demand rendering and the 30 Hz motion schedule are preserved. Physical mobile GPU performance and Safari/Firefox are not certified by Chromium emulation.

## Verification and publication checkpoint

The full backend suite passes **102 tests**, including official-data PostgreSQL sums, all supported source/year/measure/direction combinations, missing/zero/threshold distinctions, boundary validation, and all earlier functionality. The frontend suite passes **29 unit tests**. Frontend checks cover controls, unavailable-domain semantics, API errors/retries, layer switching, source metadata, polygon holes/antimeridian behavior, real country anchors, and all 51 Census state internal points. The four new full-data desktop/mobile browser cases passed, including actual rendered opacity differences and geographic raycasting.

[Full-data SQL verification](heatmap-database-verification.json) records 24 selections (eight UN reference years, two ACS reporting years, two IRS measures, both directions), all matching independent PostgreSQL GROUP BY queries. The complete **14-test desktop/mobile browser suite passes** with CI-managed local servers and the official-excerpt database, preserving earlier Phase 1–4 regressions. Final counts and CI status are reported at handoff. Visual approval has been received; publication follows the final checks. Chromium uses native Metal on macOS and SwiftShader on Linux CI; software WebGL on this Mac caused intermittent browser-test timeouts.
