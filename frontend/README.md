# HumanFlow frontend

React, TypeScript, Vite, Three.js, React Three Fiber, and Drei power the owner-approved interactive globe. The approved Earth design, navigation, colors, typography, and animations are preserved. Phase 4 adds the separately approved collapsible analytics drawer/mobile bottom sheet.

See the [repository README](../README.md) and [globe setup and API contracts](../docs/phase-3-preview.md). Use Node 24 and run `npm ci` from this directory. The globe requires the FastAPI backend connected to the existing Phase 2 PostgreSQL data and geographic anchors.

```sh
npm run dev -- --host 127.0.0.1 --port 5174 --strictPort
npm run lint
npm test
npm run typecheck
npm run build
# With local backend/frontend servers running:
npm run test:browser
```

`src/main.tsx` mounts the approved `App.tsx` interface. `src/globe/` owns rendering and geographic geometry; `src/lib/` owns API hooks and types. Licensed NASA textures are served locally from `public/textures/`; their provenance is documented in [globe-assets.md](../docs/globe-assets.md).

Vite proxies `/api` to FastAPI on port 8000. Copy `.env.example` to `.env.local` to override the development proxy target. Global stocks and US Census/IRS observations remain separate, with explicit periods and definitions. No migration statistics are invented or substituted when the API is unavailable.

Unit fixtures contain genuine local API responses; browser tests use a real API and PostgreSQL. CI creates a dedicated database from reviewed official excerpts, starts both servers through Playwright, and requires desktop/mobile browser tests to pass.

`src/analytics/` contains the lazy-loaded Recharts interface, typed analytics responses, numeric formatting, and accessible results table. Open **Analytics** in the existing corridor panel. The chart bundle is not loaded until the drawer opens. Drawer controls share the globe reporting-period state; selected routes scope trends/rankings, while geography/economic comparisons use the globe filters and propose the route endpoints. Source/mode/measure changes reset the drawer selection, preventing incompatible state from carrying over. CSV exports fetch the same server-side filters and include complete provenance. See [analytics contracts and limitations](../docs/phase-4-analytics.md).

Recharts is MIT licensed; [official documentation](https://recharts.github.io/en-US/api/) describes the responsive charts and keyboard accessibility used here. Charts disable their own animation, respect the existing typography/palette, and have a data-table alternative. Browser tests exercise real SVG tooltips, filters, downloads, mode switching, and responsive bounds against PostgreSQL-backed API responses.
