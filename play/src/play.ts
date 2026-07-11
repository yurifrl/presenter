import { commandToActions } from "./commands";

type CmdMsg = { type: "cmd"; cmd: string; key?: string; value?: string };

function findScript(): HTMLScriptElement | null {
  if (document.currentScript instanceof HTMLScriptElement) {
    return document.currentScript;
  }
  const withToken = document.querySelectorAll<HTMLScriptElement>(
    "script[data-token]",
  );
  return withToken.length ? withToken[withToken.length - 1] : null;
}

function keyToCmd(key: string): "next" | "prev" | null {
  if (key === "ArrowRight" || key === "PageDown" || key === " ") return "next";
  if (key === "ArrowLeft" || key === "PageUp") return "prev";
  return null;
}

function main(): void {
  const script = findScript();
  const dataUrl = script?.dataset.url;
  const token = script?.dataset.token;

  let socket: WebSocket | null = null;

  // Guard: true while we synthesize local effects (keys/hash) from a server
  // echo. Capture listeners ignore events while applying, so a synthetic apply
  // never gets re-forwarded to the server (no infinite loop). Cleared on the
  // next tick so the async hashchange from a synthetic nav is also suppressed.
  let applying = false;

  function applyCommand(cmd: string, key?: string, value?: string): void {
    applying = true;
    try {
      for (const action of commandToActions(cmd, key, value)) {
        if (action.type === "keys") {
          for (const k of action.keys) {
            document.dispatchEvent(
              new KeyboardEvent("keydown", {
                key: k.key,
                code: k.code,
                keyCode: k.keyCode,
                which: k.keyCode,
                bubbles: true,
                cancelable: true,
              } as KeyboardEventInit),
            );
          }
        } else {
          if (action.hash) location.hash = action.hash;
          document.dispatchEvent(
            new CustomEvent("presenter:goto", {
              detail: { key: action.key, value: action.value },
            }),
          );
        }
      }
    } finally {
      setTimeout(() => {
        applying = false;
      }, 0);
    }
  }

  function send(msg: CmdMsg): void {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(msg));
    }
  }

  // Local user navigation -> send only; the server echo drives applyCommand on
  // every deck (including this one), so all peers stay in sync via one path.
  document.addEventListener(
    "keydown",
    (e) => {
      if (applying) return; // synthetic: let the deck handle it, do not forward
      const cmd = keyToCmd(e.key);
      if (!cmd) return;
      e.preventDefault();
      e.stopImmediatePropagation(); // suppress native nav; echo drives all decks
      send({ type: "cmd", cmd });
    },
    true,
  );

  addEventListener("hashchange", () => {
    if (applying) return; // our own goto (or a synthetic-nav side effect)
    send({ type: "cmd", cmd: "goto", value: location.hash.slice(1) });
  });

  const Presenter = {
    next: () => send({ type: "cmd", cmd: "next" }),
    prev: () => send({ type: "cmd", cmd: "prev" }),
    goto: (value: string, key?: string) =>
      send({ type: "cmd", cmd: "goto", key, value }),
  };
  (window as unknown as { Presenter: typeof Presenter }).Presenter = Presenter;

  if (!dataUrl || !token) {
    console.warn("[play] missing data-url or data-token; not connecting");
    return;
  }

  const keyphrase = window.prompt("Keyphrase for this presentation:") ?? "";
  const wsUrl = `${dataUrl}?token=${encodeURIComponent(token)}`;

  let backoff = 500;
  const maxBackoff = 15000;

  const connect = (): void => {
    const ws = new WebSocket(wsUrl);
    socket = ws;

    ws.addEventListener("open", () => {
      backoff = 500;
      ws.send(JSON.stringify({ type: "join", keyphrase }));
    });

    ws.addEventListener("message", (ev: MessageEvent) => {
      let msg: {
        type?: string;
        current?: string;
        message?: string;
        cmd?: string;
        key?: string;
        value?: string;
      };
      try {
        msg = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      switch (msg.type) {
        case "joined":
          if (msg.current) applyCommand("goto", undefined, msg.current);
          break;
        case "error":
          alert(msg.message ?? "presenter error");
          ws.close();
          break;
        case "cmd":
          if (msg.cmd) applyCommand(msg.cmd, msg.key, msg.value);
          break;
      }
    });

    ws.addEventListener("close", () => {
      setTimeout(connect, backoff);
      backoff = Math.min(backoff * 2, maxBackoff);
    });

    ws.addEventListener("error", () => ws.close());
  };

  connect();
}

main();
