import { Stack } from "expo-router";

export default function Layout() {
  return (
    <Stack screenOptions={{ headerStyle: { backgroundColor: "#18181b" }, headerTintColor: "#fff" }}>
      <Stack.Screen name="index" options={{ title: "Presenter Remote" }} />
      <Stack.Screen name="presentations" options={{ title: "Presentations" }} />
      <Stack.Screen name="control" options={{ title: "Control" }} />
    </Stack>
  );
}
