import {
  AdEventType,
  InterstitialAd,
} from "react-native-google-mobile-ads";
import { AdUnitIds } from "@/lib/ads/adUnitIds";

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

  interstitial.load();

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

