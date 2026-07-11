import { expect, test } from "bun:test";
import { commandToActions } from "./commands";

test("next -> ArrowRight keydown", () => {
  const [a] = commandToActions("next");
  expect(a.type).toBe("keys");
  if (a.type !== "keys") throw new Error("wrong");
  expect(a.keys.map((k) => k.key)).toContain("ArrowRight");
});

test("prev -> ArrowLeft keydown", () => {
  const [a] = commandToActions("prev");
  if (a.type !== "keys") throw new Error("wrong");
  expect(a.keys.map((k) => k.key)).toContain("ArrowLeft");
});

test("goto -> hash + event intent", () => {
  const [a] = commandToActions("goto", "intro", "slide-2");
  expect(a.type).toBe("goto");
  if (a.type !== "goto") throw new Error("wrong");
  expect(a.hash).toBe("slide-2");
  expect(a.key).toBe("intro");
  expect(a.value).toBe("slide-2");
});

test("unknown -> no actions", () => {
  expect(commandToActions("nope")).toHaveLength(0);
});
