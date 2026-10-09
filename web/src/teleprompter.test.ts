import { expect, test } from "bun:test";
import { parseAnchors } from "./teleprompter";

test("parseAnchors reads slide anchors and line positions", () => {
  expect(parseAnchors("Intro\n[[slide:intro]]\n\n [[slide:demo-2]] ")).toEqual([
    { key: "intro", line: 1 },
    { key: "demo-2", line: 3 },
  ]);
});

test("parseAnchors ignores malformed or non-anchor lines", () => {
  expect(parseAnchors("[[slide:one two]]\n# Heading\n[[other:two]]")).toEqual([]);
});
