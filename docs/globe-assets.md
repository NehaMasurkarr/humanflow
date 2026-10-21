# Globe imagery and geographic anchors

## Earth textures

The application serves genuine NASA equirectangular composites locally. These are decorative reference imagery, not observations of migration or imagery contemporaneous with every selected migration year. No generative images are used.

- Day: [NASA Blue Marble Next Generation, December 2004](https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/base-topography-bathymetry/), including shaded topography and bathymetry. Credit: NASA Earth Observatory / NASA Goddard; Blue Marble Next Generation; GEBCO bathymetry. Delivered at 4096 × 2048 after a proportional resize from 5400 × 2700.
- Night: [NASA Black Marble 2016 color map](https://visibleearth.nasa.gov/images/144898/earth-at-night-black-marble-2016-color-maps). Credit: NASA Earth Observatory / NASA Goddard. Delivered unchanged at 3600 × 1800.

Use follows the [NASA Images and Media Usage Guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/), which permit educational and informational website displays. Attribution is supplied; NASA does not endorse HumanFlow. No NASA logos are used. Source pages can redirect after NASA website migrations; the exact successfully downloaded asset URLs are retained.

See [`frontend/public/textures/provenance.json`](../frontend/public/textures/provenance.json) for exact URLs, original/delivered SHA-256 checksums, sizes, credits and transformations. Original downloads are ignored under `data/raw/phase3/`.

## Geographic anchors

`backend/assets/geographic-anchors.json` contains 262 sourced points: 211 country/economy points and all 50 US states plus DC. Each entry preserves its source URL, downloaded source checksum and method. Country IDs reuse Phase 2 UN M49 identifiers (and its explicit World Bank Kosovo ID); US state IDs reuse FIPS.

- Countries/economies: capital-city coordinates from the exact Phase 2 [World Bank country metadata](https://api.worldbank.org/v2/country?format=json&per_page=400) download locked in `data/sources.lock.json`. The existing pipeline mapping resolves ISO identities to UN numeric IDs. Blank coordinates are excluded; no synthetic coordinates or automatic substitutes are introduced. The Phase 2 dataset license documentation applies to the metadata.
- States/DC: [US Census 2024 National State Gazetteer](https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2024_Gazetteer/2024_Gaz_state_national.zip), `INTPTLAT` / `INTPTLONG`. Public US Census geographic reference data; [Gazetteer documentation](https://www.census.gov/geographies/reference-files/time-series/geo/gazetteer-files.2024.html). The year is a geographic-reference vintage, not a migration reporting year.

These are **representative visualization anchors**, not precise migrant residences, route waypoints, border crossings, or actual travel paths. Country capital-city points are not country centroids. A drawn arc depicts an origin–destination statistical relationship only. State internal points represent states rather than cities.

## Explicit missing coverage

The following Phase 2 countries/areas have no usable coordinate in the locked World Bank metadata. Their statistics remain in PostgreSQL; visual corridors requiring these endpoints must be explicitly omitted and counted in API coverage. No coordinates are guessed. County routes are out of Phase 3 scope.

- `country:830`: Channel Islands
- `country:531`: Curacao
- `country:292`: Gibraltar
- `country:663`: St. Martin (French part)
- `country:275`: West Bank and Gaza
- `country:534`: Sint Maarten (Dutch part)
- `country:175`: Mayotte
- `country:638`: Réunion
- `country:732`: Western Sahara
- `country:654`: Saint Helena
- `country:158`: China, Taiwan Province of China
- `country:336`: Holy See
- `country:660`: Anguilla
- `country:535`: Bonaire, Sint Eustatius and Saba
- `country:312`: Guadeloupe
- `country:474`: Martinique
- `country:500`: Montserrat
- `country:652`: Saint Barthélemy
- `country:238`: Falkland Islands (Malvinas)
- `country:254`: French Guiana
- `country:666`: Saint Pierre and Miquelon
- `country:184`: Cook Islands
- `country:570`: Niue
- `country:772`: Tokelau
- `country:876`: Wallis and Futuna Islands
