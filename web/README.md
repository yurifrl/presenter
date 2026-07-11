# @presenter/web

Admin UI for the presenter system. Vite + React + TypeScript, plain CSS.

## Dev

1. `bun install` at the repo root.
2. Run the backend on port 7737: `bun run dev:server`.
3. Run this SPA: `bun run dev:web` (from repo root) or `bun run dev` here.

The Vite dev server proxies `/api` and `/auth` to `http://localhost:7737`, so
session cookies work same-origin during development.

## Build

`bun run build` outputs static assets to `web/dist`, which the Hono backend
serves in production.

## Tests

`bun test` covers the pure helpers in `src/api.ts`.
