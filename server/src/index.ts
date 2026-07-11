import { Hono } from "hono";
import { cors } from "hono/cors";
import { getCookie, setCookie } from "hono/cookie";
import { createBunWebSocket } from "hono/bun";
import { timingSafeEqual, randomBytes } from "node:crypto";
import { serveStatic } from "hono/bun";
import type { WSContext } from "hono/ws";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  openDb, createPresentation, presentationByToken,
  checkKeyphrase, setCurrentSlide, isExpired,
  type Presentation,
} from "./db";
import { makeSession, readSession } from "./session";

const env = process.env;
const PORT = Number(env.PORT ?? 7737);
const SESSION_SECRET = env.SESSION_SECRET ?? "dev-secret";
const ALLOWED = (env.ALLOWED_EMAILS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const ADMIN_EMAIL = env.ADMIN_EMAIL ?? "admin";
// Plug-and-play auth: if Google isn't configured, always enable an ephemeral
// password (fresh each boot, printed to logs) so there's a way in. The flag
// forces it on even when Google is configured.
let sessionPassword: string | null = null;
if (process.argv.includes("--login-password") || !env.GOOGLE_CLIENT_ID) {
  sessionPassword = randomBytes(9).toString("base64url");
}

function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a), bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

const db = openDb(env.DB_PATH ?? join(import.meta.dir, "../presenter.sqlite"), env.ENCRYPTION_KEY || SESSION_SECRET);

const peers = new Map<string, Set<WSContext>>();
function peerSet(id: string): Set<WSContext> {
  let s = peers.get(id);
  if (!s) peers.set(id, (s = new Set()));
  return s;
}
function broadcast(id: string, msg: unknown) {
  const data = JSON.stringify(msg);
  for (const ws of peers.get(id) ?? []) ws.send(data);
}

const { upgradeWebSocket, websocket } = createBunWebSocket();
const app = new Hono<{ Variables: { email: string } }>();

app.use("/api/*", cors({ origin: "http://localhost:5173", credentials: true }));
app.use("/auth/*", cors({ origin: "http://localhost:5173", credentials: true }));

// --- Auth (Google OAuth) ---
app.get("/auth/google", (c) => {
  if (!env.GOOGLE_CLIENT_ID) {
    return c.text(
      "Google OAuth is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI and ALLOWED_EMAILS in server/.env — see server/README.md.",
      500,
    );
  }
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", env.GOOGLE_CLIENT_ID ?? "");
  url.searchParams.set("redirect_uri", env.GOOGLE_REDIRECT_URI ?? "");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  return c.redirect(url.toString());
});

app.get("/auth/google/callback", async (c) => {
  const code = c.req.query("code");
  if (!code) return c.text("missing code", 400);
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID ?? "",
      client_secret: env.GOOGLE_CLIENT_SECRET ?? "",
      redirect_uri: env.GOOGLE_REDIRECT_URI ?? "",
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) return c.text("token exchange failed", 401);
  const { access_token } = (await tokenRes.json()) as { access_token: string };
  const infoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { authorization: `Bearer ${access_token}` },
  });
  const { email } = (await infoRes.json()) as { email?: string };
  if (!email || !ALLOWED.includes(email)) return c.text("unauthorized", 403);
  setCookie(c, "session", makeSession(email, SESSION_SECRET), {
    httpOnly: true, sameSite: "Lax", path: "/",
  });
  return c.redirect("/");
});

// Password login (alternative to Google; enabled only if ADMIN_PASSWORD is set).
app.get("/auth/methods", (c) =>
  c.json({ password: Boolean(sessionPassword), google: Boolean(env.GOOGLE_CLIENT_ID) }));

app.post("/auth/login", async (c) => {
  if (!sessionPassword) return c.json({ error: "password login disabled" }, 400);
  const { password } = await c.req.json().catch(() => ({ password: "" }));
  if (typeof password !== "string" || !constantTimeEqual(password, sessionPassword)) {
    return c.json({ error: "invalid password" }, 401);
  }
  setCookie(c, "session", makeSession(ADMIN_EMAIL, SESSION_SECRET), {
    httpOnly: true, sameSite: "Lax", path: "/",
  });
  // Also return the token so native apps (no cookie jar) can store it and send
  // it as `Authorization: Bearer <token>` / `?session=<token>`.
  return c.json({ ok: true, session: makeSession(ADMIN_EMAIL, SESSION_SECRET) });
});

app.post("/auth/logout", (c) => {
  setCookie(c, "session", "", { httpOnly: true, path: "/", maxAge: 0 });
  return c.json({ ok: true });
});

