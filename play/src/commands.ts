export type KeyDesc = { key: string; keyCode: number; code: string };

export type Action =
  | { type: "keys"; keys: KeyDesc[] }
  | { type: "goto"; hash: string; key?: string; value?: string };

const KEYS: Record<string, KeyDesc> = {
  ArrowRight: { key: "ArrowRight", keyCode: 39, code: "ArrowRight" },
  ArrowLeft: { key: "ArrowLeft", keyCode: 37, code: "ArrowLeft" },
  PageDown: { key: "PageDown", keyCode: 34, code: "PageDown" },
  PageUp: { key: "PageUp", keyCode: 33, code: "PageUp" },
};

// Pure: map a presenter command to the local actions that emulate a clicker.
export function commandToActions(
  cmd: string,
  key?: string,
  value?: string,
): Action[] {
  switch (cmd) {
    case "next":
      return [{ type: "keys", keys: [KEYS.ArrowRight, KEYS.PageDown] }];
    case "prev":
      return [{ type: "keys", keys: [KEYS.ArrowLeft, KEYS.PageUp] }];
    case "goto":
      return [{ type: "goto", hash: value ?? "", key, value }];
    default:
      return [];
  }
}
