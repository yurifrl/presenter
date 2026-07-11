# Presenter System — Design

Status: approved for spec
Date: 2026-07-10
Beads: grafana-apj (Slice 1), grafana-lau (Slice 2), grafana-682 (Slice 3)

## Summary

A small, reliable presenter system. A user builds an HTML slide deck (any
framework, usually AI-generated), drops in one hosted `<script>` ("play.js"),
and configures it with a server URL + a presentation token. On open, the
script prompts for a keyphrase, connects to a WebSocket, and thereafter acts
like a Bluetooth presenter remote: `next` / `prev` / `goto`. Any number of
peers can connect to the same presentation and stay in sync — the main second
peer being a phone/Expo app used as a teleprompter-driven remote.

The web app exists because it owns the WebSocket, the admin, and the API. The
Expo app is a thin client of the same protocol.

## Scope: three slices, built in order

1. **Core** — server + admin + shippable play.js. The end-to-end loop.
2. **Teleprompter notation** — markdown whose anchors map to slide keys;
   scrolling fires `goto`.
3. **Expo app** — cross-platform remote/teleprompter, same shape as
   `/Users/yuri/Workdir/Yuri/syscd-app`.

Each slice gets its own implementation plan.

---

## Slice 1 — Core server + admin + play.js

### Stack

- **Bun + Hono**, single server process.
- **SQLite via `bun:sqlite`** (built in — no `better-sqlite3`).
- **WebSocket via `Bun.serve` native websocket** (no `ws` package). Hono
  serves HTTP; Bun handles the WS upgrade.
- **Admin UI**: Vite + React SPA, built to static assets, served by Hono.
- **play.js**: plain TypeScript, bundled by Vite to a single IIFE script file.

Ponytail calls (deliberate simplifications):
- No `ws`, no `better-sqlite3` — Bun ships both.
- play.js emulates a clicker (synthetic keyboard events) rather than requiring
  slide authors to wire a custom API. This is what makes it framework-agnostic.

### Auth

Google OAuth login, admin only. Session cookie. Google client id/secret and
allowed-origin config come from env. No Cloudflare header logic.

### Data model (SQLite)

- `system_tokens`: `id`, `name`, `token` (random string), `expires_at`
  (nullable = permanent), `created_at`.
- `presentations`: `id`, `name`, `keyphrase`, `token` (random string),
  `current_slide` (nullable text), `created_at`.

Connections are in-memory only; not persisted.

Renew = update `expires_at`, keep the same `token` string (applies to both
tables where a TTL exists).

### Token model

- **Presentation token** — belongs to a presentation, embedded in the slide's
  `<script>` config. Identifies which presentation the socket joins.
- **System token** — named, permanent (or TTL), for consumer apps (the Expo
  remote or a second controller). A system-token client can list presentations
  over HTTP and choose one to join.

### HTTP API

- `GET  /auth/google` / `GET /auth/google/callback` — OAuth.
- `POST /auth/logout`.
- Admin (session-authed):
  - `GET/POST/DELETE /api/system-tokens`, `POST /api/system-tokens/:id/renew`.
  - `GET/POST/DELETE /api/presentations`,
    `POST /api/presentations/:id/renew`.
  - `POST /api/presentations/:id/cmd` — send `next|prev|goto` from admin.
- Consumer (system-token authed, `Authorization: Bearer <token>`):
  - `GET /api/presentations` — list (id + name only).
- Static: admin SPA, and `GET /play.js`.

### WebSocket protocol

Connect: `GET /ws?token=<token>`.

- If the token is a **presentation token**, the peer is bound to that
  presentation; it must then send `{type:"join", keyphrase}`. Server validates
  the keyphrase; on success replies `{type:"joined", current}` (current slide),
  else closes.
- If the token is a **system token**, the peer sends
  `{type:"join", presentationId, keyphrase}` to bind + validate.

Control messages (any joined peer → server → broadcast to all peers of that
presentation):

