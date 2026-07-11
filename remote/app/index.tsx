import { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { login } from "../lib/api";
import { loadSession, saveSession } from "../lib/store";

export default function Login() {
  const router = useRouter();
  const [baseUrl, setBaseUrl] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    loadSession().then((s) => {
      if (s) { setBaseUrl(s.baseUrl); router.replace("/presentations"); }
    }).finally(() => setChecking(false));
  }, []);

  async function submit() {
    setError(""); setBusy(true);
    try {
      const token = await login(baseUrl, password);
      await saveSession({ baseUrl, token });
      router.replace("/presentations");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  if (checking) return <View style={s.center}><ActivityIndicator /></View>;

  return (
    <View style={s.container}>
      <Text style={s.label}>Server URL</Text>
      <TextInput
        style={s.input}
        placeholder="https://your-host"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        value={baseUrl}
        onChangeText={setBaseUrl}
      />
      <Text style={s.label}>Admin password</Text>
      <TextInput
        style={s.input}
        placeholder="password"
        secureTextEntry
        autoCapitalize="none"
        value={password}
        onChangeText={setPassword}
      />
      {error ? <Text style={s.error}>{error}</Text> : null}
      <Pressable style={[s.btn, busy && s.btnDisabled]} onPress={submit} disabled={busy}>
        <Text style={s.btnText}>{busy ? "Signing in…" : "Sign in"}</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  container: { flex: 1, padding: 24, gap: 8, justifyContent: "center" },
  label: { fontSize: 13, color: "#71717a", marginTop: 8 },
  input: { borderWidth: 1, borderColor: "#d4d4d8", borderRadius: 10, padding: 12, fontSize: 16 },
  btn: { backgroundColor: "#4f46e5", padding: 14, borderRadius: 10, alignItems: "center", marginTop: 16 },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  error: { color: "#dc2626", marginTop: 4 },
});
