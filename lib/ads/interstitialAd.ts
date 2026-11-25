import {
  AdEventType,
  InterstitialAd,
} from "react-native-google-mobile-ads";
import { AdUnitIds } from "@/lib/ads/adUnitIds";
/* 2026.11.25 동의(UMP) 확인 후에만 광고 로드(다른 광고와 동일) by yen */
import { whenAdsReady } from "@/lib/ads/adsConsent";

const interstitial = InterstitialAd.createForAdRequest(AdUnitIds.interstitial, {
  requestNonPersonalizedAdsOnly: true,
});

let interstitialLoaded = false;
let loadedUnsub: (() => void) | null = null;
let closedUnsub: (() => void) | null = null;

export function loadInterstitialAd() {
  loadedUnsub?.();
  closedUnsub?.();

  loadedUnsub = interstitial.addAdEventListener(AdEventType.LOADED, () => {
    interstitialLoaded = true;
  });

  closedUnsub = interstitial.addAdEventListener(AdEventType.CLOSED, () => {
    interstitialLoaded = false;
    interstitial.load();
  });

  /* 2026.11.25 광고 요청 가능할 때만 로드 by yen */
  void whenAdsReady().then((allowed) => {
    if (allowed) interstitial.load();
  });

  return () => {
    loadedUnsub?.();
    closedUnsub?.();
    loadedUnsub = null;
    closedUnsub = null;
  };
}

export function showInterstitialAd() {
  if (interstitialLoaded) {
    interstitial.show();
  }
}

