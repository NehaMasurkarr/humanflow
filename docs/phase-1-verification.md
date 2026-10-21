# Phase 1 verification

Verified locally on October 21, 2026, using Python 3.12.7, Node 24.22.0, and npm 11.21.1 on macOS.

| Check | Result |
| --- | --- |
| `python -m pip install -e '.[dev]'` | Package built and installed successfully |
| `python -m ruff check .` | Passed |
| `python -m ruff format --check .` | Passed |
| `python -m pytest` | 5 passed |
| `npm ci` | Clean lockfile installation passed |
| `npm run lint` | Passed |
| `npm test` | 2 passed |
| `npm run build` | TypeScript and production bundle passed |
| API `/health` and `/docs` over localhost | HTTP 200; health payload matched |
| Vite `/` and `/src/App.tsx` over localhost | HTTP 200; HTML entry and transformed module verified |
| Vite `/api/health` over localhost | HTTP 200; proxied health payload matched |
| `git diff --check` | Passed |

The tests use jsdom rather than a real browser. No browser screenshot or visual approval was performed; the existing App, entry point, styles, and assets were preserved. GitHub Actions is configured but has not run remotely.

The backend test run emits one upstream Starlette warning that its HTTPX TestClient integration is deprecated in favor of httpx2. All tests pass with the declared HTTPX dependency. Reassess that integration when updating the backend test stack.

The host's default Node 23/npm 10 combination was unsuitable for the existing ESLint engine requirements and encountered an npm resolver crash during dependency installation. Verification used an isolated Node 24/npm 11 toolchain under `/private/tmp/humanflow-toolchain`; the host default installation was not changed. Select Node 24 (for example with `nvm use`) before development.
