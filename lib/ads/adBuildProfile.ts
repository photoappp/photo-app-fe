import { Platform } from "react-native";

const isAndroidQaApk = Platform.OS === "android" &&
  process.env.EXPO_PUBLIC_PICQLY_QA_APK === "true" &&
  process.env.EXPO_PUBLIC_USE_TEST_ADS === "true";

export const useTestAdUnits = isAndroidQaApk ||
  __DEV__ || process.env.EXPO_PUBLIC_USE_TEST_ADS !== "false";

export const earnedAccessDurationMs = isAndroidQaApk ? 60_000 : 2 * 60 * 60 * 1000;

// QA must neither consume a production grant nor write one.
export const earnedAccessStorageKey = isAndroidQaApk
  ? "earnedLocationUnlockedUntil.androidQaApk"
  : "earnedLocationUnlockedUntil";
