import {
  RewardedAd,
  RewardedAdEventType,
  AdEventType,
} from "react-native-google-mobile-ads";
import { AppState, Platform } from "react-native";
import { AdUnitIds } from "@/lib/ads/adUnitIds";
/* 2026.11.25 동의(UMP) 확인 후에만 광고 로드 by yen */
import {
  getAdsConsentState,
  retryAdsInitialization,
  subscribeToAdsConsent,
  whenAdsReady,
} from "@/lib/ads/adsConsent";

let rewarded = RewardedAd.createForAdRequest(AdUnitIds.rewarded);
const RETRY_DELAYS_MS = [6000, 12000];
const AD_MAX_AGE_MS = 60 * 60 * 1000;
export type RewardedAdStatus = "preparing" | "ready" | "unavailable" | "retryable";

let rewardedLoaded = false;
let loadedAt = 0;
let rewardedShowing = false;
let attempts = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let expiryTimer: ReturnType<typeof setTimeout> | null = null;
let recoverable = false;
let invalidatedByPrivacy = false;
let resumeLoadOnActive = false;
/* 2026.11.04 로드 중복 호출 방지 — 사용자가 Watch Ad를 눌렀을 때 즉시 로드를 시작할 수 있도록 상태 추적 by yen */
let rewardedLoading = false;

/* 2026.11.25 광고 요청 불가(동의 거부 등)일 때 호출부(리워드 게이트)에 기존 실패 경로로 알리기 위한 콜백 by yen */
let reportStatus: RewardedAdHandlers["onStatus"] = undefined;
let reportError: ((message: string) => void) | null = null;
let activeSubscription = 0;
let currentHandlers: RewardedAdHandlers | null = null;

/* 2026.11.04 이미 로드됐거나 로드 중이면 다시 요청하지 않음 by yen */
/* 2026.11.25 동의 확인이 끝난 뒤에만 로드 — 광고 요청 불가면 로드하지 않고 오류로 알림 by yen */
function requestLoad() {
  if (!currentHandlers || rewardedLoaded || rewardedLoading || rewardedShowing || retryTimer ||
    attempts > RETRY_DELAYS_MS.length) return;
  const subscription = activeSubscription;
  rewardedLoading = true;
  reportStatus?.("preparing");
  void whenAdsReady().then((allowed) => {
    if (subscription !== activeSubscription) return;
    if (invalidatedByPrivacy) {
      rewardedLoading = false;
      reloadAfterPrivacyChange();
      return;
    }
    if (!allowed) {
      rewardedLoading = false;
      const consent = getAdsConsentState();
      recoverable = consent.initializationFailed;
      reportStatus?.(consent.privacyOptionsOpen ? "preparing" :
        recoverable ? "retryable" : "unavailable");
      return;
    }
    if (AppState.currentState !== "active") {
      rewardedLoading = false;
      resumeLoadOnActive = true;
      return;
    }
    resumeLoadOnActive = false;
    recoverable = false;
    attempts += 1;
    try {
      rewarded.load();
    } catch (error) {
      handleError(String(error));
    }
  });
}

function handleError(message: string) {
  if (!rewardedLoading && !rewardedShowing) return;
  const loadFailed = rewardedLoading;
  rewardedLoading = false;
  rewardedShowing = false;
  rewardedLoaded = false;
  if (expiryTimer) clearTimeout(expiryTimer);
  expiryTimer = null;
  console.log("[RewardedAd] error:", message);
  if (invalidatedByPrivacy) {
    reloadAfterPrivacyChange();
    return;
  }
  const retryDelay = loadFailed ? RETRY_DELAYS_MS[attempts - 1] : undefined;
  if (retryDelay !== undefined) {
    retryTimer = setTimeout(() => {
      retryTimer = null;
      requestLoad();
    }, retryDelay);
  } else {
    recoverable = true;
    reportStatus?.("retryable");
  }
  if (!loadFailed) reportError?.(message);
}
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
  onStatus?: (status: RewardedAdStatus) => void;
};

export function loadRewardedAd(handlers: RewardedAdHandlers) {
  currentHandlers = handlers;
  bindRewardedListeners(handlers);
  const unsubscribeConsent = subscribeToAdsConsent(() => {
    const consent = getAdsConsentState();
    if (consent.privacyOptionsOpen) {
      invalidatedByPrivacy = true;
      reportStatus?.("preparing");
    } else if (invalidatedByPrivacy && !rewardedLoading && !rewardedShowing) {
      reloadAfterPrivacyChange();
    }
  });
  const foreground = AppState.addEventListener("change", (state) => {
    if (state === "active" && resumeLoadOnActive) requestLoad();
  });
  requestLoad();

  return () => {
    unsubscribeConsent();
    foreground.remove();
    unbindRewardedListeners();
    currentHandlers = null;
    activeSubscription += 1;
    if (retryTimer) clearTimeout(retryTimer);
    if (expiryTimer) clearTimeout(expiryTimer);
    retryTimer = null;
    expiryTimer = null;
    rewardedLoading = false;
    rewardedShowing = false;
    rewardedLoaded = false;
    attempts = 0;
    recoverable = false;
    invalidatedByPrivacy = false;
    resumeLoadOnActive = false;
    reportStatus = undefined;
    reportError = null;
    // The SDK retains its own load flag while a request is outstanding.
    rewarded = RewardedAd.createForAdRequest(AdUnitIds.rewarded);
  };
}