// --- requireAuth for /api admin routes (cookie or Bearer session token) ---
app.use("/api/*", async (c, next) => {
  const bearer = (c.req.header("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const email = readSession(getCookie(c, "session"), SESSION_SECRET) ?? readSession(bearer, SESSION_SECRET);
  if (!email) return c.json({ error: "unauthorized" }, 401);
  c.set("email", email);
  return next();
});

app.get("/api/me", (c) => c.json({ email: c.get("email") }));

// --- Presentations ---
app.get("/api/presentations", (c) =>
  c.json(db.query("SELECT * FROM presentations ORDER BY created_at DESC").all()));

app.post("/api/presentations", async (c) => {
  const { name, keyphrase, ttlSeconds } = await c.req.json();
  return c.json(createPresentation(db, name, keyphrase, ttlSeconds));
});

app.delete("/api/presentations/:id", (c) => {
  db.run("DELETE FROM presentations WHERE id = ?", [c.req.param("id")]);
  return c.json({ ok: true });
});

app.post("/api/presentations/:id/renew", async (c) => {
  const { ttlSeconds } = await c.req.json();
  const expires_at = Date.now() + ttlSeconds * 1000;
  db.run("UPDATE presentations SET expires_at = ? WHERE id = ?", [expires_at, c.req.param("id")]);
  return c.json(db.query("SELECT * FROM presentations WHERE id = ?").get(c.req.param("id")));
});

app.get("/api/presentations/:id/status", (c) => {
  const id = c.req.param("id");
  const p = db.query("SELECT current_slide FROM presentations WHERE id = ?").get(id) as
    { current_slide: string | null } | null;
  return c.json({ peers: peers.get(id)?.size ?? 0, current: p?.current_slide ?? null });
});

app.post("/api/presentations/:id/cmd", async (c) => {
  const id = c.req.param("id");
  const { cmd, key, value } = await c.req.json();
  if (cmd === "goto") setCurrentSlide(db, id, value ?? null);
  broadcast(id, { type: "cmd", cmd, key, value });
  return c.json({ ok: true });
});

// --- WebSocket: presentation token + keyphrase (decks), or a logged-in
// session (control apps join any presentation by id, no keyphrase). ---
app.get("/ws", upgradeWebSocket((c) => {
  const token = c.req.query("token") ?? "";
  const presByToken = token ? presentationByToken(db, token) : null;
  const authed = Boolean(
    readSession(getCookie(c, "session"), SESSION_SECRET) ||
    readSession(c.req.query("session") ?? "", SESSION_SECRET),
  );
  let joinedId: string | null = null;

  return {
    onOpen(_e, ws) {
      const tokenOk = presByToken && !isExpired(presByToken.expires_at);
      if (!tokenOk && !authed) {
        ws.send(JSON.stringify({ type: "error", message: "unauthorized" }));
        ws.close();
      }
    },
    onMessage(evt, ws) {
      let msg: any;
      try { msg = JSON.parse(String(evt.data)); } catch { return; }

      if (msg.type === "join") {
        let p: Presentation | null = null;
        if (presByToken) {
          // Untrusted deck: presentation token must be paired with the keyphrase.
          if (checkKeyphrase(presByToken, msg.keyphrase)) p = presByToken;
        } else if (authed) {
          // Logged-in control app: join by id, no keyphrase needed.
          p = db.query("SELECT * FROM presentations WHERE id = ?").get(msg.presentationId) as Presentation | null;
        }
        if (!p) {
          ws.send(JSON.stringify({ type: "error", message: "join rejected" }));
          ws.close();
          return;
        }
        joinedId = p.id;
        peerSet(p.id).add(ws);
        ws.send(JSON.stringify({ type: "joined", current: p.current_slide }));
        return;
      }

      if (msg.type === "cmd" && joinedId) {
        if (msg.cmd === "goto") setCurrentSlide(db, joinedId, msg.value ?? null);
        broadcast(joinedId, { type: "cmd", cmd: msg.cmd, key: msg.key, value: msg.value });
      }
    },
    onClose(_e, ws) {
      if (joinedId) peers.get(joinedId)?.delete(ws);
    },
  };
}));

// --- Static serving (guarded, resolved relative to this file, not cwd) ---
const playJs = join(import.meta.dir, "../../play/dist/play.js");
app.get("/play.js", (c) => (existsSync(playJs) ? new Response(Bun.file(playJs)) : c.notFound()));

const webDist = join(import.meta.dir, "../../web/dist");
if (existsSync(webDist)) {
  app.use("/*", serveStatic({ root: webDist }));
  app.get("/*", serveStatic({ path: "index.html", root: webDist }));
}

Bun.serve({ port: PORT, fetch: app.fetch, websocket });
console.log(`presenter server on :${PORT}`);
if (sessionPassword) {
  console.log(`\n  Admin login password (this session only): ${sessionPassword}\n`);
}
