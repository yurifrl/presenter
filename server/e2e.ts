import { openDb, createPresentation } from "./src/db";

const db = openDb(process.env.DB_PATH ?? "./presenter.sqlite");
const p = createPresentation(db, "e2e", "secret", undefined) as any;

const url = `ws://localhost:${process.env.PORT ?? 7737}/ws?token=${encodeURIComponent(p.token)}`;

function client(name: string) {
  return new Promise<{ ws: WebSocket; got: any[] }>((resolve) => {
    const got: any[] = [];
    const ws = new WebSocket(url);
    ws.addEventListener("message", (e) => got.push(JSON.parse(String(e.data))));
    ws.addEventListener("open", () => {
      ws.send(JSON.stringify({ type: "join", keyphrase: "secret" }));
      setTimeout(() => resolve({ ws, got }), 150);
    });
  });
}

const a = await client("A");
const b = await client("B");

// A sends next -> both A and B should receive the cmd echo
a.ws.send(JSON.stringify({ type: "cmd", cmd: "next" }));
// B sends goto -> both receive, current_slide updates
await new Promise((r) => setTimeout(r, 100));
b.ws.send(JSON.stringify({ type: "cmd", cmd: "goto", value: "intro" }));
await new Promise((r) => setTimeout(r, 150));

const cmds = (arr: any[]) => arr.filter((m) => m.type === "cmd");
const aCmds = cmds(a.got), bCmds = cmds(b.got);

// bad keyphrase must be rejected
const bad = await new Promise<any>((resolve) => {
  const ws = new WebSocket(url);
  ws.addEventListener("open", () => ws.send(JSON.stringify({ type: "join", keyphrase: "wrong" })));
  ws.addEventListener("message", (e) => resolve(JSON.parse(String(e.data))));
});

const status = db.query("SELECT current_slide FROM presentations WHERE id = ?").get(p.id) as any;

console.log("A joined:", a.got.some((m) => m.type === "joined"));
console.log("B joined:", b.got.some((m) => m.type === "joined"));
console.log("A received next:", aCmds.some((m) => m.cmd === "next"));
console.log("B received next (from A):", bCmds.some((m) => m.cmd === "next"));
console.log("A received goto (from B):", aCmds.some((m) => m.cmd === "goto" && m.value === "intro"));
console.log("B received goto:", bCmds.some((m) => m.cmd === "goto" && m.value === "intro"));
console.log("current_slide persisted:", status?.current_slide);
console.log("bad keyphrase rejected:", bad.type === "error");

const ok = a.got.some((m) => m.type === "joined") && bCmds.some((m) => m.cmd === "next")
  && aCmds.some((m) => m.cmd === "goto") && status?.current_slide === "intro" && bad.type === "error";
console.log(ok ? "\nE2E PASS" : "\nE2E FAIL");
process.exit(ok ? 0 : 1);
