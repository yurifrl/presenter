import { test, expect } from "bun:test";
import { readFileSync, rmSync } from "node:fs";
import {
  openDb, createPresentation, presentationByToken,
  checkKeyphrase, setCurrentSlide, isExpired, genToken,
} from "./db";

test("genToken is url-safe and unique", () => {
  const a = genToken(), b = genToken();
  expect(a).not.toBe(b);
  expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
});

test("isExpired: null is permanent, past is expired", () => {
  const now = 1000;
  expect(isExpired(null, now)).toBe(false);
  expect(isExpired(now + 1, now)).toBe(false);
  expect(isExpired(now, now)).toBe(true);
  expect(isExpired(now - 1, now)).toBe(true);
});

test("keyphrase validation and goto updates current_slide", () => {
  const db = openDb(":memory:");
  const p = createPresentation(db, "Demo", "open sesame");
  expect(checkKeyphrase(p, "open sesame")).toBe(true);
  expect(checkKeyphrase(p, "wrong")).toBe(false);
  expect(checkKeyphrase(null, "open sesame")).toBe(false);

  setCurrentSlide(db, p.id, "intro");
  expect(presentationByToken(db, p.token)!.current_slide).toBe("intro");
});

test("encrypted DB: token/keyphrase are not plaintext on disk", () => {
  const path = `/tmp/presenter-enc-${crypto.randomUUID()}.db`;
  try {
    const db = openDb(path, "a-strong-key");
    const p = createPresentation(db, "Demo", "my-keyphrase");
    db.raw.close();
    const bytes = readFileSync(path);
    expect(bytes.includes(Buffer.from(p.token))).toBe(false);
    expect(bytes.includes(Buffer.from("my-keyphrase"))).toBe(false);
    // wrong key cannot open
    expect(() => openDb(path, "wrong-key").query("SELECT 1").get()).toThrow();
  } finally {
    rmSync(path, { force: true });
    rmSync(`${path}-wal`, { force: true });
    rmSync(`${path}-shm`, { force: true });
  }
});
