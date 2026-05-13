import {
  RewardedAd,
  RewardedAdEventType,
  AdEventType,
} from "react-native-google-mobile-ads";
import { AdUnitIds } from "@/lib/ads/adUnitIds";

const rewarded = RewardedAd.createForAdRequest(AdUnitIds.rewarded, {
  requestNonPersonalizedAdsOnly: true,
});

let rewardedLoaded = false;
let loadedUnsub: (() => void) | null = null;
let earnedUnsub: (() => void) | null = null;
let closedUnsub: (() => void) | null = null;

export function loadRewardedAd(onRewardEarned: () => void) {
  loadedUnsub?.();
  earnedUnsub?.();
  closedUnsub?.();

  loadedUnsub = rewarded.addAdEventListener(RewardedAdEventType.LOADED, () => {
    rewardedLoaded = true;
  });

  earnedUnsub = rewarded.addAdEventListener(
    RewardedAdEventType.EARNED_REWARD,
    () => {
      onRewardEarned();
    }
  );

  closedUnsub = rewarded.addAdEventListener(AdEventType.CLOSED, () => {
    rewardedLoaded = false;
    rewarded.load();
  });

  rewarded.load();

  return () => {
    loadedUnsub?.();
    earnedUnsub?.();
    closedUnsub?.();
    loadedUnsub = null;
    earnedUnsub = null;
    closedUnsub = null;
  };
}

export function showRewardedAd() {
  if (rewardedLoaded) {
    rewarded.show();
  }
}

