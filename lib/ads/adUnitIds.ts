import { Platform } from "react-native";
import { TestIds } from "react-native-google-mobile-ads";
import { useTestAdUnits } from "@/lib/ads/adBuildProfile";

const REAL_AD_UNIT_IDS = {
  banner: Platform.select({
    android: process.env.EXPO_PUBLIC_ADMOB_ANDROID_BANNER_ID,
    ios: process.env.EXPO_PUBLIC_ADMOB_IOS_BANNER_ID,
  }) ?? "",
  rewarded: Platform.select({
    android: process.env.EXPO_PUBLIC_ADMOB_ANDROID_REWARDED_ID,
    ios: process.env.EXPO_PUBLIC_ADMOB_IOS_REWARDED_ID,
  }) ?? "",
};

const GOOGLE_SAMPLE_PUBLISHER = "ca-app-pub-3940256099942544";
const isRealAdUnitId = (id: string) =>
  /^ca-app-pub-\d{16}\/\d{10}$/.test(id) && !id.startsWith(GOOGLE_SAMPLE_PUBLISHER);

export const hasAdUnitConfiguration = useTestAdUnits ||
  Object.values(REAL_AD_UNIT_IDS).every(isRealAdUnitId);

export const AdUnitIds = useTestAdUnits
  ? { banner: TestIds.BANNER, rewarded: TestIds.REWARDED }
  : REAL_AD_UNIT_IDS;
