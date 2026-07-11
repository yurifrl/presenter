import { expect, test } from "bun:test";
import { formatExpiry, embedSnippet, maskToken } from "./api";

test("formatExpiry null is permanent", () => {
  expect(formatExpiry(null)).toBe("permanent");
});

test("formatExpiry renders a date", () => {
  const s = "2026-07-10T12:00:00.000Z";
  expect(formatExpiry(s)).toBe(new Date(s).toLocaleString());
});

test("embedSnippet builds script tag with ws url", () => {
  expect(embedSnippet("https://ex.com", "abc")).toBe(
    '<script src="https://ex.com/play.js" data-url="wss://ex.com/ws" data-token="abc"></script>'
  );
});

test("embedSnippet uses ws for http origin", () => {
  expect(embedSnippet("http://localhost:3000", "t")).toBe(
    '<script src="http://localhost:3000/play.js" data-url="ws://localhost:3000/ws" data-token="t"></script>'
  );
});

test("maskToken shows first and last chars", () => {
  expect(maskToken("J3O9Fh5Bd3yngoYbD8E6vAfYJ7rjRDpw")).toBe("J3O9\u2026RDpw");
  expect(maskToken("short")).toBe("short");
});
