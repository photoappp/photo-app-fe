import { Platform } from "react-native";
import { TestIds } from "react-native-google-mobile-ads";

/* 2026.09.09 실제 광고 ID가 아직 미발급이라 릴리즈(APK/TestFlight) 빌드에서도 Google 테스트 광고가 나오도록 변경.
   실제 AdMob 광고 단위 ID 발급 후 __DEV__로 되돌리고 아래 placeholder를 교체할 것 by Claude */
/* 2026.11.25 테스트/실제 광고 선택을 하드코딩(true) 대신 EAS 빌드 프로필 환경변수로 결정.
   - 개발 빌드(__DEV__)는 항상 테스트 광고
   - 그 외 빌드는 EXPO_PUBLIC_USE_TEST_ADS가 "false"일 때만 실제 광고(값이 없으면 안전하게 테스트 광고)
   - 실제 ID가 비어 있거나 placeholder/Google 샘플 ID면 테스트 ID로 대체(잘못된 ID 요청 방지)
   최초 Apple/Google 검수는 테스트 광고, 이후 업데이트는 실제 ID를 채우고 production 프로필을 "false"로 변경 by yen */
const USE_TEST_ADS =
  __DEV__ || process.env.EXPO_PUBLIC_USE_TEST_ADS !== "false";

/* 2026.11.25 AdMob에서 발급받은 실제 광고 단위 ID를 여기에 입력(현재 미발급) by yen */
const REAL_AD_UNIT_IDS = {
  banner: Platform.select({ android: "", ios: "" }) ?? "",
  interstitial: Platform.select({ android: "", ios: "" }) ?? "",
  rewarded: Platform.select({ android: "", ios: "" }) ?? "",
};

/* 2026.11.25 실제 광고 단위 ID 형식(ca-app-pub-숫자/숫자)이고 Google 샘플 퍼블리셔가 아닐 때만 실제 ID로 인정 by yen */
const GOOGLE_SAMPLE_PUBLISHER = "ca-app-pub-3940256099942544";
const isRealAdUnitId = (id: string) =>
  /^ca-app-pub-\d+\/\d+$/.test(id) && !id.startsWith(GOOGLE_SAMPLE_PUBLISHER);

const pickAdUnitId = (testId: string, realId: string) =>
  !USE_TEST_ADS && isRealAdUnitId(realId) ? realId : testId;

export const AdUnitIds = {
  banner: pickAdUnitId(TestIds.BANNER, REAL_AD_UNIT_IDS.banner),
  interstitial: pickAdUnitId(
    TestIds.INTERSTITIAL,
    REAL_AD_UNIT_IDS.interstitial,
  ),
  rewarded: pickAdUnitId(TestIds.REWARDED, REAL_AD_UNIT_IDS.rewarded),
};