function replaceRewardedAd() {
  if (expiryTimer) clearTimeout(expiryTimer);
  expiryTimer = null;
  rewardedLoaded = false;
  rewarded = RewardedAd.createForAdRequest(AdUnitIds.rewarded);
  if (currentHandlers) bindRewardedListeners(currentHandlers);
}

function reloadAfterPrivacyChange() {
  const consent = getAdsConsentState();
  if (consent.privacyOptionsOpen) return;
  invalidatedByPrivacy = false;
  replaceRewardedAd();
  if (consent.allowed !== true) {
    recoverable = consent.initializationFailed;
    reportStatus?.(recoverable ? "retryable" : "unavailable");
    return;
  }
  // Reuse an existing retry budget after privacy choices change.
  if (attempts > RETRY_DELAYS_MS.length) {
    recoverable = true;
    reportStatus?.("retryable");
  } else {
    requestLoad();
  }
}

function unbindRewardedListeners() {
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
}

function bindRewardedListeners(normalized: RewardedAdHandlers) {
  unbindRewardedListeners();
  let earnedThisShow = false;
  /* 2026.11.25 광고 요청 불가 시 기존 오류 콜백으로 전달 by yen */
  activeSubscription += 1;
  reportStatus = normalized.onStatus;
  reportError = normalized.onError ?? null;

  loadedUnsub = rewarded.addAdEventListener(RewardedAdEventType.LOADED, () => {
    if (!rewardedLoading) return;
    rewardedLoading = false;
    if (invalidatedByPrivacy) {
      reloadAfterPrivacyChange();
      return;
    }
    rewardedLoaded = true;
    loadedAt = Date.now();
    attempts = 0;
    /* 2026.11.04 로드 상태 갱신 + 호출부 알림 by yen */
    console.log("[RewardedAd] loaded");
    reportStatus?.("ready");
    expiryTimer = setTimeout(() => {
      expiryTimer = null;
      if (rewardedLoaded && !rewardedShowing) reportStatus?.("retryable");
    }, AD_MAX_AGE_MS);
  });

  earnedUnsub = rewarded.addAdEventListener(
    RewardedAdEventType.EARNED_REWARD,
    () => {
      if (!rewardedShowing || earnedThisShow) return;
      earnedThisShow = true;
      normalized.onRewardEarned();
    },
  );

  openedUnsub = rewarded.addAdEventListener(AdEventType.OPENED, () => {
    if (rewardedShowing) normalized.onOpened?.();
  });

  errorUnsub = rewarded.addAdEventListener(AdEventType.ERROR, (error) => {
    const message = error?.message ?? "rewarded ad error";
    earnedThisShow = false;
    handleError(message);
  });

  closedUnsub = rewarded.addAdEventListener(AdEventType.CLOSED, () => {
    if (!rewardedShowing) return;
    rewardedShowing = false;
    if (expiryTimer) clearTimeout(expiryTimer);
    expiryTimer = null;
    const earned = earnedThisShow;
    earnedThisShow = false;
    rewardedLoaded = false;
    normalized.onClosed?.(earned);
    /* 2026.11.04 중복 로드 방지 래퍼 사용 by yen */
    if (invalidatedByPrivacy) reloadAfterPrivacyChange();
    else requestLoad();
  });

}

export function isRewardedAdReady() {
  const consent = getAdsConsentState();
  return rewardedLoaded && !rewardedShowing && !invalidatedByPrivacy &&
    consent.allowed === true && Date.now() - loadedAt < AD_MAX_AGE_MS;
}

export function prepareExpiredRewardedAd() {
  if (!currentHandlers || !rewardedLoaded || rewardedShowing || invalidatedByPrivacy ||
      Date.now() - loadedAt < AD_MAX_AGE_MS) return;
  replaceRewardedAd();
  requestLoad();
}

export async function retryRewardedAd() {
  if (!currentHandlers || AppState.currentState !== "active" || rewardedLoading ||
      rewardedShowing || retryTimer || invalidatedByPrivacy) return;
  const consent = getAdsConsentState();
  if (rewardedLoaded) {
    prepareExpiredRewardedAd();
    return;
  }
  if (!recoverable || (!consent.allowed && !consent.initializationFailed)) return;
  recoverable = false;
  reportStatus?.("preparing");
  const subscription = activeSubscription;
  if (consent.initializationFailed && !(await retryAdsInitialization())) {
    if (subscription === activeSubscription) {
      recoverable = getAdsConsentState().initializationFailed;
      reportStatus?.(recoverable ? "retryable" : "unavailable");
    }
    return;
  }
  if (subscription !== activeSubscription) return;
  attempts = 0;
  replaceRewardedAd();
  requestLoad();
}

/* 2026.06.23 광고가 준비됐는지 호출부에서 분기할 수 있도록 노출 성공 여부를 반환 by yen */
export function showRewardedAd(): boolean {
  if (isRewardedAdReady()) {
    rewardedShowing = true;
    const ad = rewarded;
    try {
      void ad.show({ immersiveModeEnabled: Platform.OS === "android" })
        .catch((error) => {
          if (ad === rewarded && rewardedShowing) handleError(String(error));
        });
    } catch (error) {
      handleError(String(error));
      return false;
    }
    return true;
  }
  return false;
}
