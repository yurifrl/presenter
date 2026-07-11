export type Presentation = { id: string; name: string; current_slide: string | null };
export type Cmd = "next" | "prev" | "goto";

function normalizeBase(url: string): string {
  const u = url.trim().replace(/\/+$/, "");
  return /^https?:\/\//.test(u) ? u : `http://${u}`;
}

export async function login(baseUrl: string, password: string): Promise<string> {
  const base = normalizeBase(baseUrl);
  const res = await fetch(`${base}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) throw new Error("Invalid password");
  const { session } = (await res.json()) as { session?: string };
  if (!session) throw new Error("Server did not return a session");
  return session;
}

export async function listPresentations(baseUrl: string, token: string): Promise<Presentation[]> {
  const res = await fetch(`${normalizeBase(baseUrl)}/api/presentations`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`list failed: ${res.status}`);
  return (await res.json()) as Presentation[];
}

export function wsUrl(baseUrl: string, token: string): string {
  return `${normalizeBase(baseUrl).replace(/^http/, "ws")}/ws?session=${encodeURIComponent(token)}`;
}

export { normalizeBase };
