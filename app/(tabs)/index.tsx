import DateTimeFilter from "@/components/DateTimeFilter";
import ShowOnMap from "@/components/ShowOnMap";
import { Photo } from "@/types/Photo";
import { Ionicons } from '@expo/vector-icons';
// import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from "expo-location";
import * as MediaLibrary from "expo-media-library";
import { useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState, /** 2026.03.03 Add by June */
  Button,
  Dimensions,
  FlatList,
  Image,
  Linking,
  ListRenderItem,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  useColorScheme,
  View
} from "react-native";
import ImageViewing from 'react-native-image-viewing';
import { Edges, SafeAreaView } from 'react-native-safe-area-context';
import Share from 'react-native-share';

import { useI18n } from '@/components/context/useI18n';
import { useSlideshowTime } from '@/components/context/SlideshowTimeContext';
import { useTheme } from '@/components/context/ThemeContext';
import { useUserData } from '@/components/context/UserDataContext';

import IconPlay from "@/assets/icons/ic_play.svg"; //2026.03.18 Change button UI by June

import { AMPLITUDE_API_KEY } from '@/constants/env';
import * as amplitude from '@amplitude/analytics-react-native';
/* 2026.04.15 SQLite 메타데이터 DB/동기화 모듈을 홈 화면 로딩 파이프라인에 연결하기 위해 import 추가 by June */
import {
  countPhotoMetadataByDateTime,
  enqueueGeocodeJobs,
  getGeocodeCacheCount,
  getGeocodePendingJobCount,
  getGeocodeCacheByKey,
  getOldestPhotoTakenAt,
  getPhotoMetadataCount,
  getPhotoSyncState,
  initPhotoMetadataDb,
  queryPhotoMetadataByDateTime,
  upsertGeocodeCacheRows,
} from "@/lib/db/photoMetadataDb";
import {
  syncPhotoMetadataInBackground,
  upsertPhotoMetadataFromAssets,
} from "@/lib/services/photoMetadataSync";
import { processGeocodeJobsInBackground } from "@/lib/services/geocodeJobWorker";
import { recordPerfMetric } from "@/lib/services/perfMetrics";




// Responsive image grid calculations
const screenWidth = Dimensions.get("window").width;
const minImageWidth = 100;
const horizontalPadding = 4;
const imageMargin = 2;
const numColumns = 5;
// 실제로 쓸 수 있는 폭: 화면 - (바깥 24 + 안쪽 horizontalPadding) * 2
const usableWidth = screenWidth - (24 + horizontalPadding) * 2;
// 이 usableWidth 기준으로 5등분 + margin
const imageWidth = Math.floor(
  (usableWidth - numColumns * imageMargin * 2) / numColumns
);

type DateTimeFilterState = {
  dateStart: Date;
  dateEnd: Date;
  timeStart: number;
  timeEnd: number;
};

type LocationFilterState = {
  countries: string[];
  cities: string[];
  locationLabel?: string;
};
type FilterState = DateTimeFilterState & LocationFilterState;

