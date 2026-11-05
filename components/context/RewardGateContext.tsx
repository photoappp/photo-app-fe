/* 2026.06.23 버튼별로 재사용 가능한 광고 리워드 게이트 by yen
   - 동작: 게이트가 걸린 버튼을 누르면
       1) 2시간 무료 해금이 살아있으면 그대로 통과
       2) 마지막 팝업 노출 후 2분이 안 지났으면(쿨다운) 다시 묻지 않고 통과
       3) 그 외에는 리워드 팝업을 띄우고, 광고를 보면 2시간 해금 후 통과 / 닫으면 취소
   - 해금 시각(unlockedUntil)을 단일 진실원천으로 두어 기존 위치 검색 게이트와 통합 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState } from "react-native";
import React, {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import RewardPopup from "@/components/RewardPopup";
import {
  /* 2026.11.04 Watch Ad 시 즉시 로드 시작 by yen */
  ensureRewardedAdLoading,
  isRewardedAdReady,
  loadRewardedAd,
  showRewardedAd,
} from "@/lib/ads/rewardedAd";

/* 게이트를 추가하고 싶은 버튼 기능 키. 새 버튼은 여기에 키만 추가하면 됨 */
export type RewardFeatureKey =
  | "map"
  | "olderPhotos"
  | "placeSearch"
  | "slideshow";

/* 2026.06.23 광고 시청 후 모든 기능을 무료로 쓸 수 있는 해금 지속 시간 by yen
   - 배포(production) 시: UNLOCK_DURATION_PROD_MS (2시간)
   - 테스트 시: UNLOCK_DURATION_TEST_MS (2분)
   배포할 때 아래 USE_TEST_UNLOCK_DURATION 값을 false 로만 바꾸면 됩니다. */
const UNLOCK_DURATION_TEST_MS = 2 * 60 * 1000; // 2분 (테스트용)
const UNLOCK_DURATION_PROD_MS = 2 * 60 * 60 * 1000; // 2시간 (배포용)
const USE_TEST_UNLOCK_DURATION = false; // 2026.10.04 해금 2시간(배포값)으로 전환 by Claude
const UNLOCK_DURATION_MS = USE_TEST_UNLOCK_DURATION
  ? UNLOCK_DURATION_TEST_MS
  : UNLOCK_DURATION_PROD_MS;

/* 2026.06.23 기존 위치 해금 키를 그대로 재사용해 별도 마이그레이션 없이 해금 상태를 통합 by yen */
const UNLOCK_STORAGE_KEY = "locationFeatureUnlockedUntil";
/* 2026.10.19 show() 호출 후 광고가 실제로 뜨기까지의 상한 — 이 안에 OPENED가 오지 않으면
   실패로 간주하고 사용자를 막지 않는다(버튼 영구 로딩 방지) by Claude */
const AD_PRESENT_TIMEOUT_MS = 8000;
/* 2026.11.04 Watch Ad를 눌렀는데 광고가 아직 로드 전이면 최대 이 시간까지 로드를 기다린 뒤 해금 by yen */
const AD_LOAD_WAIT_MS = 5000;
/* 2026.11.04 백그라운드 로드가 연속으로 이 횟수만큼 실패하면 조용히 2시간 해금 by yen */
const MAX_BACKGROUND_LOAD_FAILURES = 3;
/* 2026.11.04 다른 시트(날짜 등)가 닫히는 애니메이션과 팝업 Modal 표시가 겹치지 않도록 여는 지연 by yen */
const POPUP_OPEN_DELAY_MS = 350;
/* 2026.10.11 광고 Activity가 닫힌 뒤 앱이 active가 되고 나서 후속 UI를 띄우기까지의 여유 by Claude */
const AFTER_AD_SETTLE_MS = 450;

