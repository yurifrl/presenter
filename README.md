# Presenter

Control any HTML slide deck like a Bluetooth clicker. Drop one `<script>` into
your deck (reveal.js, impress.js, plain divs — anything), and drive it from the
admin UI or a phone. Multiple decks on the same presentation stay in sync (e.g.
an audience view + a presenter-notes view).

- **`server/`** — Bun + Hono + libSQL (encrypted at rest). API, auth, WebSocket;
  serves the admin UI and `play.js`.
- **`web/`** — Vite + React admin UI.
- **`play/`** — the shippable `play.js` (tiny, framework-agnostic).
- **`sample/`** — a demo deck.

## Run

```sh
bun install
bun run dev        # builds + serves everything on http://localhost:7737
```

It prints a one-time admin password to the terminal. Open the URL, sign in,
create a presentation, and copy its embed snippet into your deck.

## How it connects

- **Slide decks** connect with the presentation's **token + keyphrase** (the
  token is in the embed snippet; the keyphrase is prompted on open).
- **Control apps** (admin UI, phone remote, second screen) just **sign in**
  (password or Google), then list presentations and connect — no per-app token.

## Embed in a deck

```html
<script src="https://YOUR-HOST/play.js"
        data-url="wss://YOUR-HOST/ws"
        data-token="PRESENTATION_TOKEN"></script>
```

`next`/`prev`/`goto` from any connected peer drives the deck. `goto` sets
`location.hash` and fires a `presenter:goto` event, so any framework responds.

## Login

- **Password** (default): when Google isn't configured, the server generates a
  fresh password each boot and prints it. Nothing stored.
- **Google**: set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
  `GOOGLE_REDIRECT_URI`, and `ALLOWED_EMAILS`. Create a "Web application" OAuth
  client at console.cloud.google.com and add
  `https://YOUR-HOST/auth/google/callback` as an authorized redirect URI.

See `server/.env.example` for all settings.

## Deploy

```sh
docker compose up --build
docker compose logs -f tunnel   # public HTTPS URL (Cloudflare)
docker compose logs app | grep password
```

The DB is encrypted at rest by libSQL. Set `ENCRYPTION_KEY` (32+ random bytes)
in production; changing it makes an existing DB unreadable.

## CI

`.github/workflows/build.yaml` builds and pushes
`ghcr.io/<owner>/presenter:latest` on push to `main`.