/** ---------- HomeScreen ---------- */
export default function HomeScreen() {
	const router = useRouter();
	const navigation = useNavigation();
	const { isDarkTheme, colors } = useTheme();
	/* 2026.04.22 홈 화면의 하드코딩 문구를 다국어로 전환하기 위해 공용 i18n 훅을 사용하도록 변경 by June */
	const { t } = useI18n();
//	const { userData, updateUserData } = useUserData();

	const { incrementDateFilter, incrementTimeFilter, incrementLocationFilter, updateTotalPhotos } = useUserData();

	useEffect(() => {
			navigation.setOptions({ headerShown: false });
		}, [navigation]);

  const [images, setImages] = useState<any[]>([]);


  const handleOpenSettings = () => {
    //navigation.navigate('Settings'); // 실제 설정 스크린 이름으로 바꿔 사용
    console.log("Move to Setting page");
    const handleOpenSettings = () => {
      amplitude.track("tap_settings_button", {
        screen_name: "home",
      });
    };
  };

  const [error, setError] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [progress, setProgress] = useState<{
    loaded: number;
    total: number | null;
  }>({ loaded: 0, total: null });
  /* 2026.04.22 지오코딩/사진 인덱싱 진행상태를 로딩 박스에 노출하기 위해 UI 표시용 상태를 추가 by June */
  const [indexingProgress, setIndexingProgress] = useState<{
    photoIndexed: number;
    isPhotoIndexing: boolean;
    geocodeCached: number;
    geocodePending: number;
  }>({
    photoIndexed: 0,
    isPhotoIndexing: true,
    geocodeCached: 0,
    geocodePending: 0,
  });
  const colorScheme = useColorScheme();
  const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

  /* 2026.04.15 DB 동기화 작업의 중복 실행을 막아 기존 로딩/필터 플로우에 성능 영향을 최소화하기 위해 추가 by June */
  const dbSyncInFlightRef = useRef(false);
  /* 2026.04.15 iOS ph:// URI를 localUri로 변환한 결과를 재사용해 반복 조회 비용과 이미지 로더 충돌 노출을 줄이기 위해 캐시 추가 by June */
  const resolvedUriCacheRef = useRef<Map<string, string>>(new Map());

  // ---- 사진 목록/페이지네이션 ----
  const [photos, setPhotos] = useState<Photo[]>([]); // 화면에 뿌릴 가공된 데이터 (필터 적용 후)
	const [photosAll, setPhotosAll] = useState<Photo[]>([]); // 필터 적용 전 전체 사진
  const [endCursor, setEndCursor] = useState<string | null>(null); // MediaLibrary가 돌려주는 다음 페이지 커서 문자열
  const [hasNextPage, setHasNextPage] = useState<boolean>(true); // 다음 페이지 있는지 여부
  const [loading, setLoading] = useState<boolean>(false);

  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  /* 2026.04.22 썸네일 리스트는 경량 URI를 유지하고 상세 뷰어에서만 고해상도 URI를 점진 교체하기 위해 뷰어 전용 URI 맵 상태를 추가 by June */
  const [viewerDetailUriMap, setViewerDetailUriMap] = useState<Record<string, string>>({});

  /** 2026.03.26 By June - 사진 목록/페이지네이션 관련 */
  const [initialLoading, setInitialLoading] = useState(false);
  const [backgroundLoading, setBackgroundLoading] = useState(false);
  const [emptyMessage, setEmptyMessage] = useState<string | null>(null);
  const [didInitialLoad, setDidInitialLoad] = useState(false);
  const requestInFlightRef = useRef(false);
  /* 2026.04.22 날짜/시간 DB 경로에서도 스크롤 append를 지원하기 위해 현재 DB 페이지네이션 오프셋/활성 상태를 ref로 관리하도록 추가 by June */
  const dbDateTimePagingRef = useRef<{ enabled: boolean; offset: number }>({
    enabled: false,
    offset: 0,
  });
  const [filterLoading, setFilterLoading] = useState(false);
  const [appendLoading, setAppendLoading] = useState(false);
  /** 2026.03.26 By June */

  // ImageViewing 에 넘길 images 배열 (형식: { uri: string }[])
  const viewerImages = useMemo(
    /* 2026.04.22 상세 진입 후 해상도 보강된 URI가 있으면 뷰어에서 우선 사용하도록 병합해 썸네일/상세 로딩 경로를 분리하기 위해 수정 by June */
    () => photos.map((p) => ({ uri: viewerDetailUriMap[p.uri] ?? p.uri })),
    [photos, viewerDetailUriMap]
  );

  const photosRef = useRef<Photo[]>(photos);
  const viewerIndexRef = useRef<number>(viewerIndex);

  // ----- amplitude tracking helpers -----
  const is_amp_ready_ref = useRef(false);
  const home_view_start_ms_ref = useRef<number>(Date.now());

  // swipe threshold tracking (viewer)
  const swipe_count_ref = useRef(0);
  const swipe_threshold_fired_ref = useRef(false);
  const SWIPE_THRESHOLD = 10;
  let app_launched_tracked = false;

  // 날짜,시간 필터링 관련 ===> 컴포넌트로 분리하기!!
  /* 2026.04.15 날짜 경계 함수 참조를 안정화해 DB 조회 콜백 의존성 재생성을 방지하기 위해 useCallback으로 변경 by June */
  const dayStartMs = useCallback((d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).getTime(), []);
  /* 2026.04.15 날짜 경계 함수 참조를 안정화해 초기 로드 effect 반복 실행을 막기 위해 useCallback으로 변경 by June */
  const dayEndNextMs = useCallback((d: Date) => new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate() + 1,
    0,
    0,
    0,
    0
  ).getTime(), []);

  /** 2026.03.26 by June Edit Start */  
  /* 2026.04.15 초기 기준 날짜를 렌더마다 재생성하지 않도록 고정해 필터/로드 콜백 재생성을 줄이기 위해 추가 by June */
  const baseTodayRef = useRef(new Date());
  const today = baseTodayRef.current;
  /* 2026.04.15 oneYearAgo 참조를 고정해 loadInitialPhotos 의존성 변경으로 인한 반복 호출을 방지하기 위해 수정 by June */
  const oneYearAgoRef = useRef(new Date(
    today.getFullYear() - 1,
    today.getMonth(),
    today.getDate()
  ));
  const oneYearAgo = oneYearAgoRef.current;
  /* 2026.04.15 threeYearsAgo도 동일하게 참조 고정해 향후 필터 확장 시 의존성 루프를 예방하기 위해 수정 by June */
  const threeYearsAgoRef = useRef(new Date(
    today.getFullYear() - 3,
    today.getMonth(),
    today.getDate()
  ));
  const threeYearsAgo = threeYearsAgoRef.current;
  
  const INITIAL_TARGET_COUNT = 30;
  const FILTER_RESET_TARGET_COUNT = 50;
  const APPEND_TARGET_COUNT = 50;
  const FETCH_PAGE_SIZE = 100;
  /* 2026.04.15 시간 필터를 SQL로 이관한 이후 불필요한 대량 조회를 줄여 긴 기간 검색 응답 속도를 개선하기 위해 조회 상한을 조정 by June */
  const DB_QUERY_LIMIT = 120;
  
  /* 2026.04.22 빈 상태 문구를 다국어로 표시하기 위해 하드코딩 문자열을 번역 키 기반으로 교체 by June */
  const EMPTY_RECENT_3Y_MESSAGE = t("noRecent3YearsPhotos", "No photos in the last 3 years.");
  const EMPTY_DEFAULT_MESSAGE = t("noPhotosFound", "No photos found");
  const EMPTY_DEFAULT_DESC = t("tryExpandingFilters", "Try expanding the filters.");
 
  const sortPhotosByTakenAtAsc = (items: Photo[]) => {
    return [...items].sort((a, b) => {
      const aTime =
        typeof a.takenAt === "number" && Number.isFinite(a.takenAt)
          ? a.takenAt
          : Number.MAX_SAFE_INTEGER;
  
      const bTime =
        typeof b.takenAt === "number" && Number.isFinite(b.takenAt)
          ? b.takenAt
          : Number.MAX_SAFE_INTEGER;
  
      return aTime - bTime;
    });
  };

  const [filter, setFilter] = useState<FilterState>({
    dateStart: oneYearAgo,
    /* 2026.04.15 초기 필터 종료일을 고정 기준 날짜로 맞춰 첫 렌더마다 값이 흔들리는 것을 방지하기 위해 수정 by June */
    dateEnd: today,
    timeStart: 0,
    timeEnd: 1439,
    countries: [],
    cities: [],
  });
  /* 2026.04.15 필터 기본값 대비 변경 여부를 안정적으로 판정해 카운트/재조회 루프를 방지하기 위해 초기 필터 스냅샷을 보관 by June */
  const initialFilterRef = useRef<FilterState>({
    dateStart: oneYearAgo,
    /* 2026.04.15 초기 스냅샷 비교 기준도 동일한 고정 날짜를 사용해 usedDate 판정 오차를 방지하기 위해 수정 by June */
    dateEnd: today,
    timeStart: 0,
    timeEnd: 1439,
    countries: [],
    cities: [],
  });
   /** 2026.03.26 by June Edit End */  

  // 슬라이드쇼 관련
  const { slideshowTime } = useSlideshowTime();
  const [slideshowOn, setSlideshowOn] = useState(false);
  const [slideshowVisible, setSlideshowVisible] = useState(false);
  const slideshowListRef = useRef<FlatList<{ uri: string }> | null>(null);
  const slideshowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const slideshowRunTokenRef = useRef(0);
  /* 2026.04.22 Settings에서 slideshowTime을 ms 단위로 저장하므로 여기서 초→ms 재변환을 제거해 3초 설정이 3초로 정확히 동작하도록 수정 by June */
  const slideshowDelayMs = useMemo(() => {
    const delayMs = Number(slideshowTime);
    /* 2026.04.22 비정상 값 유입 시에도 슬라이드쇼가 멈추지 않도록 최소 1초 기본값으로 안전 처리하기 위해 유효성 검사를 유지 by June */
    if (!Number.isFinite(delayMs) || delayMs <= 0) return 3000;
    return Math.max(1000, Math.round(delayMs));
  }, [slideshowTime]);
  /* 2026.04.22 슬라이드쇼 타이머 정리를 공용화해 중복 clear 호출/누락을 방지하기 위해 헬퍼를 추가 by June */
  const clearSlideshowTimer = useCallback(() => {
    if (slideshowTimerRef.current !== null) {
      clearTimeout(slideshowTimerRef.current);
      slideshowTimerRef.current = null;
    }
  }, []);
  /* 2026.04.22 실행 세션 토큰 기반으로 슬라이드쇼를 종료해 이전 타이머 콜백의 상태 업데이트 경쟁을 차단하기 위해 종료 함수를 재구현 by June */
  const closeSlideshow = useCallback(
    (options?: { trackClose?: boolean }) => {
      slideshowRunTokenRef.current += 1;
      clearSlideshowTimer();
      setSlideshowOn(false);
      setSlideshowVisible(false);

      if (options?.trackClose) {
        amplitude.track("slideshow_closed", {
          screen_name: "home",
          end_index: viewerIndexRef.current ?? 0,
        });
      }
    },
    [clearSlideshowTimer]
  );
  /* 2026.04.22 화면 뷰어 종료 시 슬라이드쇼만 중지하고 별도 close 이벤트는 남기지 않기 위해 전용 stop 함수를 분리 by June */
  const stopSlideshow = useCallback(() => {
    closeSlideshow({ trackClose: false });
  }, [closeSlideshow]);
  /* 2026.04.22 재귀 setTimeout 기반으로 다음 슬라이드를 예약해 interval 대비 종료 제어를 단순화하기 위해 스케줄러 함수를 추가 by June */
  const scheduleNextSlide = useCallback(
    (token: number) => {
      clearSlideshowTimer();
      slideshowTimerRef.current = setTimeout(() => {
        if (token !== slideshowRunTokenRef.current) return;
        const total = photosRef.current.length;
        if (total <= 0) {
          closeSlideshow({ trackClose: true });
          return;
        }

        setViewerIndex((prev) => {
          const next = prev + 1;
          if (next >= total) {
            closeSlideshow({ trackClose: true });
            return prev;
          }

          viewerIndexRef.current = next;
          slideshowListRef.current?.scrollToIndex({ index: next, animated: true });
          scheduleNextSlide(token);
          return next;
        });
      }, slideshowDelayMs);
    },
    [clearSlideshowTimer, closeSlideshow, slideshowDelayMs]
  );
  /* 2026.04.22 시작 인덱스를 경계값으로 보정하고 세션 토큰을 새로 발급해 슬라이드쇼 시작 흐름을 재구성하기 위해 start 함수를 재구현 by June */
  const startSlideshow = useCallback(
    (startIndex: number = 0) => {
      const total = photosRef.current.length;
      if (total <= 0) return;

      const safeIndex = Math.min(Math.max(startIndex, 0), total - 1);
      slideshowRunTokenRef.current += 1;
      const token = slideshowRunTokenRef.current;

      clearSlideshowTimer();
      setViewerIndex(safeIndex);
      viewerIndexRef.current = safeIndex;
      setSlideshowVisible(true);
      setSlideshowOn(true);

      scheduleNextSlide(token);
    },
    [clearSlideshowTimer, scheduleNextSlide]
  );

  useEffect(() => {
    if (!AMPLITUDE_API_KEY) {
      console.warn("amplitude_api_key_missing");
      return;
    }
  
    // init은 보통 1회만 하는 게 정석이지만,
    // 동일 API key로 중복 init이 문제되면 아래도 guard 걸면 됨.
    amplitude.init(AMPLITUDE_API_KEY);
  
    if (!app_launched_tracked) {
      app_launched_tracked = true;
      amplitude.track("app_launched", {
        platform: Platform.OS,
        env: __DEV__ ? "dev" : "prod",
      });
    }
  }, []);

  useEffect(() => {
    home_view_start_ms_ref.current = Date.now();
  
    amplitude.track("screen_home_viewed", {
      screen_name: "home",
    });
  }, []);

  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  /* 2026.04.15 SQLite 메타데이터 DB 초기화를 앱 진입 시 1회 수행해 동기화 대상 테이블/인덱스를 보장하기 위해 추가 by June */
  useEffect(() => {
    void initPhotoMetadataDb().catch((err) => {
      console.log("photo metadata db init error:", err);
    });
  }, []);

  /* 2026.04.15 백그라운드 메타데이터 동기화를 공용 함수로 분리해 초기 진입/앱 복귀 시 동일 정책으로 재사용하기 위해 추가 by June */
  const triggerPhotoMetadataSync = useCallback(async () => {
    if (dbSyncInFlightRef.current) return;

    dbSyncInFlightRef.current = true;
    /* 2026.04.22 메타데이터 동기화 전체 지연을 계측해 백그라운드 인덱싱 체감 속도를 p50/p95로 추적하기 위해 타이머를 추가 by June */
    const syncStartedAt = Date.now();
    try {
      /* 2026.04.15 동기화 전 DB 적재량/커서 상태를 로그로 남겨 팀 테스트 시 인덱싱 진행 상태를 확인하기 위해 추가 by June */
      const beforeCount = await getPhotoMetadataCount();
      const beforeState = await getPhotoSyncState();
      console.log("photo metadata sync before:", {
        count: beforeCount,
        nextCursor: beforeState.nextCursor,
        hasNextPage: beforeState.hasNextPage,
        lastSyncedAt: beforeState.lastSyncedAt,
      });

      await syncPhotoMetadataInBackground({ maxPages: 3 });

      /* 2026.04.15 동기화 후 DB 적재량/커서 상태를 로그로 남겨 테스트에서 증분 반영 여부를 검증하기 위해 추가 by June */
      const afterCount = await getPhotoMetadataCount();
      const afterState = await getPhotoSyncState();
      console.log("photo metadata sync after:", {
        count: afterCount,
        nextCursor: afterState.nextCursor,
        hasNextPage: afterState.hasNextPage,
        lastSyncedAt: afterState.lastSyncedAt,
      });
    } catch (err) {
      console.log("photo metadata background sync error:", err);
    } finally {
      /* 2026.04.22 동기화 소요 시간을 기록해 페이지 수/DB 적재량 튜닝 시 기준 지표를 남기기 위해 계측을 추가 by June */
      recordPerfMetric("home.trigger_metadata_sync.ms", Date.now() - syncStartedAt, {
        logEvery: 2,
      });
      dbSyncInFlightRef.current = false;
    }
  }, []);

  /* 2026.04.22 로딩 프로그레스바에 인덱싱 진행 상태를 표시하기 위해 DB 카운트를 수집하는 함수를 추가 by June */
  const refreshIndexingProgress = useCallback(async () => {
    try {
      const [photoIndexed, photoSyncState, geocodeCached, geocodePending] =
        await Promise.all([
          getPhotoMetadataCount(),
          getPhotoSyncState(),
          getGeocodeCacheCount(),
          getGeocodePendingJobCount(),
        ]);

      setIndexingProgress({
        photoIndexed,
        isPhotoIndexing: photoSyncState.hasNextPage,
        geocodeCached,
        geocodePending,
      });
    } catch (err) {
      /* 2026.04.22 진행 상태 조회 실패가 메인 로딩 흐름을 막지 않도록 로그만 남기고 무시하기 위해 추가 by June */
      console.log("refreshIndexingProgress error:", err);
    }
  }, []);

  /* 2026.04.22 날짜 필터 대상 전체 건수와 현재 표출 건수를 함께 표시하기 위해 필터 기준 progress 계산 함수를 추가 by June */
  const refreshFilterProgress = useCallback(
    async (currentFilter: FilterState, loadedCount: number) => {
      try {
        const hasLocationFilter =
          currentFilter.countries.length > 0 || currentFilter.cities.length > 0;

        /* 2026.04.22 위치 필터가 포함된 경우 현재 단계에서는 전체 건수 즉시 산출이 어려워 표출 건수만 우선 노출하도록 분기 by June */
        if (hasLocationFilter) {
          setProgress({ loaded: loadedCount, total: null });
          return;
        }

        const metadataCount = await getPhotoMetadataCount();
        if (metadataCount <= 0) {
          /* 2026.04.22 DB 인덱싱 전 구간에서는 총 건수가 불확정이므로 loaded만 먼저 갱신해 진행 상태를 끊김 없이 보여주기 위해 처리 by June */
          setProgress({ loaded: loadedCount, total: null });
          return;
        }

        const total = await countPhotoMetadataByDateTime({
          dateStartMs: dayStartMs(currentFilter.dateStart),
          dateEndNextMs: dayEndNextMs(currentFilter.dateEnd),
          timeStart: currentFilter.timeStart,
          timeEnd: currentFilter.timeEnd,
        });

        setProgress({ loaded: loadedCount, total });
      } catch (err) {
        /* 2026.04.22 progress 계산 실패가 메인 로딩을 막지 않도록 loaded만 유지하고 total은 null로 폴백하기 위해 예외 처리 by June */
        console.log("refreshFilterProgress error:", err);
        setProgress({ loaded: loadedCount, total: null });
      }
    },
    [dayEndNextMs, dayStartMs]
  );

  /* 2026.04.15 초기 화면 렌더 이후 메타데이터 인덱싱을 점진적으로 누적해 차기 DB 조회 전환을 준비하기 위해 추가 by June */
  useEffect(() => {
    void triggerPhotoMetadataSync();
    /* 2026.04.22 화면 진입 시 인덱싱 상태를 즉시 표시하기 위해 초기 진행 상태 조회를 함께 실행 by June */
    void refreshIndexingProgress();
  }, [refreshIndexingProgress, triggerPhotoMetadataSync]);

  /* 2026.04.22 geocode 작업 큐를 주기적으로 처리해 위치 캐시를 점진 보강하고 대기 작업을 줄이기 위해 워커 루프를 추가 by June */
  useEffect(() => {
    const runWorker = async () => {
      try {
        await processGeocodeJobsInBackground({
          batchSize: 8,
          delayMs: 60,
        });
      } catch (err) {
        /* 2026.04.22 워커 실패가 메인 화면 동작을 중단시키지 않도록 로그만 남기고 다음 주기에 재시도하기 위해 추가 by June */
        console.log("processGeocodeJobsInBackground error:", err);
      } finally {
        void refreshIndexingProgress();
      }
    };

    void runWorker();
    const timer = setInterval(() => {
      void runWorker();
    }, 3000);

    return () => clearInterval(timer);
  }, [refreshIndexingProgress]);

  /* 2026.04.22 인덱싱 진행 수치를 실시간에 가깝게 갱신해 사용자에게 현재 처리 상태를 명확히 보여주기 위해 주기 갱신 이펙트 추가 by June */
  useEffect(() => {
    const timer = setInterval(() => {
      void refreshIndexingProgress();
    }, 2500);

    return () => clearInterval(timer);
  }, [refreshIndexingProgress]);

  useEffect(() => {
    return () => {
      // 앱 체류시간 측정
      const dwell_ms = Date.now() - home_view_start_ms_ref.current;
      amplitude.track("screen_home_exited", {
        screen_name: "home",
        dwell_ms,
      });
      // 화면 떠날 때 타이머 정리
      clearSlideshowTimer();
    };
  }, [clearSlideshowTimer]);

  const closeViewer = useCallback(() => {
    stopSlideshow();
    setViewerVisible(false);
  }, [stopSlideshow]);

  /* 2026.04.22 닫기 버튼 동작은 close event를 남겨야 하므로 래퍼 함수를 분리해 추적 일관성을 유지하기 위해 추가 by June */
  const handleCloseSlideshow = useCallback(() => {
    closeSlideshow({ trackClose: true });
  }, [closeSlideshow]);

  const handleSlideshow = () => {
    // 예: 현재 선택된 index에서 시작하고 싶으면 viewerIndexRef.current 사용
    startSlideshow(viewerIndexRef.current ?? 0);
    console.log("Slideshow start");

    amplitude.track("tap_slideshow_button", {
      screen_name: "home",
      slideshow_on: slideshowOn,
      photo_count: photosRef.current.length,
    });
  };
  /* 2026.04.22 사진 뷰어 상단 Play 버튼에서 현재 보고 있는 인덱스부터 슬라이드쇼가 시작되도록 전용 핸들러를 추가 by June */
  const handleViewerPlayPress = useCallback(() => {
    const startIndex = viewerIndexRef.current ?? 0;
    /* 2026.04.22 뷰어와 슬라이드쇼 모달이 겹쳐 보이는 문제를 막기 위해 재생 시작 전 뷰어를 닫도록 처리 by June */
    setViewerVisible(false);
    startSlideshow(startIndex);

    amplitude.track("tap_slideshow_button_from_viewer", {
      screen_name: "home",
      start_index: startIndex,
      photo_count: photosRef.current.length,
    });
  }, [startSlideshow]);
  
  async function imagesWithLocation(
    images: any[],
    opts?: { maxLookups?: number; precision?: number; delayMs?: number }
  ) {
    /* 2026.04.22 위치 보강 전체 지연을 계측해 캐시 hit율과 reverse geocode 병목을 함께 분석하기 위해 타이머를 추가 by June */
    const geocodeStartedAt = Date.now();
    const maxLookups = opts?.maxLookups ?? 60; // 한 번 로드에서 지오코딩 최대 호출 수
    const precision = opts?.precision ?? 2; // 좌표 라운딩 자릿수(2 ≈ ~1km)
    const delayMs = opts?.delayMs ?? 150; // 호출 간 지연(ms)
    /* 2026.04.22 단일 요청 내 중복 좌표 재계산을 막기 위해 메모리 캐시를 유지하되 DB 캐시와 함께 사용하도록 확장 by June */
    const cache = new Map<
      string,
      { country: string | null; city: string | null }
    >();
    /* 2026.04.22 reverse geocode 성공 결과를 배치 업서트로 저장해 쓰기 트랜잭션 횟수를 줄이기 위해 수집 배열 추가 by June */
    const cacheUpsertRows: Array<{
      geoKey: string;
      latitude: number;
      longitude: number;
      country: string | null;
      city: string | null;
      updatedAt: number;
    }> = [];
    /* 2026.04.22 geocode miss 좌표를 작업 큐에 누적해 이후 백그라운드 보강 대상으로 추적하기 위해 map 추가 by June */
    const pendingJobMap = new Map<string, { geoKey: string; latitude: number; longitude: number }>();
    const updated: any[] = [];
    let lookups = 0;
    /* 2026.04.22 캐시 효율을 수치화하기 위해 런타임/DB 캐시 hit 카운터를 추가 by June */
    let memoryCacheHits = 0;
    let dbCacheHits = 0;

    for (const img of images) {
      if (!img.location) {
        updated.push({ ...img, country: null, city: null });
        continue;
      }

      const lat = Number(img.location.latitude);
      const lon = Number(img.location.longitude);
      const key = `${lat.toFixed(precision)},${lon.toFixed(precision)}`;
      let place = cache.get(key);
      if (place) {
        memoryCacheHits += 1;
      }

      if (!place) {
        try {
          /* 2026.04.22 영속 geocode 캐시를 우선 조회해 동일 좌표 reverse geocode 재호출을 제거하기 위해 추가 by June */
          const cached = await getGeocodeCacheByKey(key);
          if (cached) {
            place = { country: cached.country ?? null, city: cached.city ?? null };
            cache.set(key, place);
            dbCacheHits += 1;
          }
        } catch (e: any) {
          /* 2026.04.22 캐시 조회 실패가 전체 로딩을 막지 않도록 오류를 로깅하고 런타임 geocode로 계속 진행하기 위해 추가 by June */
          console.log("geocode cache read error:", e);
        }
      }

      if (!place && lookups < maxLookups) {
        try {
          const [res] = await Location.reverseGeocodeAsync({
            latitude: lat,
            longitude: lon,
          });
          place = {
            country: res?.country ?? null,
            city: res?.city ?? res?.subregion ?? null,
          };
          cache.set(key, place);
          /* 2026.04.22 새 geocode 결과를 캐시에 저장하기 위해 배치 업서트 목록에 추가 by June */
          cacheUpsertRows.push({
            geoKey: key,
            latitude: lat,
            longitude: lon,
            country: place.country,
            city: place.city,
            updatedAt: Date.now(),
          });
          lookups += 1;
          if (delayMs > 0) await sleep(delayMs);
        } catch (e: any) {
          // 레이트리밋/기타 에러 → 해당 좌표는 빈 값 캐시하고 진행
          place = { country: null, city: null };
          cache.set(key, place);
          /* 2026.04.22 현재 배치에서 처리 실패한 좌표를 geocode 작업 큐에 남겨 추후 재시도 가능하게 하기 위해 추가 by June */
          pendingJobMap.set(key, { geoKey: key, latitude: lat, longitude: lon });
          // 간단 백오프
          await sleep(delayMs * 4);
        }
      } else if (!place) {
        /* 2026.04.22 이번 로드의 geocode 상한으로 미처리된 좌표를 작업 큐에 적재해 단계적 보강 대상에 포함시키기 위해 추가 by June */
        pendingJobMap.set(key, { geoKey: key, latitude: lat, longitude: lon });
      }

      // 상한 초과 or 캐시된 값 사용
      if (!place) place = { country: null, city: null };
      updated.push({ ...img, ...place });
    }

    if (cacheUpsertRows.length > 0) {
      try {
        /* 2026.04.22 reverse geocode 결과를 요청 종료 시점에 일괄 캐시 저장해 다음 검색 속도를 높이기 위해 추가 by June */
        await upsertGeocodeCacheRows(cacheUpsertRows);
      } catch (e: any) {
        console.log("geocode cache write error:", e);
      }
    }

    if (pendingJobMap.size > 0) {
      try {
        /* 2026.04.22 miss 좌표를 작업 큐에 적재해 이후 백그라운드 처리 파이프라인으로 연결하기 위해 추가 by June */
        await enqueueGeocodeJobs(Array.from(pendingJobMap.values()));
      } catch (e: any) {
        console.log("geocode job enqueue error:", e);
      }
    }

    /* 2026.04.22 위치 보강 처리 시간을 캐시 hit/lookup/큐 적재량과 함께 기록해 다음 최적화 근거를 확보하기 위해 계측을 추가 by June */
    recordPerfMetric("home.images_with_location.ms", Date.now() - geocodeStartedAt, {
      context: {
        inputCount: images.length,
        reverseLookups: lookups,
        memoryCacheHits,
        dbCacheHits,
        queuedJobs: pendingJobMap.size,
      },
      logEvery: 2,
    });

    return updated;
  }

  /** 2026.03.26 By June START - 사진 로드 및 날짜 필터 변경시 액션관련 함수 모듈화 작업 */
  /** timestamp 추출 */
  const getAssetTimestampMs = (asset: MediaLibrary.Asset) => {
    const created =
      asset.creationTime && asset.creationTime > 0 ? asset.creationTime : null;
  
    const modified =
      asset.modificationTime && asset.modificationTime > 0
        ? asset.modificationTime
        : null;
  
    return created ?? modified;
  };

  /** 날짜/시간 필터 검사 */
  const matchesDateTimeFilter = (
    asset: MediaLibrary.Asset,
    currentFilter: FilterState
  ) => {
    const tsMs = getAssetTimestampMs(asset);
  
    // timestamp 없는 사진도 포함
    if (!tsMs) return true;
  
    if (
      tsMs < dayStartMs(currentFilter.dateStart) ||
      tsMs >= dayEndNextMs(currentFilter.dateEnd)
    ) {
      return false;
    }
  
    return inTimeWindow(tsMs, currentFilter.timeStart, currentFilter.timeEnd);
  };

  /** 페이지 1번 fetch */
  const fetchAssetsPage = async (params?: { after?: string | null; first?: number }) => {
    const result = await MediaLibrary.getAssetsAsync({
      first: params?.first ?? FETCH_PAGE_SIZE,
      mediaType: MediaLibrary.MediaType.photo,
      after: params?.after ?? undefined,
      sortBy: [MediaLibrary.SortBy.creationTime],
    });

    updateTotalPhotos(result.totalCount ?? 0);

    /* 2026.04.15 기존 MediaLibrary fetch 결과를 즉시 SQLite에 업서트해 UI 로직을 건드리지 않고도 메타데이터를 누적하기 위해 추가 by June */
    void upsertPhotoMetadataFromAssets(result.assets ?? []).catch((err) => {
      console.log("photo metadata upsert error:", err);
    });

    return result;
  };

  /** asset → Photo 정규화 */
  const hydrateAssetsToPhotos = async (assets: MediaLibrary.Asset[]): Promise<Photo[]> => {
    const base = assets.map((asset) => ({
      uri: asset.uri,
      takenAt:
        asset.creationTime && asset.creationTime > 0
          ? asset.creationTime
          : asset.modificationTime && asset.modificationTime > 0
          ? asset.modificationTime
          : null,
      location: null,
    }));
    /* 2026.04.22 썸네일 리스트 단계에서는 원본 URI를 유지해 대량 localUri 변환으로 인한 메모리 피크를 줄이고 상세 진입 시점에만 고해상도 로드를 하도록 변경 by June */
    return base;
  };

  /** 위치 필터 */
  const applyLocationFilter = (items: Photo[], currentFilter: FilterState) => {
    const { countries, cities } = currentFilter;
  
    if (countries.length === 0 && cities.length === 0) {
      return items;
    }
  
    if (cities.length > 0) {
      return items.filter((photo) => cities.includes(photo.city ?? ""));
    }
  
    return items.filter((photo) => countries.includes(photo.country ?? ""));
  };

  /** geocoding 필요 여부 판별 */
  const shouldUseGeocoding = (
    currentFilter: FilterState,
    _mode: "initial" | "background" | "append" | "filter-reset"
  ) => {
    const hasLocationFilter =
      currentFilter.countries.length > 0 || currentFilter.cities.length > 0;
    /* 2026.04.22 위치 필터가 실제로 사용될 때만 geocoding을 수행해 append/background에서 불필요한 메모리/CPU 사용을 줄이기 위해 정책을 단순화 by June */
    return hasLocationFilter;
  };

  /** 사진 정렬 처리: 오래된 순 + timestamp 없는 사진 최하단 표출 */
  /* 2026.04.15 정렬 함수 참조를 고정해 DB 조회 콜백이 렌더마다 재생성되지 않도록 하기 위해 useCallback 적용 by June */
  const sortPhotosForDisplay = useCallback((items: Photo[]) => {
    return [...items].sort((a, b) => {
      const aHasTs = typeof a.takenAt === "number" && Number.isFinite(a.takenAt);
      const bHasTs = typeof b.takenAt === "number" && Number.isFinite(b.takenAt);
  
      if (aHasTs && bHasTs) {
        return (a.takenAt as number) - (b.takenAt as number);
      }
  
      if (aHasTs && !bHasTs) return -1;
      if (!aHasTs && bHasTs) return 1;
  
      return 0;
    });
  }, []);

  /** 중복 제거 함수 - append 때 같은 사진이 두 번 붙는 것 방지 */
  /* 2026.04.15 중복제거 함수 참조를 고정해 tryLoadPhotosFromDbForDateTime 재생성을 줄이고 초기 로드 루프를 방지하기 위해 useCallback 적용 by June */
  const dedupePhotosByUri = useCallback((items: Photo[]) => {
    const seen = new Set<string>();
    const out: Photo[] = [];
  
    for (const item of items) {
      if (seen.has(item.uri)) continue;
      seen.add(item.uri);
      out.push(item);
    }
  
    return out;
  }, []);

  /* 2026.04.15 iOS에서 ph:// URI를 file://(localUri)로 정규화해 RCTImageURLLoaders 충돌 에러를 회피하기 위해 추가 by June */
  const resolveDisplayUri = useCallback(async (uri: string) => {
    if (Platform.OS !== "ios") return uri;
    if (!uri.startsWith("ph://")) return uri;

    const cached = resolvedUriCacheRef.current.get(uri);
    if (cached) return cached;

    try {
      const assetId = uri.replace("ph://", "");
      const info = await MediaLibrary.getAssetInfoAsync(assetId);
      const resolved = info.localUri ?? info.uri ?? uri;
      resolvedUriCacheRef.current.set(uri, resolved);
      return resolved;
    } catch (err) {
      console.log("resolveDisplayUri error:", err);
      return uri;
    }
  }, []);

  /* 2026.04.22 사용자가 사진을 눌렀을 때 해당 항목만 고해상도 URI로 보강해 리스트 전체 변환 없이 상세 품질을 확보하기 위해 뷰어 전용 로더를 추가 by June */
  const resolveViewerDetailUri = useCallback(async (sourceUri: string) => {
    const resolved = await resolveDisplayUri(sourceUri);
    setViewerDetailUriMap((prev) => {
      if (prev[sourceUri] === resolved) return prev;
      return { ...prev, [sourceUri]: resolved };
    });
  }, [resolveDisplayUri]);

  /* 2026.04.15 DB 조회 결과를 기존 화면 Photo 타입으로 안전하게 변환해 기존 렌더링/로케이션 코드와 호환시키기 위해 추가 by June */
  const mapDbRowsToPhotos = useCallback(
    (
      rows: Array<{
        uri: string;
        takenAt: number | null;
        latitude: number | null;
        longitude: number | null;
      }>
    ): Photo[] => {
      return rows.map((row) => ({
        uri: row.uri,
        takenAt: row.takenAt,
        location:
          typeof row.latitude === "number" && typeof row.longitude === "number"
            ? {
                latitude: row.latitude,
                longitude: row.longitude,
              }
            : null,
      }));
    },
    []
  );

  /* 2026.04.15 날짜/시간 전용 DB 조회 경로를 분리해 로케이션 필터 영역 영향 없이 성능 테스트 가능한 모듈 단위를 만들기 위해 추가 by June */
  const tryLoadPhotosFromDbForDateTime = useCallback(
    async (currentFilter: FilterState, limit: number, offset: number = 0) => {
      /* 2026.04.22 DB 날짜/시간 조회 지연을 계측해 MediaLibrary fallback 대비 성능 차이를 수치화하기 위해 타이머를 추가 by June */
      const dbLoadStartedAt = Date.now();
      const hasLocationFilter =
        currentFilter.countries.length > 0 || currentFilter.cities.length > 0;

      /* 2026.04.15 로케이션 공용 기능 영향 방지를 위해 위치 필터 사용 시 기존 MediaLibrary 경로로 즉시 우회하기 위해 추가 by June */
      if (hasLocationFilter) {
        /* 2026.04.22 위치 필터 분기로 DB 경로를 우회한 경우도 지연 로그에 남겨 분기별 빈도를 파악하기 위해 계측을 추가 by June */
        recordPerfMetric(
          "home.db_datetime_query.ms",
          Date.now() - dbLoadStartedAt,
          {
            context: { usedDb: false, reason: "location_filter", limit },
            logEvery: 3,
          }
        );
        return {
          usedDb: false as const,
          photos: [] as Photo[],
          dbHasMore: false,
          nextOffset: offset,
        };
      }

      const metadataCount = await getPhotoMetadataCount();
      if (metadataCount <= 0) {
        /* 2026.04.22 DB 미적재 상태 분기를 계측해 초기 동기화 완료 전 fallback 비율을 확인하기 위해 추가 by June */
        recordPerfMetric(
          "home.db_datetime_query.ms",
          Date.now() - dbLoadStartedAt,
          {
            context: { usedDb: false, reason: "metadata_empty", limit },
            logEvery: 3,
          }
        );
        return {
          usedDb: false as const,
          photos: [] as Photo[],
          dbHasMore: false,
          nextOffset: offset,
        };
      }
      /* 2026.04.22 인덱싱 완료 여부를 함께 확인해 DB 단독 신뢰 여부를 결정하기 위해 동기화 상태 조회 추가 by June */
      const syncState = await getPhotoSyncState();
      const isIndexComplete = !syncState.hasNextPage;

      const rows = await queryPhotoMetadataByDateTime({
        dateStartMs: dayStartMs(currentFilter.dateStart),
        dateEndNextMs: dayEndNextMs(currentFilter.dateEnd),
        timeStart: currentFilter.timeStart,
        timeEnd: currentFilter.timeEnd,
        /* 2026.04.22 hasMore 판정을 위해 limit+1을 조회하고 1건 초과 시 다음 페이지 존재로 판단하도록 수정 by June */
        limit: limit + 1,
        /* 2026.04.22 같은 날짜 필터에서 append 시 이어서 조회할 수 있도록 DB 조회 오프셋을 전달 by June */
        offset,
      });

      /* 2026.04.22 limit+1 조회 결과에서 초과 1건 존재 여부를 hasMore로 변환해 스크롤 추가 로딩 가능 여부를 계산하기 위해 추가 by June */
      const dbHasMore = rows.length > limit;
      /* 2026.04.22 실제 렌더에는 요청 limit까지만 반영해 이전 화면 밀도/성능 기준을 유지하기 위해 trim 처리 추가 by June */
      const trimmedRows = dbHasMore ? rows.slice(0, limit) : rows;

      const dbMapped = dedupePhotosByUri(mapDbRowsToPhotos(trimmedRows));
      /* 2026.04.15 DB 조회 함수는 필터링/정렬만 담당하고 URI 정규화는 실제 노출 개수 확정 후 호출하도록 분리해 장기 범위 성능을 개선하기 위해 수정 by June */
      const photosFromDb = sortPhotosForDisplay(dbMapped);

      /* 2026.04.22 인덱싱 미완료 상태에서 DB 결과가 비어 있으면 MediaLibrary fallback을 허용해 false-empty를 방지하기 위해 가드 추가 by June */
      if (!isIndexComplete && photosFromDb.length === 0) {
        /* 2026.04.22 인덱싱 미완료 false-empty fallback을 계측해 재탐색 발생 빈도를 추적하기 위해 추가 by June */
        recordPerfMetric(
          "home.db_datetime_query.ms",
          Date.now() - dbLoadStartedAt,
          {
            context: { usedDb: false, reason: "index_incomplete_empty", limit },
            logEvery: 2,
          }
        );
        return {
          usedDb: false as const,
          photos: [] as Photo[],
          dbHasMore: false,
          nextOffset: offset,
        };
      }

      /* 2026.04.22 DB 조회 성공 지연을 결과 건수와 함께 기록해 장기 범위 검색 최적화 튜닝 포인트를 찾기 위해 계측을 추가 by June */
      recordPerfMetric("home.db_datetime_query.ms", Date.now() - dbLoadStartedAt, {
        context: {
          usedDb: true,
          resultCount: photosFromDb.length,
          limit,
          offset,
          dbHasMore,
          isIndexComplete,
        },
        logEvery: 2,
      });

      return {
        usedDb: true as const,
        photos: photosFromDb,
        dbHasMore,
        /* 2026.04.22 다음 append 시작 오프셋을 한 곳에서 계산해 호출부의 중복 계산/오차를 방지하기 위해 반환값에 포함 by June */
        nextOffset: offset + photosFromDb.length,
      };
    },
    [dayEndNextMs, dayStartMs, dedupePhotosByUri, mapDbRowsToPhotos, sortPhotosForDisplay]
  );

  /** 사진 접근 권한 처리 */
  const ensurePhotoPermission = async () => {
    const { status, canAskAgain } = await MediaLibrary.getPermissionsAsync();
  
    let hasPerm = status === "granted";
  
    if (!hasPerm && canAskAgain) {
      const req = await MediaLibrary.requestPermissionsAsync(false);
      hasPerm = req.status === "granted";
    }
  
    if (hasPerm) return true;
  
    if (!canAskAgain) {
      /* 2026.04.22 권한 거부 안내 알럿을 다국어로 통일해 언어 설정과 사용자 안내 문구를 일치시키기 위해 수정 by June */
      Alert.alert(
        t("permissionRequiredTitle", "Permission Required"),
        t(
          "photoPermissionSettingsMessage",
          "To display photos, allow photo access in Settings."
        ),
        [
          { text: t("cancel", "Cancel"), style: "cancel" },
          {
            text: t("goToSettings", "Open Settings"),
            onPress: () => {
              Linking.openSettings().catch(() => {
                console.log("openSettings failed");
              });
            },
          },
        ]
      );
    } else {
      /* 2026.04.22 재요청 가능 상태의 권한 알럿도 다국어 처리해 언어별 UX 일관성을 유지하기 위해 수정 by June */
      Alert.alert(
        t("permissionRequiredTitle", "Permission Required"),
        t("photoPermissionRequired", "Photo access permission is required.")
      );
    }
  
    return false;
  };

  /** 목표 개수 확보까지 반복 fetch 처리 */
  const collectPhotosForTarget = async ({
    currentFilter,
    targetCount,
    startCursor = null,
    mode,
  }: {
    currentFilter: FilterState;
    targetCount: number;
    startCursor?: string | null;
    mode: "initial" | "background" | "append" | "filter-reset";
  }) => {
    /* 2026.04.22 MediaLibrary 기반 수집 경로의 전체 지연을 계측해 DB 경로 대비 잔여 병목을 비교하기 위해 타이머를 추가 by June */
    const collectStartedAt = Date.now();
    let cursor: string | null = startCursor;
    let nextPage = true;
    let totalCount = 0;
    const collected: Photo[] = [];
  
    let pageCount = 0;
    const MAX_PAGES = 5;

    while (nextPage && collected.length < targetCount && pageCount < MAX_PAGES) {
      /* 2026.04.22 페이지 단위 처리 지연을 계측해 어느 단계에서 느려지는지 분리 진단하기 위해 타이머를 추가 by June */
      const pageStartedAt = Date.now();
      pageCount += 1;
      const result = await fetchAssetsPage({
        after: cursor,
        first: FETCH_PAGE_SIZE,
      });
  
      totalCount = result.totalCount ?? totalCount;
  
      const assets = result.assets ?? [];
      const dateTimeMatched = assets.filter((asset) =>
        matchesDateTimeFilter(asset, currentFilter)
      );
  
      let photosChunk = await hydrateAssetsToPhotos(dateTimeMatched);
  
      if (shouldUseGeocoding(currentFilter, mode)) {
        photosChunk = await imagesWithLocation(photosChunk, {
          maxLookups: 60,
          precision: 2,
          delayMs: 150,
        });
      }
  
      const locationMatched = applyLocationFilter(photosChunk, currentFilter);
  
      collected.push(...locationMatched);
  
      cursor = result.endCursor ?? null;
      nextPage = result.hasNextPage;

      /* 2026.04.22 페이지 처리 시간을 모드/누적건수와 함께 기록해 append/background 튜닝 근거를 확보하기 위해 계측을 추가 by June */
      recordPerfMetric("home.collect_page.ms", Date.now() - pageStartedAt, {
        context: {
          mode,
          pageCount,
          collected: collected.length,
          totalCount,
        },
        logEvery: 3,
      });
    }

    /* 2026.04.22 수집 루프 전체 시간을 기록해 날짜 범위별 체감 지연과의 상관관계를 추적하기 위해 계측을 추가 by June */
    recordPerfMetric("home.collect_total.ms", Date.now() - collectStartedAt, {
      context: {
        mode,
        pageCount,
        collected: collected.length,
        targetCount,
      },
      logEvery: 2,
    });
  
    return {
      photos: collected,
      endCursor: cursor,
      hasNextPage: nextPage,
      totalCount,
    };
  };

  /** 앱 기동 후 초기 진입 시 사진 로드 빠르게 처리 */
  const loadInitialPhotos = useCallback(async () => {

    let initialHasNextPage = false;
    /* 2026.04.22 초기 진입 로딩 총 시간을 계측해 사용자 첫 체감 속도를 p50/p95로 관리하기 위해 타이머를 추가 by June */
    const initialLoadStartedAt = Date.now();
    /* 2026.04.22 초기 로드가 DB/MediaLibrary 중 어떤 경로를 탔는지 성능 로그에 남기기 위해 경로 라벨 변수를 추가 by June */
    let initialLoadPath: "db" | "medialibrary" | "permission_denied" | "skipped" = "skipped";

    if (requestInFlightRef.current) return;
  
    const ok = await ensurePhotoPermission();
    if (!ok) {
      initialLoadPath = "permission_denied";
      /* 2026.04.22 권한 거부 케이스도 계측에 포함해 초기 로드 실패 원인 비율을 확인하기 위해 로그를 추가 by June */
      recordPerfMetric("home.initial_load.ms", Date.now() - initialLoadStartedAt, {
        context: { path: initialLoadPath },
        logEvery: 1,
      });
      return;
    }
  
    requestInFlightRef.current = true;
    setInitialLoading(true);
    setEmptyMessage(null);
  
    try {
      /* 2026.04.15 초기 진입에서도 날짜/시간 DB 경로를 우선 사용해 첫 체감 속도 테스트가 가능하도록 분기 추가 by June */
      const dbResult = await tryLoadPhotosFromDbForDateTime(
        {
          dateStart: oneYearAgo,
          dateEnd: new Date(),
          timeStart: 0,
          timeEnd: 1439,
          countries: [],
          cities: [],
        },
        INITIAL_TARGET_COUNT
      );

      if (dbResult.usedDb) {
        initialLoadPath = "db";
        /* 2026.04.22 초기 DB 진입은 날짜/시간 필터 성능 우선 경로이므로 위치 보강/URI 정규화를 생략해 메모리 사용량을 낮추기 위해 경량화 by June */
        const initialDbPhotos = dbResult.photos.slice(0, INITIAL_TARGET_COUNT);
        setPhotos(initialDbPhotos);
        setPhotosAll(initialDbPhotos);
        /* 2026.04.22 초기 DB 로드 시점에도 필터 기준 표출/전체 건수를 즉시 노출하기 위해 progress를 동기화 by June */
        void refreshFilterProgress(
          {
            dateStart: oneYearAgo,
            dateEnd: new Date(),
            timeStart: 0,
            timeEnd: 1439,
            countries: [],
            cities: [],
          },
          initialDbPhotos.length
        );
        setEndCursor(null);
        /* 2026.04.22 초기 DB 로드에서도 남은 결과가 있으면 스크롤 append가 가능하도록 hasNextPage를 DB hasMore 기준으로 설정 by June */
        setHasNextPage(dbResult.dbHasMore);
        /* 2026.04.22 초기 DB 로드 후 append를 이어가기 위해 DB 페이지네이션 오프셋을 저장하고 활성 상태를 갱신 by June */
        dbDateTimePagingRef.current = {
          enabled: dbResult.dbHasMore,
          offset: dbResult.nextOffset,
        };
        /* 2026.04.22 초기 finally에서 background append 분기를 재사용하기 위해 DB 경로의 nextPage 상태를 initialHasNextPage에 반영 by June */
        initialHasNextPage = dbResult.dbHasMore;
        setDidInitialLoad(true);
        return;
      }

      
      // 1. 딱 1페이지만 가져온다
      initialLoadPath = "medialibrary";
      const result = await fetchAssetsPage({
        after: null,
        first: 50,
      });

      initialHasNextPage = result.hasNextPage;
  
      const assets = result.assets ?? [];
  
      // 2. 빠른 변환 (assetInfo 없음)
      /* 2026.04.15 hydrate 단계에서 URI 정규화를 비동기로 수행하도록 변경해 ph:// 충돌을 초기 로딩에서도 방지하기 위해 수정 by June */
      let photosFast = await hydrateAssetsToPhotos(assets);
  
      // 3. 날짜 필터만 간단 적용
      photosFast = photosFast.filter((p) => {
        if (!p.takenAt) return true;
  
        return (
          p.takenAt >= dayStartMs(oneYearAgo) &&
          p.takenAt < dayEndNextMs(new Date())
        );
      });
  
      // 4. 최대 30장만 잘라서 즉시 보여줌
      const initial = sortPhotosForDisplay(
        dedupePhotosByUri(photosFast).slice(0, INITIAL_TARGET_COUNT)
      );
  
      setPhotos(initial);
      setPhotosAll(initial);
      /* 2026.04.22 초기 MediaLibrary 경로에서도 현재 표출 건수를 progress에 반영해 사용자에게 로드 상태를 보여주기 위해 추가 by June */
      void refreshFilterProgress(
        {
          dateStart: oneYearAgo,
          dateEnd: new Date(),
          timeStart: 0,
          timeEnd: 1439,
          countries: [],
          cities: [],
        },
        initial.length
      );
      setEndCursor(result.endCursor ?? null);
      setHasNextPage(result.hasNextPage);
      /* 2026.04.22 MediaLibrary 경로에서는 DB 오프셋 상태가 남아 잘못 append되지 않도록 DB 페이지네이션 상태를 비활성화 by June */
      dbDateTimePagingRef.current = { enabled: false, offset: 0 };
      setDidInitialLoad(true);
  
      // 5. 즉시 백그라운드 로딩 시작
      // setTimeout(() => {
      //   loadMorePhotos({ mode: "background" });
      // }, 0);
  
    } catch (err) {
      console.log("initial load error:", err);
    } finally {
      /* 2026.04.22 초기 로드 전체 시간을 경로/결과건수와 함께 기록해 실제 체감 성능 회귀를 빠르게 탐지하기 위해 계측을 추가 by June */
      recordPerfMetric("home.initial_load.ms", Date.now() - initialLoadStartedAt, {
        context: {
          path: initialLoadPath,
          visibleCount: photosRef.current.length,
          initialHasNextPage,
        },
        logEvery: 1,
      });
      setInitialLoading(false);
      requestInFlightRef.current = false;
      
      /* 2026.04.22 자동 background append 대신 하단 명시적 버튼으로만 다음 페이지를 로드하도록 UX 정책을 변경해 예측 가능한 동작을 제공하기 위해 자동 호출 제거 by June */
    }
  /* 2026.04.15 loadMorePhotos 선언 순서와의 순환 참조를 피하기 위해 의존성 배열에서 제외하고 기존 동작과 동일하게 후속 로딩을 유지하도록 수정 by June */
  }, [oneYearAgo, refreshFilterProgress, tryLoadPhotosFromDbForDateTime]);

  /** 날짜 필터 변경 처리 - 유저가 날짜 변경 시 해당 날짜 조건에 맞는 결과를 찾을 때까지 다시 탐색 */
  const reloadPhotosForFilter = useCallback(async () => {
    if (requestInFlightRef.current) return;
    /* 2026.04.22 필터 변경 시 재검색 총 시간을 계측해 사용자 액션 체감 속도를 p50/p95로 관리하기 위해 타이머를 추가 by June */
    const reloadStartedAt = Date.now();
    /* 2026.04.22 필터 재검색 경로(DB/MediaLibrary)를 로그에서 구분하기 위해 경로 라벨 변수를 추가 by June */
    let reloadPath: "db" | "medialibrary" | "permission_denied" | "skipped" = "skipped";
  
    const ok = await ensurePhotoPermission();
    if (!ok) {
      reloadPath = "permission_denied";
      /* 2026.04.22 권한 거부로 재검색이 중단된 케이스를 성능 로그에 함께 남겨 장애 원인 분리를 돕기 위해 추가 by June */
      recordPerfMetric("home.reload_filter.ms", Date.now() - reloadStartedAt, {
        context: { path: reloadPath },
        logEvery: 1,
      });
      return;
    }
  
    requestInFlightRef.current = true;
    setFilterLoading(true);
    setEmptyMessage(null);
    setPhotos([]);          // 이전 결과 즉시 제거
    setPhotosAll([]);       // 이전 결과 즉시 제거
    /* 2026.04.22 필터 변경 시 이전 상세 URI 캐시를 비워 누적 메모리 증가를 방지하기 위해 초기화 추가 by June */
    setViewerDetailUriMap({});
    /* 2026.04.22 필터 재검색 시작 시 progress를 초기화해 이전 필터 값이 남아 혼동되는 것을 방지하기 위해 추가 by June */
    setProgress({ loaded: 0, total: null });
    setEndCursor(null);     // 새 필터는 처음부터 다시 시작
    setHasNextPage(true);   // 새 필터는 다시 탐색 가능 상태로 초기화
    /* 2026.04.22 필터 변경 시 이전 DB 오프셋이 남아 다음 조회가 어긋나는 문제를 막기 위해 페이지네이션 상태를 먼저 초기화 by June */
    dbDateTimePagingRef.current = { enabled: false, offset: 0 };
  
    try {
      /* 2026.04.15 날짜/시간 필터 테스트를 위해 로케이션 필터 미사용 시 DB 조회를 우선 적용하고, 실패/미적재 시 기존 탐색으로 폴백하기 위해 추가 by June */
      const dbResult = await tryLoadPhotosFromDbForDateTime(
        filter,
        DB_QUERY_LIMIT
      );

      if (dbResult.usedDb) {
        reloadPath = "db";
        /* 2026.04.22 날짜/시간 DB 리로드에서는 썸네일 리스트 경량화를 위해 위치 보강/URI 정규화를 생략하고 메타데이터만 즉시 반영하도록 변경 by June */
        const dbPhotos = dbResult.photos.slice(0, FILTER_RESET_TARGET_COUNT);
        setPhotos(dbPhotos);
        setPhotosAll(dbPhotos);
        /* 2026.04.22 DB 필터 결과 반영 직후 표출/전체 건수를 업데이트해 프로그레스바에 현재 진행을 명확히 표시하기 위해 추가 by June */
        void refreshFilterProgress(filter, dbPhotos.length);
        setEndCursor(null);
        /* 2026.04.22 필터 DB 결과에도 남은 페이지 여부를 반영해 스크롤 추가 로딩이 가능하도록 수정 by June */
        setHasNextPage(dbResult.dbHasMore);
        /* 2026.04.22 다음 append에서 이어받을 DB 오프셋을 저장해 동일 필터 범위를 끝까지 탐색할 수 있도록 추가 by June */
        dbDateTimePagingRef.current = {
          enabled: dbResult.dbHasMore,
          offset: dbResult.nextOffset,
        };

        if (dbPhotos.length === 0) {
          setEmptyMessage(EMPTY_DEFAULT_MESSAGE);
        } else {
          setEmptyMessage(null);
        }

        /* 2026.04.15 DB 조회를 사용하더라도 백그라운드 동기화는 계속 진행해 데이터 최신성을 유지하기 위해 추가 by June */
        void triggerPhotoMetadataSync();
        return;
      }

      /* 2026.04.22 DB 미사용 시 MediaLibrary 경로로 분기됨을 계측 로그에서 명확히 하기 위해 경로 라벨을 설정 by June */
      reloadPath = "medialibrary";
      const result = await collectPhotosForTarget({
        currentFilter: filter,
        targetCount: FILTER_RESET_TARGET_COUNT,
        startCursor: null,
        mode: "filter-reset",
      });
  
      const sorted = sortPhotosForDisplay(
        dedupePhotosByUri(result.photos)
      );
  
      setPhotos(sorted);
      setPhotosAll(sorted);
      /* 2026.04.22 MediaLibrary 경로에서도 현재 필터의 표출/전체 건수를 동기화해 append 전 진행률 기준을 맞추기 위해 추가 by June */
      void refreshFilterProgress(filter, sorted.length);
      setEndCursor(result.endCursor);
      setHasNextPage(result.hasNextPage);
      /* 2026.04.22 MediaLibrary 분기로 전환된 경우 DB 페이지네이션 상태를 끄고 커서 기반 append만 사용하도록 정리 by June */
      dbDateTimePagingRef.current = { enabled: false, offset: 0 };
  
      if (sorted.length === 0) {
        setEmptyMessage(EMPTY_DEFAULT_MESSAGE);
      } else {
        setEmptyMessage(null);
        /* 2026.04.22 필터 재조회 후 자동 background 로딩을 제거하고 사용자가 하단 버튼으로 명시적으로 추가 로드를 선택하도록 변경 by June */
      }
    } catch (err) {
      console.log("reload error:", err);
      /* 2026.04.22 필터 재조회 실패 알럿을 다국어 키로 전환해 비영어권 사용자도 즉시 원인을 이해할 수 있도록 수정 by June */
      Alert.alert(
        t("errorTitle", "Error"),
        t("reloadPhotosError", "There was a problem while reloading photos.")
      );
    } finally {
      /* 2026.04.22 필터 재검색 시간을 경로/결과건수와 함께 기록해 긴 기간 필터 성능 회귀를 빠르게 검출하기 위해 계측을 추가 by June */
      recordPerfMetric("home.reload_filter.ms", Date.now() - reloadStartedAt, {
        context: {
          path: reloadPath,
          visibleCount: photosRef.current.length,
          hasNextPage,
        },
        logEvery: 1,
      });
      setFilterLoading(false);
      requestInFlightRef.current = false;
    }
  }, [filter, refreshFilterProgress, t, tryLoadPhotosFromDbForDateTime, triggerPhotoMetadataSync]);

  /** append/background 공용 로드 처리 */
  const loadMorePhotos = useCallback(
    async ({ mode }: { mode: "background" | "append" }) => {
      /* 2026.04.22 append/background 추가 로딩 시간을 계측해 스크롤 체감 지연을 p50/p95로 확인하기 위해 타이머를 추가 by June */
      const loadMoreStartedAt = Date.now();
      /* 2026.04.22 loadMore 경로에서 예외가 Promise rejection으로 전파되며 앱이 중단되는 문제를 막기 위해 전체 흐름을 try/catch로 감싸 안전화 by June */
      let acquiredInFlight = false;
      try {
        if (requestInFlightRef.current) return;
        if (filterLoading) return;
        if (!hasNextPage) return;

        const ok = await ensurePhotoPermission();
        if (!ok) {
          /* 2026.04.22 권한 미허용으로 추가 로딩이 중단된 케이스를 별도 계측해 운영 로그 해석 정확도를 높이기 위해 추가 by June */
          recordPerfMetric("home.load_more.ms", Date.now() - loadMoreStartedAt, {
            context: { mode, permission: "denied" },
            logEvery: 1,
          });
          return;
        }

        requestInFlightRef.current = true;
        acquiredInFlight = true;

        if (mode === "append") {
          setAppendLoading(true);
        } else {
          setBackgroundLoading(true);
        }

        /* 2026.04.22 위치 필터 미사용 + DB 경로 활성 상태에서는 MediaLibrary 대신 DB 페이지네이션 append를 우선 사용해 날짜 범위 전체를 순차 노출하기 위해 분기 추가 by June */
        const shouldUseDbDateTimePaging =
          dbDateTimePagingRef.current.enabled &&
          filter.countries.length === 0 &&
          filter.cities.length === 0;

        if (shouldUseDbDateTimePaging) {
          const dbOffset = dbDateTimePagingRef.current.offset;
          const dbResult = await tryLoadPhotosFromDbForDateTime(
            filter,
            APPEND_TARGET_COUNT,
            dbOffset
          );

          if (dbResult.usedDb) {
            /* 2026.04.22 append 결과가 0건이면 같은 offset 재요청 루프가 발생해 스크롤 시 과부하/종료로 이어질 수 있어 즉시 페이지네이션을 종료하도록 가드 추가 by June */
            if (dbResult.photos.length === 0) {
              setHasNextPage(false);
              dbDateTimePagingRef.current = { enabled: false, offset: dbOffset };
              return;
            }

            const merged = dedupePhotosByUri([
              ...photosRef.current,
              /* 2026.04.22 DB append에서도 원본 URI를 유지해 대량 localUri 변환 누적으로 인한 메모리 증가를 억제하기 위해 변경 by June */
              ...dbResult.photos,
            ]);
            const sorted = sortPhotosForDisplay(merged);

            setPhotos(sorted);
            setPhotosAll(sorted);
            /* 2026.04.22 DB append로 사진이 추가될 때마다 프로그레스바의 표출/전체 건수를 즉시 갱신하기 위해 추가 by June */
            void refreshFilterProgress(filter, sorted.length);
            setEndCursor(null);
            setHasNextPage(dbResult.dbHasMore);
            /* 2026.04.22 다음 append 기준점을 일관되게 유지하기 위해 DB 페이지네이션 오프셋/활성 상태를 즉시 갱신 by June */
            dbDateTimePagingRef.current = {
              enabled: dbResult.dbHasMore,
              offset: dbResult.nextOffset,
            };
            return;
          }

          /* 2026.04.22 DB append 분기 실패 시 무한 재시도 루프를 피하고 MediaLibrary 폴백이 가능하도록 DB 페이지네이션을 비활성화 by June */
          dbDateTimePagingRef.current = { enabled: false, offset: 0 };
        }

        const result = await collectPhotosForTarget({
          currentFilter: filter,
          targetCount: APPEND_TARGET_COUNT,
          startCursor: endCursor,
          mode,
        });
  
        const merged = dedupePhotosByUri([...photosRef.current, ...result.photos]);
        const sorted = sortPhotosForDisplay(merged);

        setPhotos(sorted);
        setPhotosAll(sorted);
        /* 2026.04.22 MediaLibrary append에서도 누적 표출 건수를 프로그레스바에 반영해 사용자 체감 진행률을 맞추기 위해 추가 by June */
        void refreshFilterProgress(filter, sorted.length);
        setEndCursor(result.endCursor);
        setHasNextPage(result.hasNextPage);
        /* 2026.04.22 MediaLibrary append 경로로 처리된 경우 DB 페이지네이션 상태를 비활성화해 분기 혼선을 방지하기 위해 정리 by June */
        dbDateTimePagingRef.current = { enabled: false, offset: 0 };
      } catch (err) {
        /* 2026.04.22 loadMore 예외를 여기서 흡수해 스크롤 이벤트 핸들러의 unhandled rejection 크래시를 방지하기 위해 로그 처리 by June */
        console.log("load more error:", err);
      } finally {
        /* 2026.04.22 추가 로딩 소요 시간을 모드/현재 노출건수와 함께 기록해 append 성능 튜닝 지표를 확보하기 위해 계측을 추가 by June */
        recordPerfMetric("home.load_more.ms", Date.now() - loadMoreStartedAt, {
          context: {
            mode,
            visibleCount: photosRef.current.length,
            hasNextPage,
          },
          logEvery: 2,
        });
        /* 2026.04.22 실제 loadMore가 시작된 경우에만 로딩 상태와 inFlight 잠금을 해제해 상태 불일치를 방지하기 위해 조건 가드 추가 by June */
        if (acquiredInFlight) {
          if (mode === "append") {
            setAppendLoading(false);
          } else {
            setBackgroundLoading(false);
          }
          requestInFlightRef.current = false;
        }
      }
    },
    [APPEND_TARGET_COUNT, endCursor, filter, filterLoading, hasNextPage, refreshFilterProgress, sortPhotosForDisplay, tryLoadPhotosFromDbForDateTime]
  );
  /** 2026.03.26 By June END */

  const PAGE_SIZE = 50;
  const { dateStart, dateEnd, timeStart, timeEnd, countries, cities } = filter;

  const loadCountRef = useRef(0);
  /* 2026.04.22 All Dates 프리셋 시작일을 실제 최저 촬영일로 바꾸기 위해 DateTimeFilter에서 호출할 최소 날짜 resolver를 추가 by June */
  const resolveOldestPhotoDate = useCallback(async () => {
    try {
      /* 2026.04.22 전체 라이브러리 기준 신뢰도를 확보하기 위해 DB 최소 촬영일을 1순위로 조회하도록 추가 by June */
      const oldestTakenAt = await getOldestPhotoTakenAt();
      if (oldestTakenAt && Number.isFinite(oldestTakenAt)) {
        return new Date(oldestTakenAt);
      }
    } catch (error) {
      /* 2026.04.22 DB 조회 실패 시에도 All Dates 기능이 동작하도록 로컬 fallback으로 이어가기 위해 오류를 로그만 남기고 흡수 by June */
      console.log("resolve oldest photo date from db error:", error);
    }

    /* 2026.04.22 DB 미적재 초기 구간을 대비해 현재 메모리에 로드된 사진에서도 최소 날짜를 계산하는 fallback을 추가 by June */
    let minTakenAt: number | null = null;
    for (const photo of photosRef.current) {
      if (!photo.takenAt || !Number.isFinite(photo.takenAt)) continue;
      if (minTakenAt === null || photo.takenAt < minTakenAt) {
        minTakenAt = photo.takenAt;
      }
    }
    return minTakenAt ? new Date(minTakenAt) : null;
  }, []);

  const loadPhotos = useCallback(
    async ({ reset = false }: { reset?: boolean } = {}) => {

      // 딜레이 처리 제대로 되는지 테스트 START
      loadCountRef.current += 1;
      console.log(`[LOAD #${loadCountRef.current}]`, new Date().toISOString());
      // 딜레이 처리 제대로 되는지 테스트 END

      // 1) 권한 확인
      const { status, canAskAgain } = await MediaLibrary.getPermissionsAsync();

      let hasPerm = status === "granted";

      if (!hasPerm && canAskAgain) {
        const req = await MediaLibrary.requestPermissionsAsync(false);
        hasPerm = req.status === "granted";
      }

      if (!hasPerm) {
        /* 2026.04.22 구 로딩 경로의 권한 알럿도 다국어 처리해 예외 경로에서 언어가 섞이지 않도록 수정 by June */
        Alert.alert(
          t("permissionRequiredTitle", "Permission Required"),
          t("photoPermissionRequired", "Photo access permission is required.")
        );
        return;
      } else {
        console.log("Access permit OK");
      }
  
      // 2) 중복 호출 / 페이지 끝 체크
      if (loading) return;
      if (!reset && !hasNextPage) return;
  
      setLoading(true);
  
      try {
        // 3) 한 페이지 가져오기
        const result = await MediaLibrary.getAssetsAsync({
          first: PAGE_SIZE,
          mediaType: MediaLibrary.MediaType.photo,
          after: reset ? undefined : endCursor ?? undefined,
          sortBy: [MediaLibrary.SortBy.creationTime],
        });
  
				updateTotalPhotos(result.totalCount ?? 0);
				console.log("PHOTO COUNT:", photosAll.length);
        const assets = result.assets ?? [];

        // 4) 날짜/시간 필터
        const filtered = assets.filter((a) => {
          const created =
            a.creationTime && a.creationTime > 0 ? a.creationTime : null;

          const modified =
            a.modificationTime && a.modificationTime > 0
              ? a.modificationTime
              : null;

          const tsMs = created ?? modified;

          console.log(
            "creation:",
            a.creationTime,
            "mod:",
            a.modificationTime,
            "tsMs:",
            tsMs
          );

          // 1) 진짜로 둘 다 없으면 어떻게 할지 정책
          if (!tsMs) {
            // A. 날짜 모르는 애는 아예 빼고 싶으면:
            // return false;

            // B. 일단은 보여주고 싶으면:
            return true;
          }

          if (tsMs < dayStartMs(dateStart) || tsMs >= dayEndNextMs(dateEnd)) {
            return false;
          }
  
          return inTimeWindow(tsMs, timeStart, timeEnd);
        });

        console.log("filtered length:::", filtered.length);

        // 5) 상세 정보 + 위치 포함해서 Photo로 매핑
        const baseInfos: Photo[] = await Promise.all(
          filtered.map(async (a) => {
            try {
              const info = await MediaLibrary.getAssetInfoAsync(a.id);
              const uri = true ? info.localUri ?? info.uri : info.uri;

              return {
                uri,
                takenAt: info.creationTime ?? a.creationTime ?? null,
                location: info.location
                  ? {
                      latitude: Number(info.location.latitude),
                      longitude: Number(info.location.longitude),
                    }
                  : null,
              };
            } catch (e) {
              // 실패 시에도 최소한 안 죽게
              return {
                uri: a.uri,
                takenAt: a.creationTime ?? null,
                location: (a as any).location
                  ? {
                      latitude: Number((a as any).location.latitude),
                      longitude: Number((a as any).location.longitude),
                    }
                  : null,
              };
            }
          })
        );

        console.log("photos.length 1: ", photos.length);

        // 6) 위치 정보 기반으로 country/city 붙이기
        const withPlaces = await imagesWithLocation(baseInfos, {
          maxLookups: 60,
          precision: 2,
          delayMs: 150,
        });
        const filteredWithLocation = withPlaces.filter((photo) => {
          if (countries.length === 0 && cities.length === 0) {
            return true;
          }
          if (cities.length > 0) {
            return cities.includes(photo.city ?? "");
          }
          return countries.includes(photo.country ?? "");
        });
        // 7) 상태 업데이트
        setPhotos((prev) => {
          const merged = reset
            ? filteredWithLocation
            : [...prev, ...filteredWithLocation];
        
          return sortPhotosByTakenAtAsc(merged);
        });
        setEndCursor(result.endCursor ?? null);
        setHasNextPage(result.hasNextPage);
      } catch (err) {
        console.log("MediaLibrary 오류:", err);
        /* 2026.04.22 사진 로드 실패 알럿을 다국어로 통일해 오류 메시지 현지화 누락을 방지하기 위해 수정 by June */
        Alert.alert(
          t("errorTitle", "Error"),
          t("loadPhotosError", "There was a problem while loading photos.")
        );
      } finally {
        setLoading(false);
      }
    },
    [loading, hasNextPage, endCursor, filter, t]
  );

  /** 2026.03.26 by June */
  const loadPhotosForFilterReset = useCallback(async () => {
    if (loading) return;
  
    const { status, canAskAgain } = await MediaLibrary.getPermissionsAsync();
  
    let hasPerm = status === "granted";
  
    if (!hasPerm && canAskAgain) {
      const req = await MediaLibrary.requestPermissionsAsync(false);
      hasPerm = req.status === "granted";
    }
  
    if (!hasPerm) {
      /* 2026.04.22 필터 리셋 경로의 권한 알럿을 다국어 처리해 분기별 메시지 편차를 제거하기 위해 수정 by June */
      Alert.alert(
        t("permissionRequiredTitle", "Permission Required"),
        t("photoPermissionRequired", "Photo access permission is required.")
      );
      return;
    }
  
    setLoading(true);
  
    try {
      let cursor: string | undefined = undefined;
      let nextPage = true;
      let collected: Photo[] = [];
  
      while (nextPage && collected.length < 50) {
        const result = await MediaLibrary.getAssetsAsync({
          first: 50,
          mediaType: MediaLibrary.MediaType.photo,
          after: cursor,
          sortBy: [MediaLibrary.SortBy.creationTime],
        });
  
        updateTotalPhotos(result.totalCount ?? 0);
  
        const assets = result.assets ?? [];
  
        const filtered = assets.filter((a) => {
          const created =
            a.creationTime && a.creationTime > 0 ? a.creationTime : null;
  
          const modified =
            a.modificationTime && a.modificationTime > 0
              ? a.modificationTime
              : null;
  
          const tsMs = created ?? modified;
  
          if (!tsMs) {
            return true;
          }
  
          if (tsMs < dayStartMs(dateStart) || tsMs >= dayEndNextMs(dateEnd)) {
            return false;
          }
  
          return inTimeWindow(tsMs, timeStart, timeEnd);
        });
  
        const baseInfos: Photo[] = await Promise.all(
          filtered.map(async (a) => {
            try {
              const info = await MediaLibrary.getAssetInfoAsync(a.id);
              const uri = info.localUri ?? info.uri;
  
              return {
                uri,
                takenAt: info.creationTime ?? a.creationTime ?? null,
                location: info.location
                  ? {
                      latitude: Number(info.location.latitude),
                      longitude: Number(info.location.longitude),
                    }
                  : null,
              };
            } catch {
              return {
                uri: a.uri,
                takenAt: a.creationTime ?? null,
                location: null,
              };
            }
          })
        );
  
        const withPlaces = await imagesWithLocation(baseInfos, {
          maxLookups: 60,
          precision: 2,
          delayMs: 150,
        });
  
        const filteredWithLocation = withPlaces.filter((photo) => {
          if (countries.length === 0 && cities.length === 0) {
            return true;
          }
          if (cities.length > 0) {
            return cities.includes(photo.city ?? "");
          }
          return countries.includes(photo.country ?? "");
        });
  
        collected = [...collected, ...filteredWithLocation];
  
        cursor = result.endCursor ?? undefined;
        nextPage = result.hasNextPage;
      }
  
      const deduped = Array.from(
        new Map(collected.map((photo) => [photo.uri, photo])).values()
      );
  
      deduped.sort((a, b) => {
        const aHas = typeof a.takenAt === "number" && Number.isFinite(a.takenAt);
        const bHas = typeof b.takenAt === "number" && Number.isFinite(b.takenAt);
  
        if (aHas && bHas) return (a.takenAt as number) - (b.takenAt as number);
        if (aHas && !bHas) return -1;
        if (!aHas && bHas) return 1;
        return 0;
      });
  
      setPhotos(deduped);
      setEndCursor(cursor ?? null);
      setHasNextPage(nextPage);
    } catch (err) {
      console.log("MediaLibrary filter reset error:", err);
      /* 2026.04.22 필터 리셋 실패 알럿도 다국어 키를 사용해 전체 오류 안내 체계를 일관화하기 위해 수정 by June */
      Alert.alert(
        t("errorTitle", "Error"),
        t("reloadPhotosError", "There was a problem while reloading photos.")
      );
    } finally {
      setLoading(false);
    }
  }, [
    loading,
    dateStart,
    dateEnd,
    timeStart,
    timeEnd,
    countries,
    cities,
    t,
  ]);

  /** 2026.03.03 사진 삭제 등으로 데이터 갱신 발생 시 새로고침 관련 추가 By June START */
  const [refreshing, setRefreshing] = useState(false); 
  const lastResumeReloadRef = useRef(0);

  /** 2026.03.26 수정 By June */
  const reloadPhotos = useCallback(async () => {
    /* 2026.04.15 수동/자동 새로고침 시에도 백그라운드 메타데이터 동기화를 함께 수행해 DB 최신성을 유지하기 위해 추가 by June */
    void triggerPhotoMetadataSync();
    await reloadPhotosForFilter();
  }, [reloadPhotosForFilter, triggerPhotoMetadataSync]);

  /** 초기 진입 이펙트 추가 2026.03.26 By June */
  useEffect(() => {
    if (didInitialLoad) return;
    void loadInitialPhotos();
  }, [didInitialLoad, loadInitialPhotos]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
  
      const now = Date.now();
      // iOS에서 active 이벤트가 연달아 튀는 경우가 있어 쿨다운
      if (now - lastResumeReloadRef.current < 1500) return;
      lastResumeReloadRef.current = now;
  
      /* 2026.04.15 앱 복귀 시 새 사진 반영 누락을 줄이기 위해 화면 리로드와 별도로 DB 증분 동기화를 트리거하기 위해 추가 by June */
      void triggerPhotoMetadataSync();
      reloadPhotos();
    });
  
    return () => sub.remove();
  }, [reloadPhotos, triggerPhotoMetadataSync]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await reloadPhotos();
    } finally {
      setRefreshing(false);
    }
  }, [reloadPhotos]);
  /** 2026.03.03 사진 삭제 등으로 데이터 갱신 발생 시 새로고침 관련 추가 By June END */

	// 전체 사진 수 Context 저장
	useEffect(() => {
		if (!loading && photosAll.length > 0) {
			//updateUserData({ totalPhotos: photosAll.length }); --- 2026.01.21 문제 코드 주석처리
		}
	}, [photosAll.length, loading]);
	
  /** 2026.03.26 By June */
  const didMountFilterEffectRef = useRef(false);
  /* 2026.04.15 reload 함수 참조 변경으로 effect가 재발화되는 문제를 막기 위해 최신 함수를 ref로 유지 by June */
  const reloadPhotosForFilterRef = useRef(reloadPhotosForFilter);
  /* 2026.04.15 동일 필터값에서 중복 effect 실행을 막기 위해 마지막 처리 시그니처를 저장 by June */
  const lastHandledFilterSigRef = useRef<string>("");

  /* 2026.04.15 필터 값 기반 시그니처를 사용해 객체 참조 변경과 무관하게 실제 값 변경만 감지하도록 추가 by June */
  const filterSignature = useMemo(() => {
    const countriesSig = [...filter.countries].sort().join(",");
    const citiesSig = [...filter.cities].sort().join(",");
    return [
      filter.dateStart.getTime(),
      filter.dateEnd.getTime(),
      filter.timeStart,
      filter.timeEnd,
      countriesSig,
      citiesSig,
    ].join("|");
  }, [
    filter.dateStart,
    filter.dateEnd,
    filter.timeStart,
    filter.timeEnd,
    filter.countries,
    filter.cities,
  ]);

  /* 2026.04.15 reloadPhotosForFilter의 최신 구현을 ref에 동기화해 effect 의존성 루프 없이 최신 로직을 호출하기 위해 추가 by June */
  useEffect(() => {
    reloadPhotosForFilterRef.current = reloadPhotosForFilter;
  }, [reloadPhotosForFilter]);

  useEffect(() => {
    if (!didMountFilterEffectRef.current) {
      didMountFilterEffectRef.current = true;
      /* 2026.04.15 마운트 직후 현재 시그니처를 기준값으로 저장해 첫 렌더에서 불필요한 카운트 증가를 막기 위해 추가 by June */
      lastHandledFilterSigRef.current = filterSignature;
      return;
    }

    /* 2026.04.15 동일 시그니처 재실행을 차단해 setUserData 기반 무한 루프를 방지하기 위해 가드 추가 by June */
    if (lastHandledFilterSigRef.current === filterSignature) return;
    lastHandledFilterSigRef.current = filterSignature;

    /* 2026.04.15 날짜 사용 여부를 truthy 체크 대신 초기값 비교로 판정해 항상 true가 되는 버그를 수정하기 위해 변경 by June */
    const usedDate =
      filter.dateStart.getTime() !== initialFilterRef.current.dateStart.getTime() ||
      filter.dateEnd.getTime() !== initialFilterRef.current.dateEnd.getTime();
    const usedTime = filter.timeStart !== 0 || filter.timeEnd !== 1439;
    const usedLocation = filter.countries.length > 0 || filter.cities.length > 0;
  
    if (usedDate) incrementDateFilter();
    if (usedTime) incrementTimeFilter();
    if (usedLocation) incrementLocationFilter();
  
    /* 2026.04.15 effect 의존성에 함수 참조를 직접 넣지 않고 ref 호출을 사용해 재귀적 재실행을 방지하기 위해 수정 by June */
    void reloadPhotosForFilterRef.current();
  }, [filterSignature, filter, incrementDateFilter, incrementTimeFilter, incrementLocationFilter]);
  /** 2026.03.26 By June */

  // 썸네일 그리드에 사진 데이터 렌더링
  const renderItem: ListRenderItem<Photo> = ({ item, index }) => {
    // console.log("PHOTO URI >>>", item.uri);
    return (
      <TouchableOpacity
        style={styles.imageContainer}
        activeOpacity={0.9}
        onPress={() => {
          amplitude.track("tap_photo_thumbnail", {
            screen_name: "home",
            photo_index: index,
            photo_count: photosRef.current.length,
          });
          // 뷰어 swipe 카운트 초기화 (열 때마다)
          swipe_count_ref.current = 0;
          swipe_threshold_fired_ref.current = false;

          setViewerIndex(index);
          setViewerVisible(true);
          /* 2026.04.22 상세 보기 진입 시 선택 사진만 고해상도 URI를 비동기 보강해 리스트 전체 메모리 사용 없이 상세 품질을 확보하기 위해 추가 by June */
          void resolveViewerDetailUri(item.uri);
          /* 2026.04.22 좌우 스와이프 첫 체감을 개선하기 위해 인접 1장의 URI도 선행 보강하되 범위를 최소화해 메모리 피크를 제한 by June */
          const next = photosRef.current[index + 1];
          if (next?.uri) {
            void resolveViewerDetailUri(next.uri);
          }
        }}
      >
        {/* <Image source={{ uri: item.uri }} style={styles.thumb} /> */}
        <Image
          source={{ uri: item.uri }}
          style={styles.image}
          resizeMode="cover"
        />
      </TouchableOpacity>
    );
  };

  // 시각(분) 윈도우 판정: timeStart~timeEnd(분), 1439=23:59 처리 포함
  const inTimeWindow = (
    tsMs: string | number | Date,
    timeStart: number,
    timeEnd: number
  ) => {
    const local = new Date(tsMs);
    const mins = local.getHours() * 60 + local.getMinutes();
    if (timeEnd === 1439) return mins >= timeStart && mins <= 1439; // 24:00은 하루 끝까지
    if (timeEnd >= timeStart) return mins >= timeStart && mins <= timeEnd;
    // (필요시) 밤을 가르는 구간도 지원하려면 아래처럼:
    // return mins >= timeStart || mins <= timeEnd;
    return mins >= timeStart && mins <= timeEnd; // 기본: 정상 구간
  };

  /** 2026.03.26 By June */
  const fmtDateTime = (ms: string | number | Date | null | undefined) => {
    /* 2026.04.22 날짜 정보 없음 문구를 다국어 키로 전환해 메타 정보 미존재 케이스도 현지화되도록 수정 by June */
    if (!ms) return t("noDateInfo", "No date info");
  
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return t("noDateInfo", "No date info");
  
    const yyyy = d.getFullYear();
    const MM = `${d.getMonth() + 1}`.padStart(2, "0");
    const DD = `${d.getDate()}`.padStart(2, "0");
    const hh = `${d.getHours()}`.padStart(2, "0");
    const mm = `${d.getMinutes()}`.padStart(2, "0");
    return `${yyyy}/${MM}/${DD} ${hh}:${mm}`;
  };

	const Header = useCallback(() => {
			return (
				<View style={styles.header}>
          {/* 2026.04.22 사진 보기 화면에서도 메인과 동일한 플레이 버튼으로 현재 사진부터 슬라이드쇼를 시작할 수 있도록 헤더 버튼을 추가 by June */}
          <TouchableOpacity
            onPress={handleViewerPlayPress}
            style={styles.viewerHeaderPlaySlot}
            activeOpacity={0.9}
          >
            <LinearGradient
              colors={['#2B7FFF', '#AD46FF']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.playButtonBg}
            >
              <IconPlay width={18} height={18} />
            </LinearGradient>
          </TouchableOpacity>
					<TouchableOpacity
						onPress={() => setViewerVisible(false)}
						style={styles.closeBtn}
					>
						<Text style={styles.closeTxt}>✕</Text>
					</TouchableOpacity>
				</View>
			);
		}, [handleViewerPlayPress]);

  const Footer = useCallback(() => {
    const current = photos[viewerIndex];
    const locationText = /** 2026.03.27 By June */
    current?.city && current?.country
      ? `${current.city}, ${current.country}`
      : current?.country
      ? current.country
      : current?.location
      /* 2026.04.22 위치 보강 중 안내 문구를 다국어 처리해 로딩 상태 텍스트도 언어 설정을 따르도록 수정 by June */
      ? t("loadingLocationInfo", "Loading location info...")
      : "";
		
		const handleShare = async (photoUri: string, message: string) => {
			try {
				const shareOptions: Share.ShareOptions = {
					message,
					url: Platform.OS === 'android' ? `file://${photoUri}` : photoUri,
					type: 'image/jpeg',
				};
				await Share.open(shareOptions);
				} catch (err) {
				// 사용자가 공유하기 취소한 경우
				if (err?.message === 'User did not share') {
					return; // 아무것도 하지 않음
				} 

				console.log(err);
          /* 2026.04.22 공유 실패 알럿을 다국어로 전환해 공유 예외 시에도 언어 일관성을 유지하기 위해 수정 by June */
					Alert.alert(
            t("errorTitle", "Error"),
            t("shareFailedMessage", "Failed to share the photo.")
          );
				}
			};
			
			const onPressShare = async () => {
				if (!current?.uri) return;
        /* 2026.04.22 공유 메시지 prefix를 번역 키로 치환해 공유 텍스트가 선택 언어를 반영하도록 수정 by June */
				const messagePrefix = t("sharePhotoMessagePrefix", "Check out this photo!");
				const message = locationText ? `${messagePrefix} ${locationText}` : messagePrefix;
				await handleShare(current.uri, message);
			};
			
			const handleDelete = () => {
          /* 2026.04.22 삭제 확인 다이얼로그(제목/본문/버튼)를 다국어로 변환해 뷰어 액션 문구를 현지화하기 위해 수정 by June */
					Alert.alert(
						t("deletePhotoTitle", "Delete Photo"),
						t("deletePhotoConfirm", "Are you sure you want to delete this photo?"),
						[
							{ text: t("cancel", "Cancel"), style: "cancel" },
							{
								text: t("delete", "Delete"),
								style: "destructive",
							onPress: () => {
								// photos 배열에서 제거
								setPhotos((prev) =>
									prev.filter((_, idx) => idx !== viewerIndex)
								);
								setViewerVisible(false);
							},
						},
					]
				);
			};
		
    return (
      <View style={styles.footer}>
				{/* 왼쪽: Share 버튼 */}
				<TouchableOpacity onPress={onPressShare}>
					<Ionicons name="share-outline" size={24} color="white" />
				</TouchableOpacity>
				{/* 중앙: 날짜/시간 + 장소 */}
				<View style={styles.headerTextContainer}>
						<Text style={styles.metaTxt}>
							{current ? fmtDateTime(current.takenAt) : ""}
						</Text>
						{locationText ? (
							 <Text style={styles.locationTxt}>{locationText}</Text>
						) : null}
				</View>
				{/* 오른쪽: Delete 버튼 */}
				<TouchableOpacity onPress={handleDelete}>
					<Ionicons name="trash-outline" size={24} color="white" />
				</TouchableOpacity>
      </View>
    );
  }, [photos, t, viewerIndex]);

  const handleLocationChange = (selections: LocationFilterState) => {
    setFilter((prev) => ({ ...prev, ...selections }));
  };

  const handleDateTimeChange = useCallback(
    (selections: Partial<DateTimeFilterState>) => {
      setFilter((prev) => ({
        ...prev,
        ...selections,
      }));
    },
    []
  );

  /* 2026.04.22 썸네일 하단의 명시적 "더 불러오기" 버튼으로만 append를 실행해 자동 스크롤 트리거의 간헐적 동작을 제거하기 위해 버튼 핸들러를 추가 by June */
  const handleManualLoadMorePress = useCallback(() => {
    if (refreshing || filterLoading || appendLoading || initialLoading) return;
    if (!hasNextPage) return;
    void loadMorePhotos({ mode: "append" });
  }, [appendLoading, filterLoading, hasNextPage, initialLoading, loadMorePhotos, refreshing]);

  const handleShowOnMap = () => {
    <View style={styles.mapContainer}>
      <ShowOnMap images={photos} />
    </View>;
    console.log("Show on map, photos: ", photos.length);
  };

  const edges = ["bottom", "left", "right"];
  if (Platform.OS === "ios") {
    edges.push("top"); // iOS는 top 추가해야 UI 안깨짐 
  }
  const safeAreaEdges: Edges = edges as Edges;

  return (
    <LinearGradient
      colors={["#E8F2FF", "#F9F3FF"]} // 연한 하늘색 + 약간 보라 느낌
      style={styles.screen}
    >
    <SafeAreaView style={{ flex: 1 }} edges={safeAreaEdges}>
      <View style={{ flex: 1 }}>
        <View style={styles.topArea}>

          {/* 상단버튼영역 수정 2026.03.18 by June START */}
          <View style={styles.topButtonsRow}>
            {/* 왼쪽 여백 */}
            <View style={styles.topLeftSpace} />

            {/* 오른쪽 버튼 그룹 */}
            <View style={styles.topButtonsGroup}>
              {/* Play 버튼 */}
              <TouchableOpacity
                style={styles.playButtonSlot}
                onPress={() => (slideshowOn ? handleCloseSlideshow() : handleSlideshow())}
                activeOpacity={0.9}
              >
                <LinearGradient
                  colors={['#2B7FFF', '#AD46FF']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.playButtonBg}
                >
                  <IconPlay width={18} height={18} />
                </LinearGradient>
              </TouchableOpacity>

              {/* Map 버튼 */}
              <TouchableOpacity
                style={styles.mapButtonSlot}
                activeOpacity={0.9}
              >
                <ShowOnMap images={photos} />
              </TouchableOpacity>

              {/* Settings 버튼 */}
              <TouchableOpacity
                onPress={() => router.push('/settings')}
                activeOpacity={0.7}
                style={styles.settingsButtonSlot}
              >
                <Ionicons name="settings-outline" size={20} color="#374151" />
              </TouchableOpacity>
            </View>
          </View>
          {/* 상단버튼영역 수정 2026.03.18 by June END */}
            
          {/* 썸네일 그리드 START */}
          <View style={styles.gridWrap}>
            <FlatList<Photo>
              style={{ flex: 1 }} // 리스트가 남은 세로 공간을 다 차지
              data={photos}
              numColumns={numColumns}
              /* 2026.04.22 index key 사용 시 append/재정렬 구간에서 셀 재생성이 과도해져 스크롤 안정성이 저하될 수 있어 URI 우선 key로 변경 by June */
              keyExtractor={(item, i) => item.uri || i.toString()}
              renderItem={renderItem}
              /* 2026.04.22 대량 사진 스크롤 시 메모리 사용량을 낮춰 OS 강제 종료 가능성을 줄이기 위해 FlatList 배치 렌더 파라미터를 최적화 by June */
              initialNumToRender={25}
              maxToRenderPerBatch={20}
              windowSize={7}
              removeClippedSubviews
              refreshing={refreshing} // 2026.03.03 June 추가
              onRefresh={onRefresh}   // 2026.03.03 June 추가
              contentContainerStyle={{
                paddingHorizontal: horizontalPadding,
                padding: 8,
                flexGrow: 1, // 아이템 0개여도 높이 채우기
                backgroundColor: "#FFF",
                borderRadius: 10,
              }}
              ListEmptyComponent={
                (!initialLoading && !filterLoading && !appendLoading && !isScanning && !error) ? (
                  <View style={styles.emptyWrap}>
                    <Text style={styles.emptyTitle}>
                      {emptyMessage ?? EMPTY_DEFAULT_MESSAGE}
                    </Text>
                    {emptyMessage !== EMPTY_RECENT_3Y_MESSAGE ? (
                      <Text style={styles.emptyDesc}>{EMPTY_DEFAULT_DESC}</Text>
                    ) : null}
                  </View>
                ) : null
              }
              onEndReachedThreshold={0.4}
              onEndReached={() => {
                /* 2026.04.22 간헐적으로 동작하는 자동 무한스크롤 트리거를 완전히 비활성화하고 하단 명시 버튼만 사용하도록 변경 by June */
                return;
              }}
              ListFooterComponent={
                /* 2026.04.22 썸네일 하단에 명시적 더 불러오기 CTA를 제공해 사용자가 다음 페이지 로딩 시점을 직접 제어할 수 있도록 UI를 추가 by June */
                !initialLoading && !filterLoading ? (
                  <View style={{ paddingVertical: 12, alignItems: "center" }}>
                    {appendLoading || backgroundLoading ? (
                      <View style={{ alignItems: "center", gap: 8 }}>
                        <ActivityIndicator />
                        <Text style={styles.loadingSubText}>
                          {t("loadingMorePhotos", "Loading more photos...")}
                        </Text>
                      </View>
                    ) : hasNextPage ? (
                      <TouchableOpacity
                        style={styles.loadMoreButton}
                        activeOpacity={0.85}
                        onPress={handleManualLoadMorePress}
                      >
                        {/* 2026.04.22 하단 더 불러오기 버튼도 앱 전반의 CTA 톤앤매너와 일치시키기 위해 블루-퍼플 그라디언트 배경으로 변경 by June */}
                        <LinearGradient
                          colors={["#2B7FFF", "#AD46FF"]}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 0 }}
                          style={styles.loadMoreButtonGradient}
                        >
                          <Text style={styles.loadMoreButtonText}>
                            {t("loadMorePhotos", "Load more photos")}
                          </Text>
                        </LinearGradient>
                      </TouchableOpacity>
                    ) : (
                      <Text style={styles.loadingSubText}>
                        {t("allFilteredPhotosLoaded", "All filtered photos are loaded")}
                      </Text>
                    )}
                    <Text style={styles.loadMoreProgressText}>
                      {/* 2026.04.22 필터 기준 표출/총 건수 안내 위치를 로딩 오버레이에서 하단 CTA 영역으로 이동해 사용자가 현재 로드 진행을 항상 확인할 수 있도록 수정 by June */}
                      {progress.total !== null
                        ? `${t("filteredPhotos", "Filtered photos")}: ${progress.loaded.toLocaleString()} / ${progress.total.toLocaleString()}`
                        : `${t("filteredPhotos", "Filtered photos")}: ${progress.loaded.toLocaleString()}`}
                    </Text>
                  </View>
                ) : null
              }
              /* 2026.04.22 자동 무한스크롤 관련 상태 제거에 맞춰 onLayout/onContentSizeChange 기반 보조 로직을 정리해 렌더 비용을 줄이기 위해 제거 by June */
              onScroll={({ nativeEvent }) => {
                const y = nativeEvent.contentOffset.y;
                /* 2026.04.22 상단 당김(y<=-60) 구간은 onRefresh와 역할이 겹치고 append 경쟁으로 앱 크래시를 유발해 해당 경로를 비활성화 by June */
                if (y <= -60) {
                  return;
                }
              }}
              scrollEventThrottle={16}
            />
            {/* 썸네일 그리드 END */}
            {/** Progress bar START */}
            {initialLoading || filterLoading || appendLoading || isScanning ? ( // 2026.03.27 By June
              <View style={styles.gridOverlay} pointerEvents="auto">
                <View style={styles.loadingBox}>
                  <ActivityIndicator size="large" />
                  <Text style={styles.loadingText}>
                    {/* 2026.04.22 로딩 오버레이 문구를 다국어 키 기반으로 전환해 진행 상태 텍스트 현지화를 적용하기 위해 수정 by June */}
                    {t("loadingPhotos", "Loading photos...")}
                  </Text>
                  <Text style={styles.loadingSubText}>
                    {`${t("photoIndexing", "Photo indexing")}: ${indexingProgress.photoIndexed.toLocaleString()} (${indexingProgress.isPhotoIndexing ? t("syncing", "syncing") : t("complete", "complete")})`}
                  </Text>
                  <Text style={styles.loadingSubText}>
                    {`${t("geocodeCache", "Geocode cache")}: ${indexingProgress.geocodeCached.toLocaleString()} / ${t("queue", "Queue")}: ${indexingProgress.geocodePending.toLocaleString()}`}
                  </Text>
                </View>
              </View>
            ) : error ? (
              <View style={styles.centerContainer}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : (
              <>
                <Modal visible={!!selectedImage} animationType="slide">
                  <Image
                    source={{ uri: selectedImage || "" }}
                    style={{
                      flex: 1,
                      width: "100%",
                      height: "100%",
                      resizeMode: "contain",
                    }}
                  />
                  <View style={{ position: "absolute", top: 40, left: 20 }}>
                    <Button title="Close" onPress={() => setSelectedImage(null)} />
                  </View>
                </Modal>
              </>
            )}
            {/** Progress bar END */}
          </View>
          
        </View>
        <View style={styles.bottomArea}>
            <DateTimeFilter
              onChange={handleDateTimeChange}
              photos={photos}
              /* 2026.04.22 DateTimeFilter의 All Dates 프리셋이 DB 최소 날짜를 사용하도록 resolver prop을 연결하기 위해 추가 by June */
              resolveOldestPhotoDate={resolveOldestPhotoDate}
              onLocationChange={handleLocationChange}
            />
          </View>
      </View>
    
      {/* 전체화면 이미지 뷰어 (핀치줌/스와이프)
      <ImageViewing
        //images={photos.map(p => ({ uri: p.uri }))}
        onImageIndexChange={(i: number) => {
          viewerIndexRef.current = i;  // 화면 재렌더 없이 최신 index만 기억
        }}
        images={viewerImages}
        imageIndex={viewerIndex}
        visible={viewerVisible}
        onRequestClose={closeViewer}
        //onImageIndexChange={(i: number) => setViewerIndex(i)} // ← 추가
        // 선택: 상단 닫기버튼(간단한 헤더)
        HeaderComponent={Header}
        // 선택: 바닥 여백(제스처 충돌 완화)
        backgroundColor="rgba(0,0,0,0.98)"
        swipeToCloseEnabled={false} // ← 스와이프 제스처가 터치 선점하는 것 방지
        doubleTapToZoomEnabled
      /> */}
      {/* 전체화면 이미지 뷰어 (핀치줌/스와이프) */}
      <ImageViewing
        //images={photos.map(p => ({ uri: p.uri }))}
        onImageIndexChange={(i: number) => {
          // 기존
          viewerIndexRef.current = i;
        
          // swipe count 증가 (첫 진입은 0->선택 index로 이미 열리니, 변경 이벤트만 카운트)
          swipe_count_ref.current += 1;
        
          if (!swipe_threshold_fired_ref.current && swipe_count_ref.current >= SWIPE_THRESHOLD) {
            swipe_threshold_fired_ref.current = true;
        
            const dwell_ms = Date.now() - home_view_start_ms_ref.current;
        
            amplitude.track("photo_swipe_threshold_reached", {
              screen_name: "home",
              threshold: SWIPE_THRESHOLD,
              swipe_count: swipe_count_ref.current,
              current_index: i,
              dwell_ms,
            });
          }
        }}
        images={viewerImages}
        imageIndex={viewerIndex}
        visible={viewerVisible}
        onRequestClose={closeViewer}
        //onImageIndexChange={(i: number) => setViewerIndex(i)} // ← 추가
        // 선택: 상단 닫기버튼(간단한 헤더)
        HeaderComponent={Header}
        // 선택: 바닥 여백(제스처 충돌 완화)
        backgroundColor="rgba(0,0,0,0.98)"
        swipeToCloseEnabled={false} // ← 스와이프 제스처가 터치 선점하는 것 방지
        doubleTapToZoomEnabled

				FooterComponent={Footer}
      />

      <Modal visible={slideshowVisible} animationType="fade">
        <SafeAreaView style={{ flex: 1, backgroundColor: "black" }}>
          <FlatList
            ref={(r) => {slideshowListRef.current = r;}}
            data={viewerImages} // { uri } 배열 이미 있음
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            keyExtractor={(_, i) => i.toString()}
            initialScrollIndex={viewerIndex}
            getItemLayout={(_, index) => ({
              length: screenWidth,
              offset: screenWidth * index,
              index,
            })}
            renderItem={({ item }) => (
              <TouchableOpacity
                activeOpacity={1}
                onPress={handleCloseSlideshow}
                style={{ width: screenWidth, height: "100%" }}
              >
                <Image
                  source={{ uri: item.uri }}
                  style={{ width: screenWidth, height: "100%" }}
                  resizeMode="contain"
                />
              </TouchableOpacity>
            )}
          />

          {/* 닫기 버튼 */}
          <TouchableOpacity
            onPress={handleCloseSlideshow}
            style={{ position: "absolute", top: 20, right: 16, padding: 10 }}
          >
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: 20,
    ...Platform.select({
      // ios: { paddingTop: 20 },
      android: { paddingTop: 50 },
    }),
  },
  main: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 24,
  },
  topArea: {
    flex: 1, // 남은 공간 다 차지
    // 여기 안에서 썸네일 카드에 shadow, radius 등 주면 됨
    paddingBottom: 12, // 밑 여백
  },
  bottomArea: {
    //paddingBottom: 15,    // 밑 여백
    ...Platform.select({
      ios: { paddingBottom: 10 },
      android: { paddingBottom: 20 },
    }),
    paddingTop: 8,
  },
  // topButtonsRow: {
  //   flexDirection: 'row',
  //   alignItems: 'center',
  //   justifyContent: 'flex-start',
  //   marginBottom: 16,
  //   paddingLeft: 20,
  // },
  topButtonsLeftSpacer: {
    width: 50, // TOBE 보면서 24~40 사이로 미세조정
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    //elevation: 6,
  },

  // 메인 파란 버튼
  primaryButton: {
    // width: 128,
    // height: 44,
    // marginRight: 5,
    // flexDirection: "row",
    // alignItems: "center",
    // justifyContent: "center",
    //borderRadius: 16,
    //shadowColor: "#2563EB",
    //shadowOpacity: 0.25,
    //shadowRadius: 10,
    //shadowOffset: { width: 0, height: 6 },
    //elevation: 4,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  // 흰색 보조 버튼
  secondaryButton: {
    // width: 168,
    // height: 44,
    // marginRight: 5,
    // flexDirection: 'row',
    // alignItems: 'center',
    // justifyContent: 'center',
    // borderRadius: 16,
    // backgroundColor: "#FFFFFF",
    // shadowColor: "#000",
    // shadowOpacity: 0.1,
    // shadowRadius: 16,
    // shadowOffset: { width: 0, height: 8 },
    // elevation: 6,
  },

  secondaryButtonText: {
    color: "#111827",
    fontSize: 14,
    fontWeight: "600",
  },
  filtersSection: {
    marginTop: 16,
  },
  container: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-start",
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  imageContainer: {
    width: imageWidth,
    margin: imageMargin,
  },
  image: {
    width: "100%",
    aspectRatio: 1,
    height: imageWidth,
    borderRadius: 10,
    // 살짝 떠 있는 느낌
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 10 },
  },
  errorText: {
    color: "red",
    textAlign: "center",
    fontSize: 16,
  },
  mapContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 20,
  },
  header: {
    position: "absolute",
    top: 44, // 노치 고려해서 여백
    left: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  /* 2026.04.22 이미지 뷰어 헤더의 Play 버튼 영역을 메인 버튼과 유사한 비율로 노출하기 위해 전용 슬롯 스타일을 추가 by June */
  viewerHeaderPlaySlot: {
    width: 56,
    height: 40,
    justifyContent: "center",
  },
  counter: { color: "#fff", fontSize: 16, fontWeight: "600" },
  metaTxt: { color: "#fff", fontSize: 14, fontWeight: "600" },
	locationTxt: { color: "#fff", fontSize: 14, fontWeight: "600", marginTop: 2 },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(173, 70, 255, 0.18)",
    borderWidth: 1,
    borderColor: "rgba(173, 70, 255, 0.55)",
  },
  closeTxt: {
    color: "#C084FC",
    fontSize: 18,
    fontWeight: "700",
  },
	headerTextContainer: {
		flexDirection: "column",
		alignItems: "center",
		flexShrink: 1, // 긴 텍스트도 잘림
		marginHorizontal: 8,
	},
	footer: {
		 flexDirection: "row",
		 justifyContent: "space-between",
		 alignItems: "center",
		 paddingHorizontal: 16,
		 paddingVertical: 10,
		 backgroundColor: "rgba(0,0,0,0.6)",
		 position: "absolute",
		 bottom: 0,
		 width: "100%",
		 zIndex: 20, // zIndex 높여서 이미지 위로
		 minHeight: 60, // 충분한 높이 지정
	},
  thumbnailCard: {
    backgroundColor: '#FFFFFF',   // 내부 흰색
    borderRadius: 32, // 모서리 둥글게
    padding: 12,
    marginTop: 12,
    // 살짝 떠 있는 느낌
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6, // Android
  },
  gridWrap: {
    flex: 1,
    position: "relative", // overlay 기준점
  },

  gridOverlay: {
    ...StyleSheet.absoluteFillObject, // gridWrap 전체 덮음
    backgroundColor: "rgba(0,0,0,0.25)", // 딤처리
    justifyContent: "center",
    alignItems: "center",
    zIndex: 999,
    // 안드에서 가끔 zIndex만으로 부족하면:
    elevation: 10,
  },

  loadingBox: {
    minWidth: 220,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.90)", // 박스는 살짝만 불투명
    alignItems: "center",
  },

  loadingText: {
    marginTop: 10,
    fontSize: 14,
    color: "#111",
  },
  loadingSubText: {
    marginTop: 4,
    fontSize: 12,
    color: "#374151",
  },
  loadMoreButton: {
    /* 2026.04.22 그라디언트 버튼 컨테이너의 모서리와 오버플로우를 고정해 기존 CTA와 동일한 카드형 모양을 유지하기 위해 스타일 분리 by June */
    borderRadius: 10,
    overflow: "hidden",
  },
  loadMoreButtonGradient: {
    /* 2026.04.22 그라디언트 실제 영역의 패딩을 별도 스타일로 분리해 버튼 터치 영역과 시각 영역을 명확히 맞추기 위해 추가 by June */
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  loadMoreButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  loadMoreProgressText: {
    marginTop: 8,
    fontSize: 12,
    color: "#374151",
  },

  gridWrapCard: {
    flex: 1,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 12,
    backgroundColor: "#FFF",
    borderRadius: 10,
    overflow: "hidden", // radius 안 깨지게
    position: "relative",
  },

  emptyWrap: {
    flex: 1, // contentContainerStyle flexGrow:1 와 세트
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: "#111", marginBottom: 6 },
  emptyDesc: { fontSize: 13, color: "#666", textAlign: "center", lineHeight: 18 },

  croppedButtonWrap: {
    //width: 128,
    height: 60,
    overflow: 'hidden',
    //borderRadius: 16,
    //marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  croppedButtonImage: {
    width: '100%',
    height: 56,          // 원본보다 더 크게 잡고
    transform: [{ translateY: -6 }], // 아래 여백 잘라내기
  },

  /** 2026.03.18 Add by June */
  topButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    width: '100%',
  },
  
  topLeftSpace: {
    flex: 3, // 30%
  },
  
  topButtonsGroup: {
    flex: 7, // 70%
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  
  playButtonSlot: {
    flex: 3, // 30
    height: 38,
    marginRight: 5,
    justifyContent: 'center',
  },
  
  mapButtonSlot: {
    flex: 3, // 30
    height: 38,
    marginLeft: 0,
    marginRight: 5,
    justifyContent: 'center',
  },
  
  settingsButtonSlot: {
    flex: 1, // 10
    height: 36,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },

  buttonImage: {
    width: "100%",
    height: "100%",
  },

  playButtonBg: {
    width: '100%',
    height: '100%',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: "#2563EB",
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },
  /** 2026.03.18 Add by June */ 
});
