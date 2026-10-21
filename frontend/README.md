# HumanFlow frontend

React, TypeScript, Vite, Three.js, React Three Fiber, and Drei power the owner-approved interactive globe. The approved design, layout, colors, and animations are preserved in Phase 3 finalization.

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