interface RewardGateContextType {
  /** 현재 모든 기능이 해금된 상태인지 */
  isUnlocked: boolean;
  /** 해금 만료 시각(ms). 0이면 해금 없음 */
  unlockedUntil: number;
  /**
   * 게이트가 걸린 기능 실행을 요청.
   * - true  : 바로 실행해도 됨(해금 중이거나 쿨다운 중)
   * - false : 팝업을 띄웠고 사용자가 닫음(실행 취소)
   * 광고를 본 경우 해금 후 true로 resolve 됩니다.
   */
  requestAccess: (feature: RewardFeatureKey) => Promise<boolean>;
  /** 광고 없이 직접 2시간 해금을 부여(테스트/대체 경로용) */
  grantUnlock: () => Promise<void>;
  /* 2026.06.23 다른 Modal(장소 메뉴 등) 내부에서 팝업을 직접 렌더하기 위한 상태/콜백 노출 by yen */
  popupVisible: boolean;
  activeFeature: RewardFeatureKey | null;
  adLoading: boolean;
  /* 2026.11.04 전면 광고가 떠 있는(뜨는 중/닫히는 중 포함) 동안 true — 열려 있는 RN Modal은 이 동안 숨겨야
     Android에서 광고 복귀 후 터치 먹통이 생기지 않는다 by yen */
  adShowing: boolean;
  watchAd: () => void;
  closePopup: () => void;
}

const RewardGateContext = createContext<RewardGateContextType | undefined>(
  undefined,
);

/* 2026.11.04 광고 Activity가 완전히 닫히고 앱이 active로 돌아온 뒤 여유를 두고 실행 — 보상/미보상 경로 공통 by yen */
const runAfterAdDismissed = (callback: () => void) => {
  let settled = false;
  const settle = () => {
    if (settled) return;
    settled = true;
    callback();
  };
  if (AppState.currentState === "active") {
    setTimeout(settle, AFTER_AD_SETTLE_MS);
    return;
  }
  const subscription = AppState.addEventListener("change", (state) => {
    if (state !== "active") return;
    subscription.remove();
    setTimeout(settle, AFTER_AD_SETTLE_MS);
  });
  /* 이벤트 유실 대비 안전망 */
  setTimeout(() => {
    subscription.remove();
    settle();
  }, 5000);
};

