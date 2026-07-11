import { useEffect, useRef, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { wsUrl, type Cmd } from "../lib/api";
import { loadSession } from "../lib/store";

export default function Control() {
  const { id, name } = useLocalSearchParams<{ id: string; name: string }>();
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [current, setCurrent] = useState<string | null>(null);
  const [goto, setGoto] = useState("");

  useEffect(() => {
    let alive = true;
    let ws: WebSocket | null = null;
    (async () => {
      const sess = await loadSession();
      if (!sess || !alive) return;
      ws = new WebSocket(wsUrl(sess.baseUrl, sess.token));
      wsRef.current = ws;
      ws.onopen = () => ws?.send(JSON.stringify({ type: "join", presentationId: id }));
      ws.onmessage = (e) => {
        try {
          const m = JSON.parse(String(e.data));
          if (m.type === "joined") { setConnected(true); setCurrent(m.current ?? null); }
          if (m.type === "cmd" && m.cmd === "goto") setCurrent(m.value ?? null);
        } catch { /* ignore */ }
      };
      ws.onclose = () => { if (alive) setConnected(false); };
    })();
    return () => { alive = false; ws?.close(); };
  }, [id]);

  const send = (cmd: Cmd, value?: string) => {
    wsRef.current?.send(JSON.stringify({ type: "cmd", cmd, value }));
  };

  return (
    <View style={s.container}>
      <Text style={s.title}>{name}</Text>
      <Text style={s.status}>
        <Text style={{ color: connected ? "#22c55e" : "#a1a1aa" }}>●</Text>
        {connected ? " connected" : " connecting…"}  ·  slide: {current ?? "—"}
      </Text>

      <View style={s.navRow}>
        <Pressable style={[s.navBtn, s.prev]} onPress={() => send("prev")}><Text style={s.prevText}>‹ Prev</Text></Pressable>
        <Pressable style={[s.navBtn, s.next]} onPress={() => send("next")}><Text style={s.navText}>Next ›</Text></Pressable>
      </View>

      <View style={s.gotoRow}>
        <TextInput
          style={s.input}
          placeholder="slide key"
          autoCapitalize="none"
          value={goto}
          onChangeText={setGoto}
        />
        <Pressable style={s.gotoBtn} onPress={() => { if (goto) send("goto", goto); }}>
          <Text style={s.gotoText}>Go to</Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, padding: 20, gap: 16 },
  title: { fontSize: 22, fontWeight: "700" },
  status: { color: "#71717a" },
  navRow: { flexDirection: "row", gap: 12, flex: 1 },
  navBtn: { flex: 1, borderRadius: 14, justifyContent: "center", alignItems: "center" },
  prev: { backgroundColor: "#e4e4e7" },
  next: { backgroundColor: "#4f46e5" },
  navText: { fontSize: 24, fontWeight: "700", color: "#fff" },
  prevText: { fontSize: 24, fontWeight: "700", color: "#18181b" },
  gotoRow: { flexDirection: "row", gap: 8 },
  input: { flex: 1, borderWidth: 1, borderColor: "#d4d4d8", borderRadius: 10, padding: 12, fontSize: 16 },
  gotoBtn: { backgroundColor: "#18181b", paddingHorizontal: 18, justifyContent: "center", borderRadius: 10 },
  gotoText: { color: "#fff", fontWeight: "600" },
});
