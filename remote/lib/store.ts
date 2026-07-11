import AsyncStorage from "@react-native-async-storage/async-storage";

export type Session = { baseUrl: string; token: string };
const KEY = "presenter.session";

export async function loadSession(): Promise<Session | null> {
  const raw = await AsyncStorage.getItem(KEY);
  return raw ? (JSON.parse(raw) as Session) : null;
}

export async function saveSession(s: Session): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(s));
}

export async function clearSession(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}
