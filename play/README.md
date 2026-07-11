# @presenter/play

`play.js` is a tiny, framework-agnostic script that turns any HTML slide deck
into a remotely controllable presentation. It connects to a presenter server
over WebSocket and emulates a hardware clicker: incoming commands become
synthetic keyboard events, so reveal.js, impress.js, and plain-div decks all
respond with zero deck-specific wiring.

Sync is two-way. Local navigation (arrow/page/space keys, hash changes, or
`window.Presenter.*`) is forwarded to the server, which echoes it to every
connected deck — so an audience deck and a presenter-notes deck stay in step.
Local user nav is only *sent*; the server echo applies it everywhere via a
single code path, and a guard flag stops play.js's own synthetic events from
being re-forwarded (no loops).

## Embed

```html
<script src="https://host/play.js"
        data-url="wss://host/ws"
        data-token="PRESENTATION_TOKEN"></script>
```

- `data-url` — WebSocket URL of the presenter server.
- `data-token` — the presentation token (from the admin).

On load it prompts for the presentation keyphrase, then joins.

## Commands

- `next` → synthetic `ArrowRight` + `PageDown` keydown on `document`.
- `prev` → synthetic `ArrowLeft` + `PageUp`.
- `goto` → sets `location.hash` **and** dispatches a `presenter:goto`
  `CustomEvent` (detail `{ key, value }`). Listen for richer control:

```js
document.addEventListener("presenter:goto", (e) => console.log(e.detail));
```

`window.Presenter = { next, prev, goto }` is exposed for manual testing.

## Build

```sh
bun install
bun run build   # -> dist/play.js (self-contained IIFE)
bun test        # pure command-mapping tests
```
