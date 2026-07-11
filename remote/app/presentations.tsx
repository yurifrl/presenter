import { useCallback, useState } from "react";
import { View, Text, FlatList, Pressable, StyleSheet, ActivityIndicator, RefreshControl } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { listPresentations, type Presentation } from "../lib/api";
import { loadSession, clearSession } from "../lib/store";

export default function Presentations() {
  const router = useRouter();
  const [rows, setRows] = useState<Presentation[] | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const sess = await loadSession();
    if (!sess) { router.replace("/"); return; }
    try {
      setRows(await listPresentations(sess.baseUrl, sess.token));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setRows([]);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function signOut() {
    await clearSession();
    router.replace("/");
  }

  if (rows === null) return <View style={s.center}><ActivityIndicator /></View>;

  return (
    <View style={s.container}>
      {error ? <Text style={s.error}>{error}</Text> : null}
      <FlatList
        data={rows}
        keyExtractor={(p) => p.id}
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}
        ListEmptyComponent={<Text style={s.empty}>No presentations.</Text>}
        renderItem={({ item }) => (
          <Pressable
            style={s.row}
            onPress={() => router.push({ pathname: "/control", params: { id: item.id, name: item.name } })}
          >
            <Text style={s.name}>{item.name}</Text>
            <Text style={s.sub}>{item.current_slide ? `on: ${item.current_slide}` : "—"}</Text>
          </Pressable>
        )}
      />
      <Pressable style={s.signout} onPress={signOut}><Text style={s.signoutText}>Sign out</Text></Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  container: { flex: 1 },
  row: { padding: 16, borderBottomWidth: 1, borderBottomColor: "#f0f0f0" },
  name: { fontSize: 16, fontWeight: "600" },
  sub: { color: "#71717a", marginTop: 2 },
  empty: { padding: 24, textAlign: "center", color: "#71717a" },
  error: { color: "#dc2626", padding: 12 },
  signout: { padding: 16, alignItems: "center" },
  signoutText: { color: "#4f46e5" },
});
