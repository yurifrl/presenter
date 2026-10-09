import Database from "libsql";

export function genToken(bytes = 24): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Buffer.from(buf).toString("base64url");
}

export function isExpired(expires_at: number | null, now = Date.now()): boolean {
  return expires_at != null && expires_at <= now;
}

// Thin bun:sqlite-shaped adapter over libsql's better-sqlite3 API, so callers
// keep using db.query(sql).get/all and db.run(sql, [params]).
export class Db {
  constructor(public raw: Database.Database) {}
  exec(sql: string): void {
    this.raw.exec(sql);
  }
  run(sql: string, params: unknown[] = []): void {
    this.raw.prepare(sql).run(...(params as never[]));
  }
  query(sql: string) {
    const stmt = this.raw.prepare(sql);
    return {
      get: (...args: unknown[]) => stmt.get(...(args as never[])),
      all: (...args: unknown[]) => stmt.all(...(args as never[])),
    };
  }
}

// The whole DB file is encrypted at rest (libSQL/SQLCipher). The key comes from
// env, never stored beside the data. Changing the key makes an existing DB
// unreadable (expected).
export function openDb(path: string, encryptionKey?: string): Db {
  const opts = encryptionKey ? ({ encryptionKey } as unknown as Database.Options) : undefined;
  const db = new Db(new Database(path, opts));
  db.exec("PRAGMA journal_mode = WAL");
  db.run(`CREATE TABLE IF NOT EXISTS presentations (
    id TEXT PRIMARY KEY,
    name TEXT,
    keyphrase TEXT,
    token TEXT UNIQUE,
    current_slide TEXT,
    script TEXT NOT NULL DEFAULT '',
    expires_at INTEGER,
    created_at INTEGER
  )`);
  // Migrate databases created before teleprompter scripts were introduced.
  const columns = db.query("PRAGMA table_info(presentations)").all() as Array<{ name: string }>;
  if (!columns.some((column) => column.name === "script")) {
    db.exec("ALTER TABLE presentations ADD COLUMN script TEXT NOT NULL DEFAULT ''");
  }
  return db;
}

export type Presentation = {
  id: string;
  name: string;
  keyphrase: string;
  token: string;
  current_slide: string | null;
  script: string;
  expires_at: number | null;
  created_at: number;
};

export function createPresentation(db: Db, name: string, keyphrase: string, ttlSeconds?: number): Presentation {
  const row: Presentation = {
    id: crypto.randomUUID(),
    name,
    keyphrase,
    token: genToken(),
    current_slide: null,
    script: "",
    expires_at: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null,
    created_at: Date.now(),
  };
  db.run(
    "INSERT INTO presentations (id,name,keyphrase,token,current_slide,script,expires_at,created_at) VALUES (?,?,?,?,?,?,?,?)",
    [row.id, row.name, row.keyphrase, row.token, row.current_slide, row.script, row.expires_at, row.created_at],
  );
  return row;
}

export function presentationByToken(db: Db, token: string): Presentation | null {
  return (db.query("SELECT * FROM presentations WHERE token = ?").get(token) as Presentation) ?? null;
}

export function checkKeyphrase(p: Presentation | null, keyphrase: string): boolean {
  return !!p && p.keyphrase === keyphrase;
}

export function setCurrentSlide(db: Db, id: string, value: string | null): void {
  db.run("UPDATE presentations SET current_slide = ? WHERE id = ?", [value, id]);
}

export function updateScript(db: Db, id: string, script: string): void {
  db.run("UPDATE presentations SET script = ? WHERE id = ?", [script, id]);
}
