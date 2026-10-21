# Official source excerpts

`official/` contains small extracts of genuine, checksum-pinned official datasets. No migration statistics were invented for these fixtures. `provenance.json` identifies the original URL, retrieval time, SHA-256, retained source rows or filters, and the excerpt checksum. CSV line numbers include the header. Excel row numbers are one-based.

The UN extract retains the original header and the 100 largest published 2024 bilateral country/area corridors plus selected USA-destination regression rows. Census extracts retain the `Table` sheet only. The geography extract retains 51 state/DC entries and two real Alabama county entries. IRS state extracts retain selected Alabama rows plus California-origin rows; county extracts retain selected Alabama source rows, including summary/nonmigrant records to test exclusions. World Bank extracts retain USA, India, and the World aggregate; pagination counts are adjusted to the excerpt length (observation values and definitions are unchanged).

Regenerate from a reviewed local raw snapshot using `python tests/fixtures/export.py` from the repository root, after installing `.[data,dev]` and running the pipeline fetch command. Exported sheets retain their content but are reserialized; source and excerpt hashes differ. Tests record row coordinates relative to the excerpt. Production builds use complete files and original row positions.

Attribution: UN DESA Population Division, International Migrant Stock 2024 (CC BY 3.0 IGO); World Bank WDI and the providers listed in indicator metadata (CC BY 4.0 plus World Bank terms); US Census Bureau ACS and geography reference files; IRS SOI 2022–2023 migration data (US government public-use works). See `data/sources.json` and `docs/datasets.md` for source and license links.

Negative/error test cases deliberately mutate these source observations to exercise rejection. They are not factual migration observations and are never loaded into production bundles.

`python tests/fixtures/export.py --only un_stock_2024 irs_state_2223` regenerates just the named resources. The browser CI seed script uses these same genuine excerpts in a dedicated PostgreSQL database rather than mocking API responses.
