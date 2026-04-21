import { Stack } from "expo-router";

export default function RootLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      {/* 2026-04-15: Settings 페이지 추가 by yen */}
      <Stack.Screen name="settings" />
    </Stack>
  );
}
