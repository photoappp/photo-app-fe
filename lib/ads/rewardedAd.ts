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
/* 2026.10.19 ERROR/OPENED를 구독하지 않아, 광고 로드/노출 실패 시 아무 콜백도 오지 않고
   버튼이 영구 로딩 상태로 멈추는 문제가 있었음(시뮬레이터/네트워크 불안정에서 재현) by Claude */
let errorUnsub: (() => void) | null = null;
let openedUnsub: (() => void) | null = null;

/* 2026.06.23 보상형 광고를 리워드 게이트에서 재사용하기 위해 보상 획득 여부(earned)를 닫힘 콜백으로 함께 전달하도록 확장 by yen */
type RewardedAdHandlers = {
  onRewardEarned: () => void;
  /** 광고가 닫힐 때 호출. earned=true면 보상을 받고 닫힌 경우, false면 보상 없이 닫은 경우 */
  onClosed?: (earned: boolean) => void;
  /** 2026.10.19 로드/노출 실패 — 호출부가 대기 상태를 풀고 사용자를 막지 않도록 by Claude */
  onError?: (message: string) => void;
  /** 2026.10.19 광고가 실제로 화면에 뜬 시점 — 호출부의 노출 타임아웃 해제용 by Claude */
  onOpened?: () => void;
};

export function loadRewardedAd(handlers: RewardedAdHandlers | (() => void)) {
  /* 2026.06.23 기존 호출부 호환을 위해 함수 하나만 넘기던 시그니처도 계속 허용 by yen */
  const normalized: RewardedAdHandlers =
    typeof handlers === "function" ? { onRewardEarned: handlers } : handlers;

  loadedUnsub?.();
  earnedUnsub?.();
  closedUnsub?.();
  errorUnsub?.();
  openedUnsub?.();

  let earnedThisShow = false;

  loadedUnsub = rewarded.addAdEventListener(RewardedAdEventType.LOADED, () => {
    rewardedLoaded = true;
  });

  earnedUnsub = rewarded.addAdEventListener(
    RewardedAdEventType.EARNED_REWARD,
    () => {
      earnedThisShow = true;
      normalized.onRewardEarned();
    },
  );

  openedUnsub = rewarded.addAdEventListener(AdEventType.OPENED, () => {
    normalized.onOpened?.();
  });

  errorUnsub = rewarded.addAdEventListener(AdEventType.ERROR, (error: any) => {
    const message =
      typeof error?.message === "string" ? error.message : "rewarded ad error";
    console.log("[RewardedAd] error:", message);
    rewardedLoaded = false;
    earnedThisShow = false;
    normalized.onError?.(message);
    /* 다음 기회를 위해 재로드하되, 실패가 반복돼도 즉시 재시도로 몰아치지 않도록 지연 */
    setTimeout(() => {
      try {
        rewarded.load();
      } catch {}
    }, 30000);
  });

  closedUnsub = rewarded.addAdEventListener(AdEventType.CLOSED, () => {
    const earned = earnedThisShow;
    earnedThisShow = false;
    rewardedLoaded = false;
    normalized.onClosed?.(earned);
    rewarded.load();
  });

  rewarded.load();

  return () => {
    loadedUnsub?.();
    earnedUnsub?.();
    closedUnsub?.();
    errorUnsub?.();
    openedUnsub?.();
    loadedUnsub = null;
    earnedUnsub = null;
    closedUnsub = null;
    errorUnsub = null;
    openedUnsub = null;
  };
}

export function isRewardedAdReady() {
  return rewardedLoaded;
}

/* 2026.06.23 광고가 준비됐는지 호출부에서 분기할 수 있도록 노출 성공 여부를 반환 by yen */
export function showRewardedAd(): boolean {
  if (rewardedLoaded) {
    rewarded.show();
    return true;
  }
  return false;
}
