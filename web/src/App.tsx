import { useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  api,
  formatExpiry,
  embedSnippet,
  maskToken,
  type Presentation,
  type Status,
} from "./api";
import { parseAnchors } from "./teleprompter";

function usePath(): string {
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => {
    const on = () => setPath(window.location.pathname);
    window.addEventListener("popstate", on);
    return () => window.removeEventListener("popstate", on);
  }, []);
  return path;
}

function navigate(to: string): void {
  if (to === window.location.pathname) return;
  window.history.pushState({}, "", to);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function App() {
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const path = usePath();

  useEffect(() => {
    api.me()
      .then((r) => setEmail(r.email))
      .catch(() => setEmail(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="center">Loading…</p>;
  if (!email) return <Login />;

  const match = path.match(/^\/presentations\/([^/]+)$/);

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand" onClick={() => navigate("/presentations")} style={{ cursor: "pointer" }}>
          Presenter
        </div>
        <nav>
          <button
            className={path.startsWith("/presentations") || path === "/" ? "active" : ""}
            onClick={() => navigate("/presentations")}
          >
            Presentations
          </button>
        </nav>
        <div className="sidebar-footer">
          <span className="email" title={email}>{email}</span>
          <button className="link" onClick={async () => { await api.logout(); location.reload(); }}>
            Sign out
          </button>
        </div>
      </aside>
      <main className="content">
        {match ? <Control id={match[1]} /> : <Presentations />}
      </main>
    </div>
  );
}

function Login() {
  const [methods, setMethods] = useState<{ password: boolean; google: boolean }>({
    password: false, google: true,
  });
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/auth/methods").then((r) => r.json()).then(setMethods).catch(() => {});
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    const r = await fetch("/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ password }),
    });
    if (r.ok) location.reload();
    else setError("Invalid password");
  }

  return (
    <div className="login">
      <div className="card login-card">
        <div className="brand">Presenter</div>
        <p className="muted">Sign in to the admin</p>
        {methods.password && (
          <form onSubmit={submit} className="login-form">
            <input
              type="password"
              placeholder="Admin password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />
            <button className="btn primary" type="submit">Sign in</button>
            {error && <div className="error">{error}</div>}
          </form>
        )}
        {methods.google && (
          <a className="btn" href="/auth/google">Sign in with Google</a>
        )}
        {!methods.password && !methods.google && (
          <p className="error">
            No login method is enabled. Start the server with
            <code> --login-password</code> or set <code>GOOGLE_CLIENT_ID</code>.
          </p>
        )}
      </div>
    </div>
  );
}

function Secret({ value }: { value: string }) {
  const [show, setShow] = useState(false);
  return (
    <span className="secret">
      <code>{show ? value : maskToken(value)}</code>
      <button className="icon" onClick={() => setShow((s) => !s)} title={show ? "Hide" : "Reveal"}>
        {show ? "hide" : "show"}
      </button>
      <button className="icon" onClick={() => navigator.clipboard.writeText(value)} title="Copy">
        copy
      </button>
    </span>
  );
}

function parseTtl(v: string): number | undefined {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function PageHeader({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        <p className="muted">{description}</p>
      </div>
      {action}
    </div>
  );
}

function Presentations() {
  const [rows, setRows] = useState<Presentation[]>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [keyphrase, setKeyphrase] = useState("");
  const [ttl, setTtl] = useState("");
  const load = () => api.presentations().then(setRows).catch(() => setRows([]));
  useEffect(() => { load(); }, []);

  return (
    <section>
      <PageHeader
        title="Presentations"
        description="Each presentation has a keyphrase and a token to embed in your slide deck."
        action={<button className="btn primary" onClick={() => setOpen((o) => !o)}>+ Create presentation</button>}
      />
      {open && (
        <form
          className="card create-form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!name || !keyphrase) return;
            await api.createPresentation(name, keyphrase, parseTtl(ttl));
            setName(""); setKeyphrase(""); setTtl(""); setOpen(false); load();
          }}
        >
          <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          <input placeholder="Keyphrase" value={keyphrase} onChange={(e) => setKeyphrase(e.target.value)} />
          <input placeholder="TTL seconds (optional)" value={ttl} onChange={(e) => setTtl(e.target.value)} />
          <button className="btn primary" type="submit">Create</button>
        </form>
      )}
      <div className="card">
        <table>
          <thead>
            <tr><th>Name</th><th>Keyphrase</th><th>Token</th><th>Current slide</th><th>Created</th><th></th></tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={6} className="empty">No presentations yet.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} className="row-link" onClick={() => navigate(`/presentations/${r.id}`)}>
                <td className="strong">{r.name}</td>
                <td className="mono">{r.keyphrase}</td>
                <td onClick={(e) => e.stopPropagation()}><Secret value={r.token} /></td>
                <td>{r.current_slide ?? "—"}</td>
                <td className="muted">{new Date(r.created_at).toLocaleString()}</td>
                <td className="actions" onClick={(e) => e.stopPropagation()}>
                  <button className="link" onClick={() => navigate(`/presentations/${r.id}`)}>Open</button>
                  <button className="link" onClick={async () => {
                    const v = prompt("Renew TTL seconds:", "86400");
                    const t = v && parseTtl(v);
                    if (t) { await api.renewPresentation(r.id, t); load(); }
                  }}>Renew</button>
                  <button className="link danger" onClick={async () => {
                    if (confirm(`Delete ${r.name}?`)) { await api.deletePresentation(r.id); load(); }
                  }}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Control({ id }: { id: string }) {
  const [p, setP] = useState<Presentation | null | undefined>(undefined);
  const [script, setScript] = useState("");
  const [status, setStatus] = useState<Status>({ peers: 0, current: null });
  const [goto, setGoto] = useState("");

  useEffect(() => {
    api.presentations().then((rows) => {
      const found = rows.find((r) => r.id === id) ?? null;
      setP(found);
      setScript(found?.script ?? "");
    }).catch(() => setP(null));
  }, [id]);

  useEffect(() => {
    let alive = true;
    const poll = () => api.status(id).then((s) => { if (alive) setStatus(s); }).catch(() => {});
    poll();
    const t = setInterval(poll, 2000);
    return () => { alive = false; clearInterval(t); };
  }, [id]);

  if (p === undefined) return <p className="center">Loading…</p>;
  if (p === null) {
    return (
      <section>
        <button className="link back" onClick={() => navigate("/presentations")}>← Presentations</button>
        <PageHeader title="Not found" description="This presentation no longer exists." />
      </section>
    );
  }

  const snippet = embedSnippet(window.location.origin, p.token);
  const connected = status.peers > 0;

  return (
    <section>
      <button className="link back" onClick={() => navigate("/presentations")}>← Presentations</button>
      <PageHeader
        title={p.name}
        description=""
      />
      <p className="muted status-line">
        <span className={`dot ${connected ? "on" : "off"}`} />
        {connected ? `${status.peers} connected` : "No decks connected"}
        {" · "}Current slide: <b>{status.current ?? "—"}</b>
      </p>

      <div className="card control-card">
        <div className="controls">
          <button className="btn" onClick={() => api.cmd(p.id, "prev")}>← Prev</button>
          <button className="btn" onClick={() => api.cmd(p.id, "next")}>Next →</button>
          <input placeholder="slide key" value={goto} onChange={(e) => setGoto(e.target.value)} />
          <button className="btn" onClick={() => { if (goto) api.cmd(p.id, "goto", goto); }}>Go to</button>
        </div>
      </div>

      <div className="card script-card">
        <h3>Teleprompter script</h3>
        <p className="muted">Use one anchor per line: <code>[[slide:intro]]</code></p>
        <textarea value={script} onChange={(e) => setScript(e.target.value)} rows={10} placeholder="[[slide:intro]]\nWelcome" />
        <div className="script-actions">
          <span className="muted">{parseAnchors(script).length} anchors</span>
          <button className="btn" onClick={async () => { const updated = await api.updateScript(p.id, script); setP(updated); }}>Save script</button>
        </div>
      </div>


      <p className="muted">Paste this before <code>&lt;/body&gt;</code>. On open it prompts for the keyphrase <b>{p.keyphrase}</b>.</p>
      <pre>{snippet}</pre>
      <button className="btn" onClick={() => navigator.clipboard.writeText(snippet)}>Copy snippet</button>
    </section>
  );
}
