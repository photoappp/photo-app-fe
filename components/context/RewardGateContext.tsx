/* 2026.06.23 버튼별로 재사용 가능한 광고 리워드 게이트 by yen
   - 동작: 게이트가 걸린 버튼을 누르면
       1) 2시간 무료 해금이 살아있으면 그대로 통과
       2) 마지막 팝업 노출 후 2분이 안 지났으면(쿨다운) 다시 묻지 않고 통과
       3) 그 외에는 리워드 팝업을 띄우고, 광고를 보면 2시간 해금 후 통과 / 닫으면 취소
   - 해금 시각(unlockedUntil)을 단일 진실원천으로 두어 기존 위치 검색 게이트와 통합 */
import AsyncStorage from "@react-native-async-storage/async-storage";
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
const USE_TEST_UNLOCK_DURATION = true; // ⚠️ 배포 전 false 로 변경
const UNLOCK_DURATION_MS = USE_TEST_UNLOCK_DURATION
  ? UNLOCK_DURATION_TEST_MS
  : UNLOCK_DURATION_PROD_MS;

/* 2026.06.23 기존 위치 해금 키를 그대로 재사용해 별도 마이그레이션 없이 해금 상태를 통합 by yen */
const UNLOCK_STORAGE_KEY = "locationFeatureUnlockedUntil";

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
  watchAd: () => void;
  closePopup: () => void;
}

const RewardGateContext = createContext<RewardGateContextType | undefined>(
  undefined,
);

export function RewardGateProvider({ children }: { children: ReactNode }) {
  const [unlockedUntil, setUnlockedUntil] = useState(0);
  const [popupVisible, setPopupVisible] = useState(false);
  const [activeFeature, setActiveFeature] = useState<RewardFeatureKey | null>(
    null,
  );
  const [adLoading, setAdLoading] = useState(false);

  const pendingResolverRef = useRef<((granted: boolean) => void) | null>(null);
  const adInFlightRef = useRef(false);

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

  /* 보상형 광고 미리 로드 + 보상/닫힘 이벤트 라우팅 */
  useEffect(() => {
    const teardown = loadRewardedAd({
      onRewardEarned: () => {
        void grantUnlock();
      },
      onClosed: (earned) => {
        adInFlightRef.current = false;
        setAdLoading(false);
        if (earned) {
          // 보상 획득 → 해금은 onRewardEarned에서 처리, 여기서 팝업 닫고 통과
          finishPending(true);
        }
        // earned=false(보상 없이 닫음)면 팝업은 그대로 유지해 재시도/닫기를 선택하게 둠
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
    setPopupVisible(false);
    setActiveFeature(null);
    if (!resolve) return;
    /* 2026.06.23 iOS에서 팝업 Modal이 닫히는 도중 후속 동작이 다른 Modal(지도/검색/메뉴)을
       바로 present/dismiss 하면 화면이 멈추는 문제가 있어, 닫힘 애니메이션이 끝난 뒤 실행 by yen */
    setTimeout(() => resolve(granted), 400);
  }, []);

  const grantUnlock = useCallback(async () => {
    const until = Date.now() + UNLOCK_DURATION_MS;
    setUnlockedUntil(until);
    try {
      await AsyncStorage.setItem(UNLOCK_STORAGE_KEY, JSON.stringify(until));
    } catch (error) {
      console.log("reward gate unlock persist error:", error);
    }
  }, []);

  const requestAccess = useCallback(
    (feature: RewardFeatureKey) => {
      // 해금 중이면 통과, 아니면 팝업 노출
      if (unlockedUntil > Date.now()) return Promise.resolve(true);

      // 이전에 대기 중이던 요청이 있으면 취소 처리
      pendingResolverRef.current?.(false);
      setActiveFeature(feature);
      setPopupVisible(true);

      return new Promise<boolean>((resolve) => {
        pendingResolverRef.current = resolve;
      });
    },
    [unlockedUntil],
  );

  const handleWatchAd = useCallback(() => {
    if (adInFlightRef.current) return;

    if (isRewardedAdReady()) {
      adInFlightRef.current = true;
      setAdLoading(true);
      const shown = showRewardedAd();
      if (!shown) {
        // 준비됐다고 봤지만 노출 실패 → 막히지 않도록 대체 해금
        adInFlightRef.current = false;
        setAdLoading(false);
        void grantUnlock();
        finishPending(true);
      }
      return;
    }

    /* 2026.06.23 광고가 아직 준비되지 않은 경우(예: 광고 ID 미설정/네트워크) 사용자를 막지 않도록 해금 부여 by yen */
    void grantUnlock();
    finishPending(true);
  }, [finishPending, grantUnlock]);

  const handleClose = useCallback(() => {
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