export function RewardGateProvider({ children }: { children: ReactNode }) {
  const [unlockedUntil, setUnlockedUntil] = useState(0);
  /* 2026.11.04 광고 이벤트 콜백(마운트 시 1회 등록)에서 최신 해금 상태를 읽기 위한 ref by yen */
  const unlockedUntilRef = useRef(0);
  const [popupVisible, setPopupVisible] = useState(false);
  const [activeFeature, setActiveFeature] = useState<RewardFeatureKey | null>(
    null,
  );
  const [adLoading, setAdLoading] = useState(false);
  /* 2026.11.04 전면 광고 표시 구간 by yen */
  const [adShowing, setAdShowing] = useState(false);
  /* 2026.10.19 광고 노출 감시 타이머 by Claude */
  const adPresentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /* 2026.11.04 팝업 지연 표시 타이머 by yen */
  const popupOpenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /* 2026.11.04 Watch Ad 후 로드 대기 중인지 + 대기 취소용 토큰 by yen */
  const waitingForLoadRef = useRef(false);
  const loadWaitTokenRef = useRef(0);
  /* 2026.11.04 사용자가 기다리지 않는 백그라운드 로드의 연속 실패 횟수 by yen */
  const backgroundLoadFailuresRef = useRef(0);

  const pendingResolverRef = useRef<((granted: boolean) => void) | null>(null);
  const adInFlightRef = useRef(false);

  useEffect(() => {
    unlockedUntilRef.current = unlockedUntil;
  }, [unlockedUntil]);

  /* 저장된 해금 상태 로드 */
  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const storedUnlock = await AsyncStorage.getItem(UNLOCK_STORAGE_KEY);
        if (!mounted) return;
        if (storedUnlock) {
          const parsed = Number(JSON.parse(storedUnlock));
          if (Number.isFinite(parsed) && parsed > Date.now()) {
            setUnlockedUntil(parsed);
          }
        }
      } catch (error) {
        console.log("reward gate load error:", error);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const clearAdPresentTimer = () => {
    if (adPresentTimerRef.current) {
      clearTimeout(adPresentTimerRef.current);
      adPresentTimerRef.current = null;
    }
  };

  /* 보상형 광고 미리 로드 + 보상/닫힘 이벤트 라우팅 */
  useEffect(() => {
    const teardown = loadRewardedAd({
      onRewardEarned: () => {
        console.log("[RewardGate] reward earned");
        void grantUnlock();
      },
      /* 2026.11.04 로드 성공 시 연속 실패 횟수 초기화 by yen */
      onLoaded: () => {
        backgroundLoadFailuresRef.current = 0;
      },
      onOpened: () => {
        /* 광고가 실제로 떴으므로 노출 감시 타이머 해제 — 이후에는 CLOSED/ERROR를 기다린다 */
        console.log("[RewardGate] ad opened");
        clearAdPresentTimer();
      },
      onError: (message) => {
        /* 2026.11.04 실패 원인별 처리 — 이전에는 백그라운드 로드 실패에도 무조건 해금해서
           광고가 뜰 기회 없이 계속 해금되던 문제(iOS 시뮬레이터에서 광고가 안 보임) by yen */
        if (adInFlightRef.current && !waitingForLoadRef.current) {
          /* 광고를 띄우는 도중 실패 — 사용자를 막지 않도록 해금 */
          console.log("[RewardGate] ad failed while showing — unlocking", message);
          clearAdPresentTimer();
          adInFlightRef.current = false;
          setAdLoading(false);
          setAdShowing(false);
          void grantUnlock();
          finishPending(true);
          return;
        }
        if (waitingForLoadRef.current) {
          /* Watch Ad를 누르고 로드를 기다리던 중 실패 — 광고를 볼 수 없으므로 해금 */
          console.log("[RewardGate] ad failed to load while user waiting — unlocking", message);
          cancelLoadWait();
          void grantUnlock();
          finishPending(true);
          return;
        }
        /* 백그라운드 로드 실패 — 연속 횟수만 세고, 한도에 도달하면 조용히 해금 */
        backgroundLoadFailuresRef.current += 1;
        console.log("[RewardGate] background load failed", {
          failures: backgroundLoadFailuresRef.current,
          message,
        });
        if (
          backgroundLoadFailuresRef.current >= MAX_BACKGROUND_LOAD_FAILURES &&
          !(unlockedUntilRef.current > Date.now())
        ) {
          console.log("[RewardGate] ad unavailable — quietly unlocking for 2 hours");
          backgroundLoadFailuresRef.current = 0;
          void grantUnlock();
        }
      },
      onClosed: (earned) => {
        console.log("[RewardGate] ad closed", { earned });
        clearAdPresentTimer();
        adInFlightRef.current = false;
        setAdLoading(false);
        /* 2026.10.11 광고 Activity가 닫히는 도중(CLOSED 직후) 다음 Modal을 열면 Android에서
           Modal 재부착과 충돌해 터치 먹통/크래시 발생 — 앱이 다시 active 상태가 된 뒤
           여유를 두고 continuation을 실행하도록 변경 by Claude
           2026.11.04 보상 없이 닫은 경우(팝업 재표시)에도 같은 대기를 적용 by yen */
        runAfterAdDismissed(() => {
          setAdShowing(false);
          if (earned) {
            finishPending(true);
          } else {
            /* 2026.10.11 광고 노출 전에 팝업을 미리 닫으므로, 보상 없이 닫은 경우
               재시도/닫기를 고를 수 있게 팝업을 다시 띄움 by Claude */
            setPopupVisible(true);
          }
        });
      },
    });
    return teardown;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* 해금이 만료되는 시점에 자동으로 상태를 내려 다음 요청에서 다시 게이트가 걸리도록 함 */
  useEffect(() => {
    if (unlockedUntil <= 0) return;
    const remaining = unlockedUntil - Date.now();
    if (remaining <= 0) {
      setUnlockedUntil(0);
      void AsyncStorage.removeItem(UNLOCK_STORAGE_KEY).catch(() => {});
      return;
    }
    const timer = setTimeout(() => setUnlockedUntil(0), remaining);
    return () => clearTimeout(timer);
  }, [unlockedUntil]);

  const finishPending = useCallback((granted: boolean) => {
    const resolve = pendingResolverRef.current;
    pendingResolverRef.current = null;
    /* 2026.11.04 아직 열리지 않은 팝업 지연 표시도 취소 by yen */
    if (popupOpenTimerRef.current) {
      clearTimeout(popupOpenTimerRef.current);
      popupOpenTimerRef.current = null;
    }
    setPopupVisible(false);
    setActiveFeature(null);
    if (!resolve) return;
    /* 2026.06.23 iOS에서 팝업 Modal이 닫히는 도중 후속 동작이 다른 Modal(지도/검색/메뉴)을
       바로 present/dismiss 하면 화면이 멈추는 문제가 있어, 닫힘 애니메이션이 끝난 뒤 실행 by yen */
    setTimeout(() => resolve(granted), 400);
  }, []);

  const grantUnlock = useCallback(async () => {
    const until = Date.now() + UNLOCK_DURATION_MS;
    /* 2026.11.04 이벤트 콜백에서도 즉시 반영되도록 ref 동기 갱신 by yen */
    unlockedUntilRef.current = until;
    setUnlockedUntil(until);
    try {
      await AsyncStorage.setItem(UNLOCK_STORAGE_KEY, JSON.stringify(until));
    } catch (error) {
      console.log("reward gate unlock persist error:", error);
    }
  }, []);

  /* 2026.11.04 Watch Ad 후 로드 대기를 중단(닫기/실패/성공 공통) by yen */
  const cancelLoadWait = () => {
    loadWaitTokenRef.current += 1;
    waitingForLoadRef.current = false;
    adInFlightRef.current = false;
    setAdLoading(false);
  };

  const requestAccess = useCallback(
    (feature: RewardFeatureKey) => {
      // 해금 중이면 통과, 아니면 팝업 노출
      if (unlockedUntil > Date.now()) return Promise.resolve(true);

      // 이전에 대기 중이던 요청이 있으면 취소 처리
      pendingResolverRef.current?.(false);
      setActiveFeature(feature);
      /* 2026.11.04 다른 시트가 닫히는 중일 수 있으므로 팝업 Modal은 잠시 뒤에 띄움 by yen */
      if (popupOpenTimerRef.current) clearTimeout(popupOpenTimerRef.current);
      popupOpenTimerRef.current = setTimeout(() => {
        popupOpenTimerRef.current = null;
        setPopupVisible(true);
      }, POPUP_OPEN_DELAY_MS);
      console.log("[RewardGate] popup requested", { feature });

      return new Promise<boolean>((resolve) => {
        pendingResolverRef.current = resolve;
      });
    },
    [unlockedUntil],
  );

  /* 2026.11.04 광고가 준비된 상태에서 실제로 광고를 띄우는 단계(기존 로직을 분리) by yen */
  const startShowingAd = useCallback(() => {
    adInFlightRef.current = true;
    setAdLoading(true);
    /* 2026.11.04 열려 있는 RN Modal(장소 메뉴 등)을 광고 동안 숨기도록 알림 by yen */
    setAdShowing(true);
    /* 2026.10.11 광고 Activity 위로 RN Modal이 남아 있으면 복귀 시 재부착 충돌로 터치 먹통/크래시 —
       팝업을 먼저 닫고(dismiss 완료 여유 350ms) 광고를 띄움. pending resolver는 유지되어
       광고 종료 후 onClosed에서 계속 진행 by Claude */
    setPopupVisible(false);
    /* 2026.10.19 show() 후 OPENED/CLOSED/ERROR가 하나도 오지 않는 경우에 대비한 안전망 by Claude */
    clearAdPresentTimer();
    adPresentTimerRef.current = setTimeout(() => {
      adPresentTimerRef.current = null;
      if (!adInFlightRef.current) return;
      console.log("[RewardGate] ad did not present in time — unlocking");
      adInFlightRef.current = false;
      setAdLoading(false);
      setAdShowing(false);
      void grantUnlock();
      finishPending(true);
    }, AD_PRESENT_TIMEOUT_MS);
    setTimeout(() => {
      const shown = showRewardedAd();
      console.log("[RewardGate] show called", { shown });
      if (!shown) {
        // 준비됐다고 봤지만 노출 실패 → 막히지 않도록 대체 해금
        clearAdPresentTimer();
        adInFlightRef.current = false;
        setAdLoading(false);
        setAdShowing(false);
        void grantUnlock();
        finishPending(true);
      }
    }, 350);
  }, [finishPending, grantUnlock]);

  const handleWatchAd = useCallback(() => {
    if (adInFlightRef.current) return;

    if (isRewardedAdReady()) {
      startShowingAd();
      return;
    }

    /* 2026.11.04 광고가 아직 준비 전이면 바로 해금하지 않고 최대 5초간 로드를 기다림(버튼 스피너 표시).
       그래도 준비되지 않으면 사용자를 막지 않도록 해금 by yen */
    console.log("[RewardGate] ad not ready — waiting for load");
    adInFlightRef.current = true;
    waitingForLoadRef.current = true;
    setAdLoading(true);
    ensureRewardedAdLoading();
    const token = ++loadWaitTokenRef.current;
    const startedAt = Date.now();
    const poll = () => {
      if (token !== loadWaitTokenRef.current) return;
      if (isRewardedAdReady()) {
        waitingForLoadRef.current = false;
        startShowingAd();
        return;
      }
      if (Date.now() - startedAt >= AD_LOAD_WAIT_MS) {
        console.log("[RewardGate] ad still not ready — unlocking");
        cancelLoadWait();
        void grantUnlock();
        finishPending(true);
        return;
      }
      setTimeout(poll, 250);
    };
    setTimeout(poll, 250);
  }, [finishPending, grantUnlock, startShowingAd]);

  const handleClose = useCallback(() => {
    /* 2026.11.04 로드 대기 중 닫으면 대기도 취소 by yen */
    if (waitingForLoadRef.current) cancelLoadWait();
    finishPending(false);
  }, [finishPending]);

  const isUnlocked = unlockedUntil > Date.now();

  const value = useMemo<RewardGateContextType>(
    () => ({
      isUnlocked,
      unlockedUntil,
      requestAccess,
      grantUnlock,
      popupVisible,
      activeFeature,
      adLoading,
      adShowing,
      watchAd: handleWatchAd,
      closePopup: handleClose,
    }),
    [
      isUnlocked,
      unlockedUntil,
      requestAccess,
      grantUnlock,
      popupVisible,
      activeFeature,
      adLoading,
      adShowing,
      handleWatchAd,
      handleClose,
    ],
  );

  /* 2026.06.23 메인 화면 위에서 뜨는 트리거(날짜 설정/지도)는 루트 Modal로 표시.
     장소 메뉴(placeSearch)는 이미 열린 Modal 안에서 오버레이로 직접 렌더하므로 여기서는 제외(Modal 중첩 방지) by yen */
  const showRootPopup = popupVisible && activeFeature !== "placeSearch";

  return (
    <RewardGateContext.Provider value={value}>
      {children}
      <RewardPopup
        visible={showRootPopup}
        loading={adLoading}
        onWatchAd={handleWatchAd}
        onClose={handleClose}
      />
    </RewardGateContext.Provider>
  );
}

export function useRewardGate() {
  const ctx = useContext(RewardGateContext);
  if (!ctx) {
    throw new Error("useRewardGate must be used within a RewardGateProvider");
  }
  return ctx;
}
