# @presenter/server

Bun + Hono backend. libSQL (SQLite-compatible, encrypted at rest), native Bun
WebSocket via Hono's `createBunWebSocket`.

## Env (`.env.example`)

`PORT` (7737), `DB_PATH`, `ENCRYPTION_KEY` (whole-DB key; falls back to
`SESSION_SECRET`), `SESSION_SECRET`, `ADMIN_EMAIL`, and for Google:
`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`,
`ALLOWED_EMAILS` (comma list).

## Run

```
bun install                 # at repo root
bun run dev:server          # hot-reload; auto-enables a printed password
bun run --cwd server test
```

Pass `--login-password` to force password login on even when Google is set.

## HTTP

- `GET /auth/google`, `GET /auth/google/callback`, `POST /auth/logout` — Google OAuth session (signed cookie).
- `GET /auth/methods` — `{password, google}`; `POST /auth/login` `{password}` — password login.
- Admin (session cookie): `GET /api/me`; `GET/POST/DELETE /api/presentations`, `POST /api/presentations/:id/renew`; `GET /api/presentations/:id/status`; `POST /api/presentations/:id/cmd`.
- Static: `GET /play.js` (from ../play/dist), admin SPA from ../web/dist — served only if built.

## WebSocket `GET /ws?token=<token>`

Two ways to authenticate:
- **Deck**: `?token=<presentation token>` then `{type:"join", keyphrase}`.
- **Control app**: a valid session cookie (no token), then `{type:"join", presentationId}` (no keyphrase).

On success → `{type:"joined", current}`, else `{type:"error"}` + close. Then
`{type:"cmd", cmd:"next"|"prev"|"goto", key?, value?}` broadcasts to all peers;
`goto` also updates `current_slide`. Peer counts tracked in-memory per presentation.
