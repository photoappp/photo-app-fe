import { Platform } from "react-native";
import { TestIds } from "react-native-google-mobile-ads";

/* 2026.09.09 실제 광고 ID가 아직 미발급이라 릴리즈(APK/TestFlight) 빌드에서도 Google 테스트 광고가 나오도록 변경.
   실제 AdMob 광고 단위 ID 발급 후 __DEV__로 되돌리고 아래 placeholder를 교체할 것 by Claude */
const USE_TEST_ADS = true;

export const AdUnitIds = {
  banner: USE_TEST_ADS
    ? TestIds.BANNER
    : Platform.select({
        android: "YOUR_REAL_ANDROID_BANNER_AD_UNIT_ID",
        ios: "YOUR_REAL_IOS_BANNER_AD_UNIT_ID",
      })!,

  interstitial: USE_TEST_ADS
    ? TestIds.INTERSTITIAL
    : Platform.select({
        android: "YOUR_REAL_ANDROID_INTERSTITIAL_AD_UNIT_ID",
        ios: "YOUR_REAL_IOS_INTERSTITIAL_AD_UNIT_ID",
      })!,

  rewarded: USE_TEST_ADS
    ? TestIds.REWARDED
    : Platform.select({
        android: "YOUR_REAL_ANDROID_REWARDED_AD_UNIT_ID",
        ios: "YOUR_REAL_IOS_REWARDED_AD_UNIT_ID",
      })!,
};

