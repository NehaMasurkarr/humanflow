# Genuine API contract fixtures

These JSON responses were captured from the local Phase 2 PostgreSQL active batch through the Phase 3 API on 2026-10-21. Migration values, source hashes, periods, and representative anchors are genuine. Corridor pages use `limit=2` to keep fixtures small. `empty.json` is an actual API response with `min_value=1000000000000`, not a fabricated observation. Geography pages use `limit=250`.

Source definitions, licenses, and geographic-anchor provenance: repository `docs/datasets.md` and `docs/globe-assets.md`. Unit tests mock transport and the WebGL component only; separate Chromium checks exercise the actual renderer and live database.
