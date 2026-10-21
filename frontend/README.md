# HumanFlow frontend

React, TypeScript, and Vite. The original starter UI and styling are intentionally preserved during Phase 1.

See the [repository README](../README.md) for complete setup and architecture.

Use Node 24, then run `npm ci`, `npm run dev`, `npm run lint`, `npm test`, and `npm run build` from this directory. `npm run test:watch` enables interactive tests.

`src/main.tsx` mounts `src/App.tsx`; shared test lifecycle setup lives in `src/test/setup.ts`. Keep feature modules under `src/` as real product features arrive rather than adding empty abstractions now.

Copy `.env.example` to `.env.local` to configure the development API proxy. Requests to `/api/health` reach FastAPI's `/health`; the current screen does not fetch data yet.