- `{type:"cmd", cmd:"next"}`
- `{type:"cmd", cmd:"prev"}`
- `{type:"cmd", cmd:"goto", key, value}`

Server updates `current_slide` on `goto` and broadcasts `{type:"cmd", ...}`
to every peer of the presentation **including the sender**. Late joiners
receive `current` in the `joined` reply.

**Multi-deck sync**: several slide decks can join the same presentation at
once (e.g. an audience view and a presenter-notes view). Because every peer
both sends and receives, navigating *any* connected deck advances *all* of
them. The originating deck does not apply the change locally; it sends the
cmd and lets the server echo drive a single uniform apply on every peer.

### play.js (the shippable script)

Usage in any deck:

```html
<script src="https://host/play.js"
        data-url="wss://host/ws"
        data-token="PRESENTATION_TOKEN"></script>
```

Behavior:

1. On load, prompt for the keyphrase.
2. Open the WebSocket with `?token=`, send `join` with the keyphrase.
3. On incoming command:
   - `next` → dispatch synthetic `ArrowRight` + `PageDown` keydown on
     `document`.
   - `prev` → synthetic `ArrowLeft` + `PageUp`.
   - `goto` → set `location.hash = value` **and** dispatch a
     `presenter:goto` CustomEvent (detail `{key, value}`) so reveal.js,
     impress.js, plain-div decks, or custom hooks all respond.

This mirrors what a hardware presenter remote does, so it works with any slide
framework with zero deck-specific wiring. Authors who want richer control
listen for `presenter:goto`.

**play.js also forwards local navigation** so multiple decks stay in sync:
it captures user-originated `ArrowRight`/`PageDown`/`Space` → `next`,
`ArrowLeft`/`PageUp` → `prev`, and `hashchange` → `goto`, and sends them to
the server (which broadcasts to all peers). `window.Presenter.{next,prev,goto}`
also send. A guard flag suppresses the synthetic events produced by
`applyCommand` so echoes are not re-forwarded (no infinite loop). Local user
actions are not applied locally — the server echo applies them uniformly on
every connected deck.

### Admin UI screens

- Login.
- System tokens: list, create (name + optional TTL), renew, delete.
- Presentations: list, create (name + keyphrase → server generates token),
  renew token TTL, delete; per-presentation view showing connected-peer count,
  live `current_slide`, and buttons for next / prev / goto.

### Success criteria (Slice 1)

- Log in with Google; unauthorized users cannot reach admin APIs.
- Create a presentation (gets token + keyphrase) and a system token.
- Open a sample deck with play.js embedded; keyphrase prompt gates the connect.
- Pressing next/prev/goto in admin advances the deck in the browser.
- A second peer (second browser tab with a system token) joins the same
  presentation and stays in sync.

---

## Slice 2 — Teleprompter markdown notation

Markdown stored per presentation (new `presentations.script` text column).
Anchors map to slide keys. A teleprompter view (admin web first, Expo later):

- Scrolls the text; crossing an anchor fires `goto` with that key.
- Tap/click pauses the auto-scroll (does not change slides while paused).
- With no anchors, tap left/right thirds of the screen fire `prev`/`next`.

Notation: an anchor is a line like `[[slide:intro]]` (or a heading with an
explicit id — decided in the Slice 2 plan). Kept minimal; exact syntax locked
when writing that plan.

## Slice 3 — Expo app

Same shape as `syscd-app` (Expo, expo-router, Tamagui). Enter server URL +
system token → list presentations (consumer API) → connect (keyphrase) →
teleprompter view: scroll-driven `goto`, tap to pause, tap zones for
prev/next. Uses the same WS protocol and consumer HTTP API; no server changes
required.

---

## Out of scope (YAGNI, revisit if asked)

- Cloudflare Access / header auth.
- Multi-tenant orgs / roles beyond the Google allowlist.
- Persisting connection history or analytics.
- Slide rendering/authoring in the admin (decks are authored externally).
