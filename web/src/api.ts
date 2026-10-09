export type Presentation = {
  id: string;
  name: string;
  keyphrase: string;
  token: string;
  script: string;
  created_at: string;
};

export type Status = { peers: number; current: string | null };

export function formatExpiry(expires_at: string | null): string {
  if (expires_at === null) return "permanent";
  return new Date(expires_at).toLocaleString();
}

export function embedSnippet(origin: string, token: string): string {
  const ws = origin.replace(/^http/, "ws");
  return `<script src="${origin}/play.js" data-url="${ws}/ws" data-token="${token}"></script>`;
}

export function maskToken(token: string): string {
  return token.length <= 10 ? token : `${token.slice(0, 4)}\u2026${token.slice(-4)}`;
}

async function req<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${url} -> ${res.status}`);
  const text = await res.text();
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

export const api = {
  me: () => req<{ email: string }>("GET", "/api/me"),
  logout: () => req<void>("POST", "/auth/logout"),

  presentations: () => req<Presentation[]>("GET", "/api/presentations"),
  createPresentation: (name: string, keyphrase: string, ttlSeconds?: number) =>
    req<Presentation>("POST", "/api/presentations", { name, keyphrase, ttlSeconds }),
  renewPresentation: (id: string, ttlSeconds: number) =>
    req<void>("POST", `/api/presentations/${id}/renew`, { ttlSeconds }),
  deletePresentation: (id: string) =>
    req<void>("DELETE", `/api/presentations/${id}`),
  updateScript: (id: string, script: string) =>
    req<Presentation>("POST", `/api/presentations/${id}/script`, { script }),
  status: (id: string) =>
    req<Status>("GET", `/api/presentations/${id}/status`),
  cmd: (id: string, cmd: "next" | "prev" | "goto", value?: string) =>
    req<void>("POST", `/api/presentations/${id}/cmd`, { cmd, value }),
};
