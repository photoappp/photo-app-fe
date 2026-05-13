import { Platform } from "react-native";
import { TestIds } from "react-native-google-mobile-ads";

const USE_TEST_ADS = __DEV__;

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

