/* 2026.11.25 광고 요청 전 동의(UMP) 확인 — Google은 EEA/영국/스위스 사용자에게 광고 요청 전 동의 메시지를 요구.
   앱 시작 시 한 번 동의를 받고(필요한 지역에서만 폼이 뜸) canRequestAds가 true일 때만 SDK 초기화/광고 로드.
   동의 정보를 받을 수 없으면(AdMob 동의 메시지 미설정, 샘플 App ID, 네트워크 오류 등) 기존처럼 비개인화 광고를 허용(fail-safe).
   동의 거부 등으로 광고를 못 띄울 때 리워드 게이트 동작은 별도 결정 예정 — 여기서는 광고 로드만 막음 by yen */
import { useEffect, useState } from "react";
import mobileAds, { AdsConsent } from "react-native-google-mobile-ads";

let readyPromise: Promise<boolean> | null = null;
/* null = 아직 확인 중 */
let adsAllowed: boolean | null = null;

export const initializeAdsWithConsent = (): Promise<boolean> => {
  if (readyPromise) return readyPromise;
  readyPromise = (async () => {
    let allowed = true;
    try {
      const info = await AdsConsent.gatherConsent();
      allowed = info.canRequestAds;
      console.log("[AdsConsent] gathered", {
        status: info.status,
        canRequestAds: info.canRequestAds,
      });
    } catch (error) {
      /* 동의 정보를 받을 수 없음 — 기존 동작(비개인화 광고)을 유지 */
      console.log(
        "[AdsConsent] consent unavailable, keeping non-personalized ads:",
        String(error),
      );
      allowed = true;
    }
    if (allowed) {
      try {
        await mobileAds().initialize();
      } catch (error) {
        console.log("[AdsConsent] mobile ads initialize failed:", String(error));
      }
    }
    adsAllowed = allowed;
    return allowed;
  })();
  return readyPromise;
};

/* 광고 로드 전에 호출 — 동의 확인이 끝날 때까지 기다린 뒤 광고 요청 가능 여부를 반환 */
export const whenAdsReady = () => initializeAdsWithConsent();

/* 컴포넌트용 — 확인 중이면 null, 끝나면 광고 요청 가능 여부 */
export const useAdsAllowed = () => {
  const [allowed, setAllowed] = useState<boolean | null>(adsAllowed);
  useEffect(() => {
    if (allowed !== null) return;
    let mounted = true;
    void whenAdsReady().then((value) => {
      if (mounted) setAllowed(value);
    });
    return () => {
      mounted = false;
    };
  }, [allowed]);
  return allowed;
};
