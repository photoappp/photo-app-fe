import DateTimeFilter from "@/components/DateTimeFilter";
// import AsyncWorkDebugOverlay from "@/components/debug/AsyncWorkDebugOverlay";
import PhotoDetailViewer from "@/components/PhotoDetailViewer";
import ShowOnMap from "@/components/ShowOnMap";
import { Photo } from "@/types/Photo";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
// import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from "expo-linear-gradient";
import * as Location from "expo-location";
import * as MediaLibrary from "expo-media-library";
import { useNavigation, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
  AppStateStatus,
  Button,
  Dimensions,
  Easing,
  FlatList,
  Image,
  Linking,
  ListRenderItem,
  Modal,
  PermissionsAndroid,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  useColorScheme,
  View,
} from "react-native";
import { Edges, SafeAreaView } from "react-native-safe-area-context";
import Share from "react-native-share";

import { useSlideshowTime } from "@/components/context/SlideshowTimeContext";
import { useTheme } from "@/components/context/ThemeContext";
import { useI18n } from "@/components/context/useI18n";
import { useUserData } from "@/components/context/UserDataContext";

import IconPlay from "@/assets/icons/ic_play.svg"; //2026.03.18 Change button UI by June

import { AMPLITUDE_API_KEY } from "@/constants/env";
import * as amplitude from "@amplitude/analytics-react-native";
/* 2026.04.15 SQLite 메타데이터 DB/동기화 모듈을 홈 화면 로딩 파이프라인에 연결하기 위해 import 추가 by June */
import {
  countPhotoMetadataByDateTime,
  enqueueGeocodeJobs,
  getDisplayUriCacheBySourceUris,
  getGeocodeCacheByKey,
  getGeocodeCacheCount,
  getGeocodePendingJobCount,
  getOldestPhotoTakenAt,
  getPhotoMetadataCount,
  getPhotoSyncState,
  initPhotoMetadataDb,
  queryPhotoMetadataByDateTime,
  upsertDisplayUriCacheRows,
  upsertGeocodeCacheRows
} from "@/lib/db/photoMetadataDb";
import { recordPerfMetric } from "@/lib/services/perfMetrics";
import {
  upsertPhotoMetadataFromAssets,
} from "@/lib/services/photoMetadataSync";

// Responsive image grid calculations
const screenWidth = Dimensions.get("window").width;
const screenHeight = Dimensions.get("window").height;
const minImageWidth = 100;
const horizontalPadding = 4;
const imageMargin = 2;
const numColumns = 5;
// 실제로 쓸 수 있는 폭: 화면 - (바깥 24 + 안쪽 horizontalPadding) * 2
const usableWidth = screenWidth - (24 + horizontalPadding) * 2;
// 이 usableWidth 기준으로 5등분 + margin
const imageWidth = Math.floor(
  (usableWidth - numColumns * imageMargin * 2) / numColumns,
);
/* 2026.05.28 iOS ph:// 썸네일을 한 번에 대량 변환하면 메모리 피크가 커져 앱이 종료될 수 있어 화면 근처 항목만 작은 묶음으로 처리하기 위한 상수 by June */
const IOS_THUMBNAIL_RESOLVE_INITIAL_LIMIT = 30;
const IOS_THUMBNAIL_RESOLVE_LOOKAHEAD = 20;
const IOS_THUMBNAIL_RESOLVE_BATCH_SIZE = 5;
const IOS_THUMBNAIL_RESOLVE_BATCH_DELAY_MS = 80;
const DISPLAY_URI_CACHE_MAX = 300;
const THUMBNAIL_BLOCKING_TARGET_COUNT = 20;
const SLIDESHOW_PREP_TIMEOUT_MS = 1200;
const DEFAULT_LOCATION_RANGE_DAYS = 31;
const LOCATION_FEATURE_UNLOCK_STORAGE_KEY = "locationFeatureUnlockedUntil";
const LOCATION_FEATURE_UNLOCK_MS = 2 * 60 * 60 * 1000;
const INCREMENTAL_DATE_RELOAD_MAX_SHIFT_DAYS = 1;
const INCREMENTAL_DATE_RELOAD_MAX_BASE_SIZE = 600;
/* 2026.05.28 DB 인덱스가 아직 과거 날짜까지 도달하지 않은 경우 false-empty를 막기 위해 날짜 범위 도달까지 MediaLibrary를 제한 스캔하는 상한 by June */
const DATE_RANGE_FALLBACK_MAX_PAGES = 1000;

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
type PhotoDataSource =
  | "idle"
  | "db"
  | "medialibrary"
  | "medialibrary-fallback"
  | "permission-denied"
  | "skipped";

type LocationSearchEntryPoint = "location-filter" | "map";
type LocationSearchWorkflowStatus =
  | "idle"
  | "ad-required"
  | "search-prompt"
  | "preparing"
  | "completed";

type DeferredLocationFeatureOpen = LocationSearchEntryPoint | null;

/* 2026.05.27 ph:// URI 변형(/L0/001, query)을 안전하게 정규화해 iOS/Android 혼합 경로에서도 같은 assetId로 조회되게 보강 by June */
const getAssetIdFromPhUri = (uri: string): string | null => {
  if (!uri?.startsWith("ph://")) return null;
  const raw = uri.slice("ph://".length);
  const withoutQuery = raw.split("?")[0];
  const normalized = withoutQuery.split("/")[0];
  return normalized || null;
};

/** ---------- HomeScreen ---------- */
export default function HomeScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { isDarkTheme, colors } = useTheme();
  /* 2026.04.22 홈 화면의 하드코딩 문구를 다국어로 전환하기 위해 공용 i18n 훅을 사용하도록 변경 by June */
  const { t } = useI18n();
  //	const { userData, updateUserData } = useUserData();

  const {
    incrementDateFilter,
    incrementTimeFilter,
    incrementLocationFilter,
    updateTotalPhotos,
  } = useUserData();

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

  /* 2026.05.06 썸네일 선노출 이후 위치 팔로업 작업의 중복 실행을 막기 위해 in-flight ref를 추가 by June */
  /* 2026.05.06 기본 화면 위치 팔로업이 겹쳐 돌며 state 갱신 순서가 꼬이지 않도록 단일 실행 가드를 두기 위해 추가 by June */
  const locationFollowUpInFlightRef = useRef(false);
  /* 2026.05.06 동일 목록에 대한 위치 팔로업 반복 실행을 줄이기 위해 최근 처리 시그니처를 저장하는 ref를 추가 by June */
  /* 2026.05.06 동일 후보 목록에 대한 위치 팔로업 재실행을 건너뛰어 불필요한 OS 메타 조회/지오코딩 반복을 줄이기 위해 추가 by June */
  const locationFollowUpSignatureRef = useRef<string>("");
  /* 2026.05.26 Android에서 위치 권한 요청을 세션당 1회만 수행하기 위한 가드 ref by yen */
  const locationPermissionAskedRef = useRef(false);
  /* 2026.05.06 사용자가 선택한 사진의 우선 위치 로딩 중복 실행을 막기 위해 URI 기준 in-flight 집합을 추가 by June */
  /* 2026.05.06 사용자가 연속 탭/스와이프할 때 같은 URI 우선 로딩 중복 요청을 막아 체감 지연과 배터리 소모를 줄이기 위해 추가 by June */
  const priorityLocationInFlightRef = useRef<Set<string>>(new Set());
  /* 2026.04.15 iOS ph:// URI를 localUri로 변환한 결과를 재사용해 반복 조회 비용과 이미지 로더 충돌 노출을 줄이기 위해 캐시 추가 by June */
  const resolvedUriCacheRef = useRef<Map<string, string>>(new Map());

  // ---- 사진 목록/페이지네이션 ----
  const [photos, setPhotos] = useState<Photo[]>([]); // 화면에 뿌릴 가공된 데이터 (위치 필터 적용 후)
  const [photosAll, setPhotosAll] = useState<Photo[]>([]); // 날짜/시간 기준 원본 사진
  const [endCursor, setEndCursor] = useState<string | null>(null); // MediaLibrary가 돌려주는 다음 페이지 커서 문자열
  const [hasNextPage, setHasNextPage] = useState<boolean>(true); // 다음 페이지 있는지 여부
  const [loading, setLoading] = useState<boolean>(false);

  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [viewerPhotoUris, setViewerPhotoUris] = useState<string[]>([]);
  /* 2026.05.12 지도 진입 상세에서는 공통 상세뷰를 재사용하되 슬라이드쇼 버튼만 숨기기 위해 진입 소스를 상태로 분리 by June */
  const [viewerEntryPoint, setViewerEntryPoint] = useState<"home" | "map">(
    "home",
  );
  /* 2026.04.22 썸네일 리스트는 경량 URI를 유지하고 상세 뷰어에서만 고해상도 URI를 점진 교체하기 위해 뷰어 전용 URI 맵 상태를 추가 by June */
  const [viewerDetailUriMap, setViewerDetailUriMap] = useState<
    Record<string, string>
  >({});
  /* 2026.04.28 썸네일 단계에서 ph:// 로더 충돌을 줄이기 위해 표시용 URI 캐시를 별도로 유지하도록 추가 by June */
  const [displayUriMap, setDisplayUriMap] = useState<Record<string, string>>(
    {},
  );
  /* 2026.05.28 iOS 썸네일 URI 변환 중에도 로딩 안내/딤처리를 표시하고 중복 터치를 막기 위한 상태 by June */
  const [thumbnailResolving, setThumbnailResolving] = useState(false);
  /* 2026.06.02 실제 썸네일 이미지가 화면에 그려질 때까지 로딩 딤처리를 유지하기 위해 초기 배치 ready 상태를 추적 by June */
  const [thumbnailReadyByUri, setThumbnailReadyByUri] = useState<
    Record<string, true>
  >({});
  /* 2026.05.28 displayUriMap 변경으로 변환 effect가 반복 취소되지 않도록 최신 캐시를 ref로 보관 by June */
  const displayUriMapRef = useRef<Record<string, string>>({});
  const thumbnailReadyByUriRef = useRef<Record<string, true>>({});
  const thumbnailResolveRunIdRef = useRef(0);
  const [thumbnailResolveRunId, setThumbnailResolveRunId] = useState(0);
  const [thumbnailResolveLimit, setThumbnailResolveLimit] = useState(
    IOS_THUMBNAIL_RESOLVE_INITIAL_LIMIT,
  );
  const thumbnailSkeletonAnim = useRef(new Animated.Value(0)).current;
  const thumbnailViewabilityConfigRef = useRef({
    itemVisiblePercentThreshold: 10,
  });
  const thumbnailViewableItemsChangedRef = useRef(
    ({ viewableItems }: { viewableItems: Array<{ index: number | null }> }) => {
      const maxVisibleIndex = viewableItems.reduce((max, item) => {
        if (typeof item.index !== "number") return max;
        return Math.max(max, item.index);
      }, -1);

      if (maxVisibleIndex < 0) return;
      setThumbnailResolveLimit((prev) =>
        Math.max(prev, maxVisibleIndex + 1 + IOS_THUMBNAIL_RESOLVE_LOOKAHEAD),
      );
    },
  );

  /** 2026.03.26 By June - 사진 목록/페이지네이션 관련 */
  const [initialLoading, setInitialLoading] = useState(false);
  const [backgroundLoading, setBackgroundLoading] = useState(false);
  const [emptyMessage, setEmptyMessage] = useState<string | null>(null);
  const [didInitialLoad, setDidInitialLoad] = useState(false);
  const requestInFlightRef = useRef(false);
  const initialLoadStartedRef = useRef(false);
  /* 2026.05.28 사진 로딩/필터 변경 요청이 서로 덮어쓰지 않도록 최신 요청 ID와 pending reload를 추적 by June */
  const photoLoadRequestIdRef = useRef(0);
  const pendingReloadRef = useRef(false);
  const [photoLoadRequestId, setPhotoLoadRequestId] = useState(0);
  const [pendingReloadVisible, setPendingReloadVisible] = useState(false);
  const [currentDataSource, setCurrentDataSource] =
    useState<PhotoDataSource>("idle");
  const [dbIndexComplete, setDbIndexComplete] = useState(false);
  const [staleRequestSkipCount, setStaleRequestSkipCount] = useState(0);
  const [asyncWarnings, setAsyncWarnings] = useState<string[]>([]);
  const [visibleLocationPreparing, setVisibleLocationPreparing] = useState(false);
  const visibleLocationPreparationPromiseRef = useRef<Promise<void> | null>(null);
  const lastAutoAppendContentLengthRef = useRef(-1);
  const photoGridListRef = useRef<FlatList<Photo> | null>(null);
  const photoGridScrollOffsetRef = useRef(0);
  /* 2026.04.22 날짜/시간 DB 경로에서도 스크롤 append를 지원하기 위해 현재 DB 페이지네이션 오프셋/활성 상태를 ref로 관리하도록 추가 by June */
  const dbDateTimePagingRef = useRef<{ enabled: boolean; offset: number }>({
    enabled: false,
    offset: 0,
  });
  type DateTimeCoverageEntry = {
    dateStartMs: number;
    dateEndNextMs: number;
    timeStart: number;
    timeEnd: number;
    photos: Photo[];
    fullyLoaded: boolean;
    updatedAt: number;
  };
  const lastLoadedBaseFilterRef = useRef<FilterState | null>(null);
  const lastLoadedBaseFullyLoadedRef = useRef(false);
  const loadedDateTimeCoverageRef = useRef<DateTimeCoverageEntry[]>([]);
  const [filterLoading, setFilterLoading] = useState(false);
  const [appendLoading, setAppendLoading] = useState(false);
  /** 2026.03.26 By June */

  // ImageViewing 에 넘길 images 배열 (형식: { uri: string }[])
  const viewerImages = useMemo(
    /* 2026.04.22 상세 진입 후 해상도 보강된 URI가 있으면 뷰어에서 우선 사용하도록 병합해 썸네일/상세 로딩 경로를 분리하기 위해 수정 by June */
    () =>
      viewerPhotoUris.map((uri) => ({
        uri: viewerDetailUriMap[uri] ?? displayUriMap[uri] ?? uri,
      })),
    [displayUriMap, viewerDetailUriMap, viewerPhotoUris],
  );

  const photosRef = useRef<Photo[]>(photos);
  const photosAllRef = useRef<Photo[]>(photosAll);
  const viewerIndexRef = useRef<number>(viewerIndex);
  const thumbnailBlockingUris = useMemo(
    () =>
      photos
        .slice(0, THUMBNAIL_BLOCKING_TARGET_COUNT)
        .map((photo) => photo.uri)
        .filter(Boolean),
    [photos],
  );
  const thumbnailBlockingSignature = useMemo(
    () => thumbnailBlockingUris.join("|"),
    [thumbnailBlockingUris],
  );

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
  const dayStartMs = useCallback(
    (d: Date) =>
      new Date(
        d.getFullYear(),
        d.getMonth(),
        d.getDate(),
        0,
        0,
        0,
        0,
      ).getTime(),
    [],
  );
  /* 2026.04.15 날짜 경계 함수 참조를 안정화해 초기 로드 effect 반복 실행을 막기 위해 useCallback으로 변경 by June */
  const dayEndNextMs = useCallback(
    (d: Date) =>
      new Date(
        d.getFullYear(),
        d.getMonth(),
        d.getDate() + 1,
        0,
        0,
        0,
        0,
      ).getTime(),
    [],
  );
  const diffDaysDateOnly = useCallback((from: Date, to: Date) => {
    const fromMs = new Date(
      from.getFullYear(),
      from.getMonth(),
      from.getDate(),
      0,
      0,
      0,
      0,
    ).getTime();
    const toMs = new Date(
      to.getFullYear(),
      to.getMonth(),
      to.getDate(),
      0,
      0,
      0,
      0,
    ).getTime();
    return Math.round((toMs - fromMs) / 86400000);
  }, []);

  /** 2026.03.26 by June Edit Start */
  /* 2026.04.15 초기 기준 날짜를 렌더마다 재생성하지 않도록 고정해 필터/로드 콜백 재생성을 줄이기 위해 추가 by June */
  const baseTodayRef = useRef(new Date());
  const today = baseTodayRef.current;
  /* 2026.06.09 위치 검색 기본 범위를 최근 31일로 줄여 초기 비용과 첫 진입 대기 시간을 낮추기 위해 기본 시작일을 조정 by June */
  const defaultRangeStartRef = useRef(
    new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate() - (DEFAULT_LOCATION_RANGE_DAYS - 1),
    ),
  );
  const defaultRangeStart = defaultRangeStartRef.current;
  /* 2026.04.15 threeYearsAgo도 동일하게 참조 고정해 향후 필터 확장 시 의존성 루프를 예방하기 위해 수정 by June */
  const threeYearsAgoRef = useRef(
    new Date(today.getFullYear() - 3, today.getMonth(), today.getDate()),
  );
  const threeYearsAgo = threeYearsAgoRef.current;

  const INITIAL_TARGET_COUNT = 30;
  const FILTER_RESET_TARGET_COUNT = 30;
  const APPEND_TARGET_COUNT = 30;
  const FETCH_PAGE_SIZE = 30;

  /* 2026.04.22 빈 상태 문구를 다국어로 표시하기 위해 하드코딩 문자열을 번역 키 기반으로 교체 by June */
  const EMPTY_RECENT_3Y_MESSAGE = t(
    "noRecent3YearsPhotos",
    "No photos in the last 3 years.",
  );
  const EMPTY_DEFAULT_MESSAGE = t("noPhotosFound", "No photos found");
  const EMPTY_DEFAULT_DESC = t(
    "tryExpandingFilters",
    "Try expanding the filters.",
  );

  const sortPhotosByTakenAtDesc = (items: Photo[]) => {
    return [...items].sort((a, b) => {
      const aTime =
        typeof a.takenAt === "number" && Number.isFinite(a.takenAt)
          ? a.takenAt
          : Number.MIN_SAFE_INTEGER;

      const bTime =
        typeof b.takenAt === "number" && Number.isFinite(b.takenAt)
          ? b.takenAt
          : Number.MIN_SAFE_INTEGER;

      return bTime - aTime;
    });
  };

  const [filter, setFilter] = useState<FilterState>({
    dateStart: defaultRangeStart,
    /* 2026.04.15 초기 필터 종료일을 고정 기준 날짜로 맞춰 첫 렌더마다 값이 흔들리는 것을 방지하기 위해 수정 by June */
    dateEnd: today,
    timeStart: 0,
    timeEnd: 1439,
    countries: [],
    cities: [],
  });
  /* 2026.04.15 필터 기본값 대비 변경 여부를 안정적으로 판정해 카운트/재조회 루프를 방지하기 위해 초기 필터 스냅샷을 보관 by June */
  const initialFilterRef = useRef<FilterState>({
    dateStart: defaultRangeStart,
    /* 2026.04.15 초기 스냅샷 비교 기준도 동일한 고정 날짜를 사용해 usedDate 판정 오차를 방지하기 위해 수정 by June */
    dateEnd: today,
    timeStart: 0,
    timeEnd: 1439,
    countries: [],
    cities: [],
  });
  const filterRef = useRef<FilterState>(filter);
  useEffect(() => {
    filterRef.current = filter;
  }, [filter]);

  const lastDeclinedLocationSearchSignatureRef = useRef<string | null>(null);
  const lastPreparedLocationSearchSignatureRef = useRef<string | null>(null);
  const locationSearchResumeSignatureRef = useRef<string | null>(null);
  const [locationFeatureUnlockedUntil, setLocationFeatureUnlockedUntil] =
    useState<number>(0);
  const [locationSearchWorkflowStatus, setLocationSearchWorkflowStatus] =
    useState<LocationSearchWorkflowStatus>("idle");
  const [locationSearchEntryPoint, setLocationSearchEntryPoint] =
    useState<LocationSearchEntryPoint | null>(null);
  const [deferredLocationFeatureOpen, setDeferredLocationFeatureOpen] =
    useState<DeferredLocationFeatureOpen>(null);
  const [locationFilterOpenToken, setLocationFilterOpenToken] = useState(0);
  const [mapOpenToken, setMapOpenToken] = useState(0);
  const [locationSearchProgressPercent, setLocationSearchProgressPercent] =
    useState(0);
  const [locationSearchProgressChecked, setLocationSearchProgressChecked] =
    useState(0);
  const [locationSearchProgressTotal, setLocationSearchProgressTotal] =
    useState(0);
  const [locationSearchEstimatedSeconds, setLocationSearchEstimatedSeconds] =
    useState(0);
  const [locationSearchTargetTotalCount, setLocationSearchTargetTotalCount] =
    useState<number | null>(null);
  const [locationSearchPhaseText, setLocationSearchPhaseText] = useState(
    "Preparing search...",
  );
  const [appStateStatus, setAppStateStatus] = useState<AppStateStatus>(
    AppState.currentState,
  );
  const previousDateTimeFilterSignatureRef = useRef<string | null>(null);
  const locationSearchRunTokenRef = useRef(0);
  const pendingLocationSearchPromptSignatureRef = useRef<string | null>(null);
  const locationSearchProgressTimerRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const reloadPhotosForFilterRef = useRef<() => Promise<void>>(async () => {});
  /* 2026.06.09 날짜 변경 후 팝업 응답 시점에 최신 재조회 함수를 안전하게 호출할 수 있도록 ref 선언을 앞당겨 TDZ를 제거 by June */
  const locationSearchTargetCountRequestRef = useRef(0);

  const buildDateTimeFilterSignature = useCallback(
    (currentFilter: FilterState) =>
      JSON.stringify({
        dateStart: currentFilter.dateStart.toISOString().slice(0, 10),
        dateEnd: currentFilter.dateEnd.toISOString().slice(0, 10),
        timeStart: currentFilter.timeStart,
        timeEnd: currentFilter.timeEnd,
      }),
    [],
  );

  const currentDateTimeFilterSignature = useMemo(
    () => buildDateTimeFilterSignature(filter),
    [buildDateTimeFilterSignature, filter],
  );

  const getDateRangeDayCountInclusive = useCallback((currentFilter: FilterState) => {
    const start = new Date(
      currentFilter.dateStart.getFullYear(),
      currentFilter.dateStart.getMonth(),
      currentFilter.dateStart.getDate(),
    ).getTime();
    const end = new Date(
      currentFilter.dateEnd.getFullYear(),
      currentFilter.dateEnd.getMonth(),
      currentFilter.dateEnd.getDate(),
    ).getTime();
    return Math.floor((end - start) / 86400000) + 1;
  }, []);

  const currentDateRangeDayCount = useMemo(
    () => getDateRangeDayCountInclusive(filter),
    [filter, getDateRangeDayCountInclusive],
  );
  const shouldRequireExtendedLocationFeature = useCallback(
    (currentFilter: FilterState) =>
      getDateRangeDayCountInclusive(currentFilter) > DEFAULT_LOCATION_RANGE_DAYS,
    [getDateRangeDayCountInclusive],
  );
  const buildBaseDateTimeFilter = useCallback(
    (currentFilter: FilterState): FilterState => ({
      dateStart: new Date(currentFilter.dateStart),
      dateEnd: new Date(currentFilter.dateEnd),
      timeStart: currentFilter.timeStart,
      timeEnd: currentFilter.timeEnd,
      countries: [],
      cities: [],
    }),
    [],
  );
  const isDateTimeCoverageTimeCompatible = useCallback(
    (coverageFilter: Pick<FilterState, "timeStart" | "timeEnd">, currentFilter: FilterState) =>
      (coverageFilter.timeStart === 0 && coverageFilter.timeEnd === 1439) ||
      (coverageFilter.timeStart === currentFilter.timeStart &&
        coverageFilter.timeEnd === currentFilter.timeEnd),
    [],
  );
  const mergeDateTimeCoverageEntries = useCallback(
    (entries: DateTimeCoverageEntry[]) => {
      const dedupedAndSorted = entries
        .filter(
          (entry) =>
            entry.fullyLoaded &&
            Number.isFinite(entry.dateStartMs) &&
            Number.isFinite(entry.dateEndNextMs) &&
            entry.dateStartMs < entry.dateEndNextMs,
        )
        .sort((a, b) => {
          if (a.timeStart !== b.timeStart) return a.timeStart - b.timeStart;
          if (a.timeEnd !== b.timeEnd) return a.timeEnd - b.timeEnd;
          if (a.dateStartMs !== b.dateStartMs) return a.dateStartMs - b.dateStartMs;
          return a.dateEndNextMs - b.dateEndNextMs;
        });

      const merged: DateTimeCoverageEntry[] = [];

      for (const entry of dedupedAndSorted) {
        const current = merged[merged.length - 1];
        if (
          current &&
          current.timeStart === entry.timeStart &&
          current.timeEnd === entry.timeEnd &&
          current.dateEndNextMs >= entry.dateStartMs
        ) {
          current.dateStartMs = Math.min(current.dateStartMs, entry.dateStartMs);
          current.dateEndNextMs = Math.max(
            current.dateEndNextMs,
            entry.dateEndNextMs,
          );
          current.photos = sortPhotosForDisplay(
            dedupePhotosByUri([...current.photos, ...entry.photos]),
          );
          current.updatedAt = Math.max(current.updatedAt, entry.updatedAt);
          continue;
        }

        merged.push({
          ...entry,
          photos: sortPhotosForDisplay(dedupePhotosByUri(entry.photos)),
        });
      }

      return merged;
    },
    [dedupePhotosByUri, sortPhotosForDisplay],
  );
  const cloneBaseFilterState = useCallback(
    (currentFilter: FilterState) => buildBaseDateTimeFilter(currentFilter),
    [buildBaseDateTimeFilter],
  );
  const markLoadedBaseRange = useCallback(
    (currentFilter: FilterState, fullyLoaded: boolean) => {
      lastLoadedBaseFilterRef.current = cloneBaseFilterState(currentFilter);
      lastLoadedBaseFullyLoadedRef.current = fullyLoaded;
      if (fullyLoaded) {
        const nextCoverage: DateTimeCoverageEntry = {
          dateStartMs: dayStartMs(currentFilter.dateStart),
          dateEndNextMs: dayEndNextMs(currentFilter.dateEnd),
          timeStart: currentFilter.timeStart,
          timeEnd: currentFilter.timeEnd,
          photos: sortPhotosForDisplay(
            dedupePhotosByUri(photosAllRef.current),
          ),
          fullyLoaded,
          updatedAt: Date.now(),
        };

        loadedDateTimeCoverageRef.current = mergeDateTimeCoverageEntries([
          ...loadedDateTimeCoverageRef.current,
          nextCoverage,
        ]);
      }
    },
    [
      cloneBaseFilterState,
      dayEndNextMs,
      dayStartMs,
      dedupePhotosByUri,
      mergeDateTimeCoverageEntries,
      sortPhotosForDisplay,
    ],
  );
  const isLocationFeatureUnlockActive = locationFeatureUnlockedUntil > Date.now();
  const requiresExtendedLocationFeature =
    currentDateRangeDayCount > DEFAULT_LOCATION_RANGE_DAYS;

  const currentSearchTargetCount = useMemo(() => {
    if (
      typeof locationSearchTargetTotalCount === "number" &&
      locationSearchTargetTotalCount > 0
    ) {
      return locationSearchTargetTotalCount;
    }
    if (typeof progress.total === "number" && progress.total > 0) {
      return progress.total;
    }
    if (photosAll.length > 0) return photosAll.length;
    if (photos.length > 0) return photos.length;
    return 30;
  }, [
    locationSearchTargetTotalCount,
    photos.length,
    photosAll.length,
    progress.total,
  ]);

  const locationSearchTargetCountLabel = useMemo(
    () =>
      locationSearchTargetTotalCount === null
        ? "N"
        : locationSearchTargetTotalCount.toLocaleString(),
    [locationSearchTargetTotalCount],
  );

  const estimateLocationSearchSeconds = useCallback(
    (photoCount: number, dayCount: number) => {
      const normalizedPhotoCount = Math.max(1, photoCount);
      const normalizedDayCount = Math.max(1, dayCount);
      const estimated = Math.round(
        6 + normalizedPhotoCount * 0.18 + normalizedDayCount * 0.45,
      );
      return Math.max(8, estimated);
    },
    [],
  );

  const currentEstimatedLocationSearchSeconds = useMemo(
    () =>
      estimateLocationSearchSeconds(
        currentSearchTargetCount,
        currentDateRangeDayCount,
      ),
    [
      currentDateRangeDayCount,
      currentSearchTargetCount,
      estimateLocationSearchSeconds,
    ],
  );

  const clearLocationSearchProgressTimer = useCallback(() => {
    if (locationSearchProgressTimerRef.current) {
      clearInterval(locationSearchProgressTimerRef.current);
      locationSearchProgressTimerRef.current = null;
    }
  }, []);

  const resetLocationSearchProgress = useCallback(() => {
    clearLocationSearchProgressTimer();
    setLocationSearchProgressPercent(0);
    setLocationSearchProgressChecked(0);
    setLocationSearchProgressTotal(0);
    setLocationSearchEstimatedSeconds(0);
    setLocationSearchPhaseText("Preparing search...");
  }, [clearLocationSearchProgressTimer]);

  const openDeferredLocationFeature = useCallback((entryPoint: DeferredLocationFeatureOpen) => {
    if (!entryPoint) return;
    if (entryPoint === "location-filter") {
      setLocationFilterOpenToken((prev) => prev + 1);
      return;
    }
    if (entryPoint === "map") {
      setMapOpenToken((prev) => prev + 1);
    }
  }, []);

  const armLocationSearchWorkflowForFilter = useCallback(
    (nextFilter: FilterState) => {
      lastDeclinedLocationSearchSignatureRef.current = null;
      lastPreparedLocationSearchSignatureRef.current = null;
      locationSearchResumeSignatureRef.current = null;
      pendingLocationSearchPromptSignatureRef.current = null;
      setLocationSearchEntryPoint(null);
      setDeferredLocationFeatureOpen(null);
      setLocationSearchWorkflowStatus(
        shouldRequireExtendedLocationFeature(nextFilter) &&
          !(locationFeatureUnlockedUntil > Date.now())
          ? "ad-required"
          : "search-prompt",
      );
    },
    [locationFeatureUnlockedUntil, shouldRequireExtendedLocationFeature],
  );

  useEffect(() => {
    let mounted = true;

    const loadLocationFeatureUnlock = async () => {
      try {
        const stored = await AsyncStorage.getItem(
          LOCATION_FEATURE_UNLOCK_STORAGE_KEY,
        );
        if (!mounted || !stored) return;
        const parsed = Number(JSON.parse(stored));
        if (Number.isFinite(parsed) && parsed > 0) {
          setLocationFeatureUnlockedUntil(parsed);
        }
      } catch (error) {
        console.log("location feature unlock load error:", error);
      }
    };

    void loadLocationFeatureUnlock();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      setAppStateStatus(nextState);
    });

    return () => {
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    const previousSignature = previousDateTimeFilterSignatureRef.current;
    if (previousSignature && previousSignature !== currentDateTimeFilterSignature) {
      /* 2026.06.09 날짜/시간 조건이 실제로 바뀌면 같은 세션에서도 이전 거절/완료 상태를 새 범위에 재사용하지 않도록 초기화 by June */
      lastDeclinedLocationSearchSignatureRef.current = null;
      lastPreparedLocationSearchSignatureRef.current = null;
      locationSearchResumeSignatureRef.current = null;
      armLocationSearchWorkflowForFilter(filterRef.current);
    }
    previousDateTimeFilterSignatureRef.current = currentDateTimeFilterSignature;
  }, [
    armLocationSearchWorkflowForFilter,
    currentDateTimeFilterSignature,
  ]);

  useEffect(() => {
    if (locationFeatureUnlockedUntil <= 0) return;
    if (locationFeatureUnlockedUntil > Date.now()) return;

    /* 2026.06.09 광고 해금 시간이 만료되면 다음 32일 초과 검색에서 다시 게이트를 타도록 만료 시점을 정리 by June */
    setLocationFeatureUnlockedUntil(0);
    AsyncStorage.removeItem(LOCATION_FEATURE_UNLOCK_STORAGE_KEY).catch((error) => {
      console.log("location feature unlock clear error:", error);
    });
  }, [locationFeatureUnlockedUntil]);

  useEffect(() => {
    if (appStateStatus === "active") return;
    if (locationSearchWorkflowStatus !== "preparing") return;

    /* 2026.06.09 백그라운드 진입 시 강행하지 않고 현재 날짜 시그니처의 재개 포인트만 남겨 복귀 후 이어갈 수 있게 준비 by June */
    locationSearchResumeSignatureRef.current = currentDateTimeFilterSignature;
    locationSearchRunTokenRef.current += 1;
    clearLocationSearchProgressTimer();
    setLocationSearchWorkflowStatus("idle");
  }, [
    appStateStatus,
    clearLocationSearchProgressTimer,
    currentDateTimeFilterSignature,
    locationSearchWorkflowStatus,
  ]);

  useEffect(() => {
    if (locationSearchWorkflowStatus === "idle") return;
    console.log("[LocationSearchWorkflow]", {
      status: locationSearchWorkflowStatus,
      entryPoint: locationSearchEntryPoint,
      signature: currentDateTimeFilterSignature,
      requiresExtendedLocationFeature,
      isLocationFeatureUnlockActive,
    });
  }, [
    currentDateTimeFilterSignature,
    isLocationFeatureUnlockActive,
    locationSearchEntryPoint,
    locationSearchWorkflowStatus,
    requiresExtendedLocationFeature,
  ]);

  useEffect(() => {
    if (!didInitialLoad) return;
    if (locationSearchWorkflowStatus !== "idle") return;
    const hasPendingPrompt =
      pendingLocationSearchPromptSignatureRef.current ===
      currentDateTimeFilterSignature;
    if (!hasPendingPrompt && (initialLoading || filterLoading)) return;
    if (
      hasPendingPrompt
    ) {
      pendingLocationSearchPromptSignatureRef.current = null;
      setLocationSearchEntryPoint(null);
      setDeferredLocationFeatureOpen(null);
      setLocationSearchWorkflowStatus(
        requiresExtendedLocationFeature && !isLocationFeatureUnlockActive
          ? "ad-required"
          : "search-prompt",
      );
      return;
    }
    if (
      lastPreparedLocationSearchSignatureRef.current ===
        currentDateTimeFilterSignature ||
      lastDeclinedLocationSearchSignatureRef.current ===
        currentDateTimeFilterSignature
    ) {
      return;
    }

    setLocationSearchEntryPoint(null);
    setDeferredLocationFeatureOpen(null);
    setLocationSearchWorkflowStatus(
      requiresExtendedLocationFeature && !isLocationFeatureUnlockActive
        ? "ad-required"
        : "search-prompt",
    );
  }, [
    currentDateTimeFilterSignature,
    didInitialLoad,
    filterLoading,
    initialLoading,
    isLocationFeatureUnlockActive,
    locationSearchWorkflowStatus,
    requiresExtendedLocationFeature,
  ]);

  useEffect(() => {
    return () => {
      clearLocationSearchProgressTimer();
    };
  }, [clearLocationSearchProgressTimer]);

  const formatFilterForLog = useCallback((currentFilter: FilterState) => {
    return {
      dateStart: currentFilter.dateStart.toISOString().slice(0, 10),
      dateEnd: currentFilter.dateEnd.toISOString().slice(0, 10),
      timeStart: currentFilter.timeStart,
      timeEnd: currentFilter.timeEnd,
      countries: currentFilter.countries,
      cities: currentFilter.cities,
    };
  }, []);

  /* 2026.05.28 오래 걸리는 비동기 사진 로딩 요청이 최신 화면을 덮어쓰지 않도록 requestId 기반 가드 추가 by June */
  const beginPhotoLoad = useCallback(
    (source: PhotoDataSource, currentFilter: FilterState) => {
      const requestId = photoLoadRequestIdRef.current + 1;
      photoLoadRequestIdRef.current = requestId;
      setPhotoLoadRequestId(requestId);
      setCurrentDataSource(source);
      console.log("[PhotoLoad] start", {
        requestId,
        source,
        dateRange: formatFilterForLog(currentFilter),
      });
      return requestId;
    },
    [formatFilterForLog],
  );

  const isLatestPhotoLoad = useCallback((requestId: number) => {
    return photoLoadRequestIdRef.current === requestId;
  }, []);

  const skipStalePhotoLoad = useCallback(
    (requestId: number, stage: string) => {
      console.log("[PhotoLoad] skipped stale", {
        requestId,
        current: photoLoadRequestIdRef.current,
        stage,
      });
      setStaleRequestSkipCount((prev) => prev + 1);
      setAsyncWarnings((prev) => [
        `stale photo load skipped: ${stage}`,
        ...prev,
      ].slice(0, 5));
    },
    [],
  );

  const prefetchLocationSearchTargetTotalCount = useCallback(
    async (currentFilter: FilterState) => {
      const requestId = ++locationSearchTargetCountRequestRef.current;
      setLocationSearchTargetTotalCount(null);
      try {
        const totalCount = await countPhotoMetadataByDateTime({
          dateStartMs: dayStartMs(currentFilter.dateStart),
          dateEndNextMs: dayEndNextMs(currentFilter.dateEnd),
          timeStart: currentFilter.timeStart,
          timeEnd: currentFilter.timeEnd,
        });
        if (requestId !== locationSearchTargetCountRequestRef.current) {
          return;
        }
        setLocationSearchTargetTotalCount(totalCount >= 0 ? totalCount : null);
      } catch (error) {
        if (requestId !== locationSearchTargetCountRequestRef.current) {
          return;
        }
        console.log("location search target count prefetch error:", error);
        setLocationSearchTargetTotalCount(null);
      }
    },
    [],
  );

  const pruneDisplayUriCacheForPhotos = useCallback((sourcePhotos: Photo[]) => {
    const keep = new Set(sourcePhotos.map((photo) => photo.uri));
    setDisplayUriMap((prev) => {
      const keptEntries = Object.entries(prev).filter(([uri]) =>
        keep.has(uri),
      );
      const fallbackEntries = Object.entries(prev).slice(
        -DISPLAY_URI_CACHE_MAX,
      );
      const next = Object.fromEntries(
        [...fallbackEntries, ...keptEntries].slice(-DISPLAY_URI_CACHE_MAX),
      );
      displayUriMapRef.current = next;
      console.log("[Cache] displayUriMap size", {
        previous: Object.keys(prev).length,
        next: Object.keys(next).length,
      });
      return next;
    });
  }, []);

  const hydratePersistedDisplayUriCache = useCallback(
    async (sourcePhotos: Photo[], scope: string) => {
      if (Platform.OS !== "ios") return;
      const sourceUris = sourcePhotos
        .map((photo) => photo.uri)
        .filter((uri) => uri.startsWith("ph://"));
      if (sourceUris.length === 0) return;

      try {
        const rows = await getDisplayUriCacheBySourceUris(sourceUris);
        if (rows.length === 0) {
          console.log("[Cache] displayUri persistent miss", {
            scope,
            requested: sourceUris.length,
          });
          return;
        }

        setDisplayUriMap((prev) => {
          const next = { ...prev };
          for (const row of rows) {
            if (!row.displayUri.startsWith("file://")) continue;
            next[row.sourceUri] = row.displayUri;
            resolvedUriCacheRef.current.set(row.sourceUri, row.displayUri);
          }
          displayUriMapRef.current = next;
          console.log("[Cache] displayUri persistent hit", {
            scope,
            requested: sourceUris.length,
            hit: rows.length,
            nextSize: Object.keys(next).length,
          });
          return next;
        });
      } catch (err) {
        console.log("[Cache] displayUri persistent load error", {
          scope,
          err,
        });
      }
    },
    [],
  );
  /** 2026.03.26 by June Edit End */

  // 슬라이드쇼 관련
  const { slideshowTime } = useSlideshowTime();
  const [slideshowOn, setSlideshowOn] = useState(false);
  const [slideshowVisible, setSlideshowVisible] = useState(false);
  const [slideshowPreparing, setSlideshowPreparing] = useState(false);
  const [slideshowPhotoUris, setSlideshowPhotoUris] = useState<string[]>([]);
  const slideshowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const slideshowRunTokenRef = useRef(0);
  const slideshowPhotoUrisRef = useRef<string[]>([]);
  const slideshowStartIndexRef = useRef(0);
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
      setSlideshowPreparing(false);
      setSlideshowOn(false);
      setSlideshowVisible(false);
      setSlideshowPhotoUris([]);

      if (options?.trackClose) {
        amplitude.track("slideshow_closed", {
          screen_name: "home",
          end_index: viewerIndexRef.current ?? 0,
        });
      }
    },
    [clearSlideshowTimer],
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
        const total = slideshowPhotoUrisRef.current.length;
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
          scheduleNextSlide(token);
          return next;
        });
      }, slideshowDelayMs);
    },
    [clearSlideshowTimer, closeSlideshow, slideshowDelayMs],
  );
  /* 2026.04.22 시작 인덱스를 경계값으로 보정하고 세션 토큰을 새로 발급해 슬라이드쇼 시작 흐름을 재구성하기 위해 start 함수를 재구현 by June */
  const startSlideshow = useCallback(
    (startIndex: number = 0, sourceUris?: string[]) => {
      const uris =
        sourceUris && sourceUris.length > 0
          ? sourceUris
          : slideshowPhotoUrisRef.current;
      const total = uris.length;
      if (total <= 0) return;

      const safeIndex = Math.min(Math.max(startIndex, 0), total - 1);
      slideshowRunTokenRef.current += 1;
      const token = slideshowRunTokenRef.current;

      clearSlideshowTimer();
      slideshowPhotoUrisRef.current = uris;
      slideshowStartIndexRef.current = safeIndex;
      setSlideshowPhotoUris(uris);
      setViewerIndex(safeIndex);
      viewerIndexRef.current = safeIndex;
      setViewerVisible(true);
      setSlideshowVisible(true);
      setSlideshowOn(true);

      scheduleNextSlide(token);
    },
    [clearSlideshowTimer, scheduleNextSlide],
  );

  useEffect(() => {
    slideshowPhotoUrisRef.current = slideshowPhotoUris;
  }, [slideshowPhotoUris]);


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

  useEffect(() => {
    photosAllRef.current = photosAll;
  }, [photosAll]);

  /* 2026.04.15 SQLite 메타데이터 DB 초기화를 앱 진입 시 1회 수행해 동기화 대상 테이블/인덱스를 보장하기 위해 추가 by June */
  useEffect(() => {
    void initPhotoMetadataDb().catch((err) => {
      console.log("photo metadata db init error:", err);
    });
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
        void currentFilter;
        setProgress({ loaded: loadedCount, total: null });
      } catch (err) {
        /* 2026.04.22 progress 계산 실패가 메인 로딩을 막지 않도록 loaded만 유지하고 total은 null로 폴백하기 위해 예외 처리 by June */
        console.log("refreshFilterProgress error:", err);
        setProgress({ loaded: loadedCount, total: null });
      }
    },
    [],
  );

  /* 2026.06.02 초기 진입 체감 속도 우선 정책으로 자동 백그라운드 인덱싱은 시작하지 않고,
     현재 화면에서 실제로 본 페이지들만 fetchAssetsPage 경로를 통해 점진 캐싱하도록 조정 by June */
  useEffect(() => {
    /* 2026.04.22 화면 진입 시 인덱싱 상태를 즉시 표시하기 위해 초기 진행 상태 조회를 함께 실행 by June */
    void refreshIndexingProgress();
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
    setViewerPhotoUris([]);
    setViewerEntryPoint("home");
  }, [stopSlideshow]);

  /* 2026.04.22 닫기 버튼 동작은 close event를 남겨야 하므로 래퍼 함수를 분리해 추적 일관성을 유지하기 위해 추가 by June */
  const handleCloseSlideshow = useCallback(() => {
    closeSlideshow({ trackClose: true });
  }, [closeSlideshow]);

  const handleSlideshow = () => {
    void prepareAndStartSlideshow({
      startIndex: viewerIndexRef.current ?? 0,
    });
    console.log("Slideshow start");

    amplitude.track("tap_slw_button", {
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
    void prepareAndStartSlideshow({
      startIndex,
      sourceUris: viewerPhotoUris,
    });

    amplitude.track("tap_slideshow_button_from_viewer", {
      screen_name: "home",
      start_index: startIndex,
      photo_count: photosRef.current.length,
    });
  }, [prepareAndStartSlideshow, viewerPhotoUris]);

  async function imagesWithLocation(
    images: any[],
    opts?: { maxLookups?: number; precision?: number; delayMs?: number },
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
    const cacheUpsertRows: {
      geoKey: string;
      latitude: number;
      longitude: number;
      country: string | null;
      city: string | null;
      updatedAt: number;
    }[] = [];
    /* 2026.04.22 geocode miss 좌표를 작업 큐에 누적해 이후 백그라운드 보강 대상으로 추적하기 위해 map 추가 by June */
    const pendingJobMap = new Map<
      string,
      { geoKey: string; latitude: number; longitude: number }
    >();
    const updated: any[] = [];
    let lookups = 0;
    /* 2026.04.22 캐시 효율을 수치화하기 위해 런타임/DB 캐시 hit 카운터를 추가 by June */
    let memoryCacheHits = 0;
    let dbCacheHits = 0;

    for (const img of images) {
      // 2026-05-12: location이 비어 있으면 ph:// URI로 좌표를 보강해 위치 필터 적용 시 모든 사진이 사라지는 버그 수정 by yen
      let imgLocation = img.location;
      if (!imgLocation && typeof img.uri === "string") {
        try {
          const targetAssetId = img.assetId ?? getAssetIdFromPhUri(img.uri);
          const info = targetAssetId
            ? await MediaLibrary.getAssetInfoAsync(targetAssetId)
            : await MediaLibrary.getAssetInfoAsync(img.uri as any);
          if (info?.location) {
            const lat0 = Number(info.location.latitude);
            const lon0 = Number(info.location.longitude);
            if (Number.isFinite(lat0) && Number.isFinite(lon0)) {
              imgLocation = { latitude: lat0, longitude: lon0 };
            }
          }
        } catch {}
      }
      if (!imgLocation) {
        updated.push({ ...img, country: null, city: null });
        continue;
      }

      const lat = Number(imgLocation.latitude);
      const lon = Number(imgLocation.longitude);
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
            place = {
              country: cached.country ?? null,
              city: cached.city ?? null,
            };
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
          pendingJobMap.set(key, {
            geoKey: key,
            latitude: lat,
            longitude: lon,
          });
          // 간단 백오프
          await sleep(delayMs * 4);
        }
      } else if (!place) {
        /* 2026.04.22 이번 로드의 geocode 상한으로 미처리된 좌표를 작업 큐에 적재해 단계적 보강 대상에 포함시키기 위해 추가 by June */
        pendingJobMap.set(key, { geoKey: key, latitude: lat, longitude: lon });
      }

      // 상한 초과 or 캐시된 값 사용
      if (!place) place = { country: null, city: null };
      /* 2026.05.27 ph:// 폴백으로 복구한 좌표(imgLocation)를 결과 photo에 반영 — 그래야 ShowOnMap이 마커를 표시할 수 있음 by yen */
      updated.push({ ...img, location: imgLocation, ...place });
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
    recordPerfMetric(
      "home.images_with_location.ms",
      Date.now() - geocodeStartedAt,
      {
        context: {
          inputCount: images.length,
          reverseLookups: lookups,
          memoryCacheHits,
          dbCacheHits,
          queuedJobs: pendingJobMap.size,
        },
        logEvery: 2,
      },
    );

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
    currentFilter: FilterState,
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
  const fetchAssetsPage = async (params?: {
    after?: string | null;
    first?: number;
    createdAfter?: number;
    createdBefore?: number;
  }) => {
    const result = await MediaLibrary.getAssetsAsync({
      first: params?.first ?? FETCH_PAGE_SIZE,
      mediaType: MediaLibrary.MediaType.photo,
      after: params?.after ?? undefined,
      sortBy: [MediaLibrary.SortBy.creationTime],
      createdAfter: params?.createdAfter,
      createdBefore: params?.createdBefore,
    });

    updateTotalPhotos(result.totalCount ?? 0);

    /* 2026.04.15 기존 MediaLibrary fetch 결과를 즉시 SQLite에 업서트해 UI 로직을 건드리지 않고도 메타데이터를 누적하기 위해 추가 by June */
    void upsertPhotoMetadataFromAssets(result.assets ?? []).catch((err) => {
      console.log("photo metadata upsert error:", err);
    });

    return result;
  };

  /** asset → Photo 정규화 */
  const hydrateAssetsToPhotos = async (
    assets: MediaLibrary.Asset[],
    /* 2026.05.26 Android의 경우 bulk getAssetsAsync가 location을 반환하지 않으므로 위치 필터가 필요한 경로에서만
       per-asset getAssetInfoAsync를 호출해 location을 보강하기 위한 옵션 추가 by yen */
    options?: { enrichLocationOnAndroid?: boolean },
  ): Promise<Photo[]> => {
    const shouldEnrichOnAndroid =
      Platform.OS === "android" && !!options?.enrichLocationOnAndroid;

    const base = await Promise.all(
      assets.map(async (asset) => {
        const takenAt =
          asset.creationTime && asset.creationTime > 0
            ? asset.creationTime
            : asset.modificationTime && asset.modificationTime > 0
              ? asset.modificationTime
              : null;

        /* iOS는 bulk asset에 location이 포함되므로 우선 그 값을 사용 */
        const rawLoc = (asset as any).location;
        let location: { latitude: number; longitude: number } | null = null;
        if (
          rawLoc &&
          Number.isFinite(Number(rawLoc.latitude)) &&
          Number.isFinite(Number(rawLoc.longitude))
        ) {
          location = {
            latitude: Number(rawLoc.latitude),
            longitude: Number(rawLoc.longitude),
          };
        }

        /* Android에서 위치 필터가 적용된 경로에서만 추가 비용 감수하고 per-asset 보강 */
        if (!location && shouldEnrichOnAndroid) {
          try {
            const info = await MediaLibrary.getAssetInfoAsync(asset.id);
            if (info?.location) {
              const lat = Number(info.location.latitude);
              const lon = Number(info.location.longitude);
              if (Number.isFinite(lat) && Number.isFinite(lon)) {
                location = { latitude: lat, longitude: lon };
              }
            }
          } catch {
            // best-effort: skip on failure, photo will simply not match location filter
          }
        }

        return {
          uri: asset.uri,
          assetId: asset.id,
          takenAt,
          location,
        };
      }),
    );
    /* 2026.04.22 썸네일 리스트 단계에서는 원본 URI를 유지해 대량 localUri 변환으로 인한 메모리 피크를 줄이고 상세 진입 시점에만 고해상도 로드를 하도록 변경 by June */
    return base;
  };

  /** 위치 필터 */
  const applyLocationFilter = useCallback(
    (items: Photo[], currentFilter: FilterState) => {
      const { countries, cities } = currentFilter;

      if (countries.length === 0 && cities.length === 0) {
        return items;
      }

      return items.filter((photo) => {
        const country = String(photo.country ?? "").trim();
        const city = String(photo.city ?? "").trim();
        const matchesCountry =
          countries.length === 0 ? true : countries.includes(country);

        if (!matchesCountry) return false;
        if (cities.length === 0) return true;
        if (!city) return true;

        return cities.includes(city);
      });
    },
    [],
  );

  const deriveVisiblePhotos = useCallback(
    (baseItems: Photo[], currentFilter: FilterState) =>
      sortPhotosForDisplay(
        dedupePhotosByUri(applyLocationFilter(baseItems, currentFilter)),
      ),
    [applyLocationFilter, dedupePhotosByUri, sortPhotosForDisplay],
  );

  async function loadPreparedPhotosFromDbForLocationSearch(
    currentFilter: FilterState,
  ) {
    const syncState = await getPhotoSyncState();
    const isIndexComplete = !syncState.hasNextPage;
    if (!isIndexComplete) {
      return {
        photos: [] as Photo[],
        totalCount: 0,
        isIndexComplete: false,
        isCacheHit: false,
      };
    }

    const totalCount = await countPhotoMetadataByDateTime({
      dateStartMs: dayStartMs(currentFilter.dateStart),
      dateEndNextMs: dayEndNextMs(currentFilter.dateEnd),
      timeStart: currentFilter.timeStart,
      timeEnd: currentFilter.timeEnd,
    });

    if (totalCount <= 0) {
      return {
        photos: [] as Photo[],
        totalCount: 0,
        isIndexComplete: true,
        isCacheHit: false,
      };
    }

    const rows = await queryPhotoMetadataByDateTime({
      dateStartMs: dayStartMs(currentFilter.dateStart),
      dateEndNextMs: dayEndNextMs(currentFilter.dateEnd),
      timeStart: currentFilter.timeStart,
      timeEnd: currentFilter.timeEnd,
      limit: totalCount,
      offset: 0,
    });

    const photosFromDb = sortPhotosForDisplay(
      dedupePhotosByUri(
        rows.map((row) => ({
          uri: row.uri,
          assetId: row.assetId,
          takenAt: row.takenAt,
          location:
            typeof row.latitude === "number" &&
            typeof row.longitude === "number"
              ? {
                  latitude: row.latitude,
                  longitude: row.longitude,
                }
              : null,
        })),
      ),
    );

    return {
      photos: photosFromDb,
      totalCount,
      isIndexComplete: true,
      isCacheHit: photosFromDb.length > 0,
    };
  }

  const ensureVisiblePhotosLocationReady = useCallback(async () => {
    if (visibleLocationPreparationPromiseRef.current) {
      return visibleLocationPreparationPromiseRef.current;
    }

    const currentPhotos = photosAllRef.current;
    if (currentPhotos.length === 0) return;

    const work = (async () => {
      setVisibleLocationPreparing(true);
      try {
        const needsWork = currentPhotos.some(
          (photo) =>
            !photo.location ||
            !Number.isFinite(Number(photo.location.latitude)) ||
            !Number.isFinite(Number(photo.location.longitude)) ||
            !photo.city ||
            !photo.country,
        );

        if (!needsWork) return;

        const withPlaces = await imagesWithLocation(currentPhotos, {
          maxLookups: currentPhotos.length,
          precision: 2,
          delayMs: 80,
        });

        const nextByUri = new Map(withPlaces.map((photo) => [photo.uri, photo]));

        setPhotosAll((prev) => {
          const nextBase = prev.map((photo) => {
            const next = nextByUri.get(photo.uri);
            return next ? { ...photo, ...next } : photo;
          });
          setPhotos(deriveVisiblePhotos(nextBase, filterRef.current));
          return nextBase;
        });
      } finally {
        setVisibleLocationPreparing(false);
        visibleLocationPreparationPromiseRef.current = null;
      }
    })();

    visibleLocationPreparationPromiseRef.current = work;
    return work;
  }, [deriveVisiblePhotos, imagesWithLocation]);

  const runLightweightLocationSearchPreparation = useCallback(
    async (runToken: number) => {
      const currentFilter = filterRef.current;
      const estimatedSeconds = currentEstimatedLocationSearchSeconds;
      const startedAt = Date.now();
      const rangeStartMs = dayStartMs(currentFilter.dateStart);
      const rangeEndNextMs = dayEndNextMs(currentFilter.dateEnd);

      let total = Math.max(1, progress.total ?? currentSearchTargetCount);
      let processedCount = Math.min(photosAllRef.current.length, total);
      let cursor = endCursor;
      let nextPage = hasNextPage;

      setLocationSearchProgressTotal(total);
      setLocationSearchEstimatedSeconds(estimatedSeconds);
      setLocationSearchProgressChecked(processedCount);
      setLocationSearchProgressPercent(0);
      setLocationSearchPhaseText("Checking coordinates...");

      clearLocationSearchProgressTimer();
      locationSearchProgressTimerRef.current = setInterval(() => {
        if (runToken !== locationSearchRunTokenRef.current) return;
        const elapsedSeconds = Math.max(
          1,
          Math.floor((Date.now() - startedAt) / 1000),
        );
        const timeRatio = elapsedSeconds / Math.max(estimatedSeconds, 1);
        const checkedRatio = processedCount / Math.max(total, 1);
        const blendedRatio = Math.min(
          0.94,
          Math.max(checkedRatio * 0.88, Math.min(timeRatio, checkedRatio + 0.14)),
        );
        const autoPercent = Math.round(blendedRatio * 100);
        setLocationSearchProgressPercent((prev) => Math.max(prev, autoPercent));
        if (timeRatio >= 0.5 || checkedRatio >= 0.5) {
          setLocationSearchPhaseText("Resolving cities...");
        }
      }, 1000);

      const dbPrepared = await loadPreparedPhotosFromDbForLocationSearch(
        currentFilter,
      );
      if (runToken !== locationSearchRunTokenRef.current) return;

      if (dbPrepared.isIndexComplete && dbPrepared.isCacheHit) {
        total = Math.max(total, dbPrepared.totalCount, dbPrepared.photos.length);
        processedCount = dbPrepared.photos.length;
        setLocationSearchTargetTotalCount(
          dbPrepared.totalCount > 0 ? dbPrepared.totalCount : null,
        );
        setLocationSearchProgressTotal(total);
        setLocationSearchProgressChecked(processedCount);

        await hydratePersistedDisplayUriCache(
          dbPrepared.photos,
          "location-search-db",
        );
        if (runToken !== locationSearchRunTokenRef.current) return;

        setPhotosAll(dbPrepared.photos);
        setPhotos(deriveVisiblePhotos(dbPrepared.photos, filterRef.current));
        photosAllRef.current = dbPrepared.photos;
        photosRef.current = deriveVisiblePhotos(dbPrepared.photos, filterRef.current);
        pruneDisplayUriCacheForPhotos(dbPrepared.photos);
        setEndCursor(null);
        setHasNextPage(false);
        dbDateTimePagingRef.current = {
          enabled: true,
          offset: dbPrepared.photos.length,
        };

        await ensureVisiblePhotosLocationReady();
        if (runToken !== locationSearchRunTokenRef.current) return;

        processedCount = Math.max(processedCount, photosAllRef.current.length);
        setLocationSearchProgressChecked(processedCount);
        setLocationSearchProgressTotal(
          Math.max(total, photosAllRef.current.length),
        );
        setLocationSearchPhaseText("Resolving cities...");
        markLoadedBaseRange(currentFilter, true);
        return;
      }

      if (photosAllRef.current.length > 0) {
        await ensureVisiblePhotosLocationReady();
        if (runToken !== locationSearchRunTokenRef.current) return;
        processedCount = Math.max(processedCount, photosAllRef.current.length);
        setLocationSearchProgressChecked(processedCount);
      }

      while (nextPage) {
        if (runToken !== locationSearchRunTokenRef.current) return;

        setLocationSearchPhaseText("Checking coordinates...");
        const result = await fetchAssetsPage({
          after: cursor,
          first: FETCH_PAGE_SIZE,
          createdAfter: rangeStartMs,
          createdBefore: rangeEndNextMs,
        });

        total = Math.max(total, result.totalCount ?? 0, processedCount + (result.assets?.length ?? 0));
        setLocationSearchProgressTotal(total);

        const assets = (result.assets ?? []).filter((asset) =>
          matchesDateTimeFilter(asset, currentFilter),
        );

        let photosChunk = await hydrateAssetsToPhotos(assets, {
          enrichLocationOnAndroid: true,
        });

        setLocationSearchPhaseText("Resolving cities...");
        photosChunk = await imagesWithLocation(photosChunk, {
          maxLookups: photosChunk.length,
          precision: 2,
          delayMs: 80,
        });

        if (runToken !== locationSearchRunTokenRef.current) return;

        const seenUris = new Set<string>();
        const mergedBase = [...photosAllRef.current, ...photosChunk]
          .filter((photo) => {
            if (seenUris.has(photo.uri)) return false;
            seenUris.add(photo.uri);
            return true;
          })
          .sort((a, b) => {
            const aTime =
              typeof a.takenAt === "number" && Number.isFinite(a.takenAt)
                ? a.takenAt
                : Number.MIN_SAFE_INTEGER;
            const bTime =
              typeof b.takenAt === "number" && Number.isFinite(b.takenAt)
                ? b.takenAt
                : Number.MIN_SAFE_INTEGER;
            return bTime - aTime;
          });
        const nextVisible = deriveVisiblePhotos(mergedBase, filterRef.current);

        await hydratePersistedDisplayUriCache(photosChunk, "location-search");
        setPhotosAll(mergedBase);
        setPhotos(nextVisible);
        photosAllRef.current = mergedBase;
        photosRef.current = nextVisible;
        pruneDisplayUriCacheForPhotos(mergedBase);
        void refreshFilterProgress(filterRef.current, nextVisible.length);

        cursor = result.endCursor ?? null;
        nextPage = result.hasNextPage;
        setEndCursor(cursor);
        setHasNextPage(nextPage);
        dbDateTimePagingRef.current = { enabled: false, offset: 0 };

        processedCount = Math.min(total, mergedBase.length);
        setLocationSearchProgressChecked(processedCount);
        const explicitPercent = Math.min(
          94,
          Math.round((processedCount / Math.max(total, 1)) * 100),
        );
        setLocationSearchProgressPercent((prev) => Math.max(prev, explicitPercent));
      }

      markLoadedBaseRange(currentFilter, true);
    },
    [
      clearLocationSearchProgressTimer,
      currentEstimatedLocationSearchSeconds,
      currentSearchTargetCount,
      dayEndNextMs,
      dayStartMs,
      deriveVisiblePhotos,
      endCursor,
      ensureVisiblePhotosLocationReady,
      fetchAssetsPage,
      hasNextPage,
      hydrateAssetsToPhotos,
      hydratePersistedDisplayUriCache,
      imagesWithLocation,
      loadPreparedPhotosFromDbForLocationSearch,
      markLoadedBaseRange,
      matchesDateTimeFilter,
      progress.total,
      pruneDisplayUriCacheForPhotos,
      refreshFilterProgress,
    ],
  );

  const finalizeLocationSearchPreparation = useCallback(
    (entryPoint: DeferredLocationFeatureOpen | null) => {
      clearLocationSearchProgressTimer();
      setLocationSearchProgressChecked(locationSearchProgressTotal || currentSearchTargetCount);
      setLocationSearchProgressPercent(100);
      setLocationSearchPhaseText("Completed");
      locationSearchResumeSignatureRef.current = null;
      lastPreparedLocationSearchSignatureRef.current = currentDateTimeFilterSignature;
      lastDeclinedLocationSearchSignatureRef.current = null;
      setLocationSearchWorkflowStatus("completed");
      setTimeout(() => {
        setLocationSearchWorkflowStatus("idle");
        openDeferredLocationFeature(entryPoint);
        setDeferredLocationFeatureOpen(null);
        setLocationSearchEntryPoint(null);
        resetLocationSearchProgress();
      }, 180);
    },
    [
      clearLocationSearchProgressTimer,
      currentDateTimeFilterSignature,
      currentSearchTargetCount,
      locationSearchProgressTotal,
      openDeferredLocationFeature,
      resetLocationSearchProgress,
    ],
  );

  const handleLocationSearchConfirm = useCallback(async () => {
    const runToken = locationSearchRunTokenRef.current + 1;
    locationSearchRunTokenRef.current = runToken;
    const deferredEntryPoint = deferredLocationFeatureOpen;

    setLocationSearchWorkflowStatus("preparing");
    setLocationSearchEstimatedSeconds(currentEstimatedLocationSearchSeconds);

    try {
      await reloadPhotosForFilterRef.current();
      if (runToken !== locationSearchRunTokenRef.current) return;
      await runLightweightLocationSearchPreparation(runToken);
      if (runToken !== locationSearchRunTokenRef.current) return;
      finalizeLocationSearchPreparation(deferredEntryPoint);
    } catch (error) {
      if (runToken !== locationSearchRunTokenRef.current) return;
      console.log("location search preparation error:", error);
      setLocationSearchWorkflowStatus("idle");
      resetLocationSearchProgress();
      setDeferredLocationFeatureOpen(null);
      setLocationSearchEntryPoint(null);
    }
  }, [
    currentEstimatedLocationSearchSeconds,
    deferredLocationFeatureOpen,
    finalizeLocationSearchPreparation,
    resetLocationSearchProgress,
    reloadPhotosForFilterRef,
    runLightweightLocationSearchPreparation,
  ]);

  const handleLocationSearchDecline = useCallback(async () => {
    locationSearchResumeSignatureRef.current = null;
    pendingLocationSearchPromptSignatureRef.current = null;
    lastDeclinedLocationSearchSignatureRef.current = currentDateTimeFilterSignature;
    setLocationSearchWorkflowStatus("idle");
    setDeferredLocationFeatureOpen(null);
    setLocationSearchEntryPoint(null);
    resetLocationSearchProgress();
    await reloadPhotosForFilterRef.current();
  }, [
    currentDateTimeFilterSignature,
    reloadPhotosForFilterRef,
    resetLocationSearchProgress,
  ]);

  const handleLocationSearchCancel = useCallback(() => {
    locationSearchRunTokenRef.current += 1;
    locationSearchResumeSignatureRef.current = null;
    pendingLocationSearchPromptSignatureRef.current = null;
    setLocationSearchWorkflowStatus("idle");
    setDeferredLocationFeatureOpen(null);
    setLocationSearchEntryPoint(null);
    resetLocationSearchProgress();
  }, [currentDateTimeFilterSignature, resetLocationSearchProgress]);

  const handleExtendedFeatureDecline = useCallback(() => {
    const nextStart = new Date(filterRef.current.dateEnd);
    nextStart.setDate(nextStart.getDate() - (DEFAULT_LOCATION_RANGE_DAYS - 1));
    const normalizedStart = new Date(
      nextStart.getFullYear(),
      nextStart.getMonth(),
      nextStart.getDate(),
    );
    const normalizedEnd = new Date(
      filterRef.current.dateEnd.getFullYear(),
      filterRef.current.dateEnd.getMonth(),
      filterRef.current.dateEnd.getDate(),
    );
    const nextFilter = {
      ...filterRef.current,
      dateStart: normalizedStart,
      dateEnd: normalizedEnd,
    };
    setFilter((prev) => ({
      ...prev,
      dateStart: normalizedStart,
      dateEnd: normalizedEnd,
    }));
    void prefetchLocationSearchTargetTotalCount(nextFilter);
    armLocationSearchWorkflowForFilter(nextFilter);
  }, [armLocationSearchWorkflowForFilter, prefetchLocationSearchTargetTotalCount]);

  const handleExtendedFeatureApprove = useCallback(async () => {
    const unlockedUntil = Date.now() + LOCATION_FEATURE_UNLOCK_MS;
    setLocationFeatureUnlockedUntil(unlockedUntil);
    try {
      await AsyncStorage.setItem(
        LOCATION_FEATURE_UNLOCK_STORAGE_KEY,
        JSON.stringify(unlockedUntil),
      );
    } catch (error) {
      console.log("location feature unlock persist error:", error);
    }
    setLocationSearchWorkflowStatus("search-prompt");
  }, []);

  const requestLocationFeatureOpen = useCallback(
    async (entryPoint: LocationSearchEntryPoint) => {
      if (locationSearchWorkflowStatus === "preparing") return false;

      const alreadyPrepared =
        lastPreparedLocationSearchSignatureRef.current ===
        currentDateTimeFilterSignature;
      const alreadyDeclined =
        lastDeclinedLocationSearchSignatureRef.current ===
        currentDateTimeFilterSignature;

      if (alreadyPrepared) {
        return true;
      }

      if (alreadyDeclined) {
        if (
          entryPoint === "location-filter" ||
          entryPoint === "map"
        ) {
          void ensureVisiblePhotosLocationReady();
        }
        return true;
      }

      setLocationSearchEntryPoint(entryPoint);
      setDeferredLocationFeatureOpen(entryPoint);
      setLocationSearchWorkflowStatus(
        requiresExtendedLocationFeature && !isLocationFeatureUnlockActive
          ? "ad-required"
          : "search-prompt",
      );
      return false;
    },
    [
      currentDateTimeFilterSignature,
      isLocationFeatureUnlockActive,
      locationSearchWorkflowStatus,
      requiresExtendedLocationFeature,
      ensureVisiblePhotosLocationReady,
    ],
  );

  useEffect(() => {
    if (appStateStatus !== "active") return;
    if (locationSearchWorkflowStatus !== "idle") return;
    if (
      locationSearchResumeSignatureRef.current !== currentDateTimeFilterSignature
    ) {
      return;
    }
    if (
      lastPreparedLocationSearchSignatureRef.current ===
        currentDateTimeFilterSignature ||
      lastDeclinedLocationSearchSignatureRef.current ===
        currentDateTimeFilterSignature
    ) {
      return;
    }

    void handleLocationSearchConfirm();
  }, [
    appStateStatus,
    currentDateTimeFilterSignature,
    handleLocationSearchConfirm,
    locationSearchWorkflowStatus,
  ]);

  /** geocoding 필요 여부 판별 */
  const shouldUseGeocoding = (
    currentFilter: FilterState,
    _mode: "initial" | "background" | "append" | "filter-reset",
  ) => {
    const hasLocationFilter =
      currentFilter.countries.length > 0 || currentFilter.cities.length > 0;
    /* 2026.04.22 위치 필터가 실제로 사용될 때만 geocoding을 수행해 append/background에서 불필요한 메모리/CPU 사용을 줄이기 위해 정책을 단순화 by June */
    return hasLocationFilter;
  };

  /* 2026.05.06 좌표 포맷 키 생성을 공통화해 geocode 캐시 hit율을 안정적으로 유지하기 위해 헬퍼를 추가 by June */
  /* 2026.05.06 우선 로딩/배치 로딩 모두 동일 좌표 키 규칙을 쓰게 해 geocode 캐시 hit 일관성을 유지하기 위해 공통화 by June */
  const toGeoKey = (latitude: number, longitude: number, precision = 2) =>
    `${latitude.toFixed(precision)},${longitude.toFixed(precision)}`;

  /* 2026.05.06 사용자가 탭/스와이프로 선택한 단일 사진은 즉시 위치를 우선 보강해 체감 지연을 줄이기 위해 추가 by June */
  /* 2026.05.06 선택된 사진은 백그라운드 순서와 무관하게 즉시 위치를 보강해 상세 진입 직후 위치 공백 시간을 줄이기 위해 추가 by June */
  const prioritizePhotoLocation = useCallback(
    async (photo: Photo | undefined) => {
      if (!photo?.uri) return;
      if (photo.city || photo.country) return;
      if (priorityLocationInFlightRef.current.has(photo.uri)) return;

      priorityLocationInFlightRef.current.add(photo.uri);
      try {
        let latitude: number | null = photo.location
          ? Number(photo.location.latitude)
          : null;
        let longitude: number | null = photo.location
          ? Number(photo.location.longitude)
          : null;

        const hasValidCoords =
          typeof latitude === "number" &&
          typeof longitude === "number" &&
          Number.isFinite(latitude) &&
          Number.isFinite(longitude);

        if (!hasValidCoords) {
          try {
            const targetAssetId =
              photo.assetId ?? getAssetIdFromPhUri(photo.uri);
            const info = targetAssetId
              ? await MediaLibrary.getAssetInfoAsync(targetAssetId)
              : await MediaLibrary.getAssetInfoAsync(photo.uri as any);
            if (info?.location) {
              const lat = Number(info.location.latitude);
              const lon = Number(info.location.longitude);
              if (Number.isFinite(lat) && Number.isFinite(lon)) {
                latitude = lat;
                longitude = lon;
              }
            }
          } catch (e) {
            console.log("priority location asset info error:", e);
          }
        }

        if (
          typeof latitude !== "number" ||
          typeof longitude !== "number" ||
          !Number.isFinite(latitude) ||
          !Number.isFinite(longitude)
        ) {
          return;
        }

        let city: string | null = null;
        let country: string | null = null;
        const geoKey = toGeoKey(latitude, longitude, 2);

        try {
          const cached = await getGeocodeCacheByKey(geoKey);
          if (cached) {
            city = cached.city ?? null;
            country = cached.country ?? null;
          }
        } catch (e) {
          console.log("priority geocode cache read error:", e);
        }

        if (!city && !country) {
          try {
            const [res] = await Location.reverseGeocodeAsync({
              latitude,
              longitude,
            });
            country = res?.country ?? null;
            city = res?.city ?? res?.subregion ?? null;

            await upsertGeocodeCacheRows([
              {
                geoKey,
                latitude,
                longitude,
                country,
                city,
                updatedAt: Date.now(),
              },
            ]);
          } catch (e) {
            console.log("priority reverse geocode error:", e);
          }
        }

        setPhotosAll((prev) => {
          const nextBase = prev.map((p) =>
            p.uri === photo.uri
              ? {
                  ...p,
                  location: p.location ?? { latitude, longitude },
                  city: city ?? p.city,
                  country: country ?? p.country,
                }
              : p,
          );
          setPhotos(deriveVisiblePhotos(nextBase, filterRef.current));
          return nextBase;
        });
      } finally {
        priorityLocationInFlightRef.current.delete(photo.uri);
      }
    },
    [deriveVisiblePhotos],
  );

  /* 2026.05.27 선택 사진의 실제 위치 메타 보유 여부를 즉시 확인하기 위한 진단 로그 헬퍼 추가 by June */
  const debugPhotoLocationMeta = useCallback(async (photo: Photo) => {
    try {
      const uri = photo?.uri;
      if (!uri) return;

      const assetId = photo.assetId ?? getAssetIdFromPhUri(uri);
      if (!assetId && !uri.startsWith("file://")) {
        console.log("[LOCATION_DEBUG] unsupported-uri", JSON.stringify({ uri }));
        return;
      }
      const info = assetId
        ? await MediaLibrary.getAssetInfoAsync(assetId)
        : await MediaLibrary.getAssetInfoAsync(uri as any);
      if (!info) {
        console.log(
          "[LOCATION_DEBUG] selected_photo_meta",
          JSON.stringify({
            uri,
            assetId: assetId ?? null,
            infoIsNull: true,
            hasPhotoAssetId: !!photo.assetId,
          }),
        );
        return;
      }
      const exif: any = (info as any)?.exif ?? null;

      const exifGps =
        exif &&
        (exif.GPSLatitude ||
          exif.GPSLongitude ||
          exif.GPSLatitudeRef ||
          exif.GPSLongitudeRef)
          ? {
              GPSLatitude: exif.GPSLatitude ?? null,
              GPSLongitude: exif.GPSLongitude ?? null,
              GPSLatitudeRef: exif.GPSLatitudeRef ?? null,
              GPSLongitudeRef: exif.GPSLongitudeRef ?? null,
            }
          : null;

      console.log(
        "[LOCATION_DEBUG] selected_photo_meta",
        JSON.stringify({
          uri,
          assetId: assetId ?? null,
          hasPhotoAssetId: !!photo.assetId,
          infoHasLocation: !!info.location,
          infoLocation: info.location
            ? {
                latitude: Number(info.location.latitude),
                longitude: Number(info.location.longitude),
              }
            : null,
          localUri: info.localUri ?? null,
          infoUri: info.uri ?? null,
          exifGps,
        }),
      );
    } catch (e) {
      console.log("[LOCATION_DEBUG] selected_photo_meta_error", e);
    }
  }, []);

  /* 2026.05.06 초기 썸네일 선노출 후 위치(좌표→도시/국가)를 백그라운드에서 보강해 위치 누락 체감을 줄이기 위해 팔로업 함수를 추가 by June */
  /* 2026.05.06 초기 썸네일 노출 후 화면 상단 가시 범위 후보를 점진 보강해 썸네일 속도는 유지하면서 위치 누락을 줄이기 위해 추가 by June */
  const followUpVisibleLocations = useCallback(async () => {
    if (locationFollowUpInFlightRef.current) return;
    if (photosRef.current.length === 0) return;

    const candidates = photosRef.current
      .slice(0, 40)
      .filter((p) => !p.city && !p.country);

    if (candidates.length === 0) return;

    const signature = candidates.map((p) => p.uri).join("|");
    if (locationFollowUpSignatureRef.current === signature) return;

    locationFollowUpInFlightRef.current = true;
    locationFollowUpSignatureRef.current = signature;

    try {
      const withCoordinates: Photo[] = await Promise.all(
        candidates.map(async (photo) => {
          if (photo.location) return photo;

          try {
            const targetAssetId =
              photo.assetId ?? getAssetIdFromPhUri(photo.uri);
            const info = targetAssetId
              ? await MediaLibrary.getAssetInfoAsync(targetAssetId)
              : await MediaLibrary.getAssetInfoAsync(photo.uri as any);
            if (!info?.location) return photo;

            const latitude = Number(info.location.latitude);
            const longitude = Number(info.location.longitude);

            if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
              return photo;
            }

            return {
              ...photo,
              location: { latitude, longitude },
            };
          } catch {
            return photo;
          }
        }),
      );

      const withPlaces = await imagesWithLocation(withCoordinates, {
        maxLookups: 20,
        precision: 2,
        delayMs: 80,
      });

      const byUri = new Map(withPlaces.map((p: Photo) => [p.uri, p]));
      setPhotosAll((prev) => {
        const nextBase = prev.map((photo) => {
          const next = byUri.get(photo.uri);
          return next
            ? {
                ...photo,
                location: next.location ?? photo.location ?? null,
                city: next.city ?? photo.city,
                country: next.country ?? photo.country,
              }
            : photo;
        });
        setPhotos(deriveVisiblePhotos(nextBase, filterRef.current));
        return nextBase;
      });
    } finally {
      locationFollowUpInFlightRef.current = false;
    }
  }, [deriveVisiblePhotos]);

  /** 사진 정렬 처리: 최신순 + timestamp 없는 사진 최하단 표출 */
  /* 2026.04.15 정렬 함수 참조를 고정해 DB 조회 콜백이 렌더마다 재생성되지 않도록 하기 위해 useCallback 적용 by June */
  const sortPhotosForDisplay = useCallback((items: Photo[]) => {
    return [...items].sort((a, b) => {
      const aHasTs =
        typeof a.takenAt === "number" && Number.isFinite(a.takenAt);
      const bHasTs =
        typeof b.takenAt === "number" && Number.isFinite(b.takenAt);

      if (aHasTs && bHasTs) {
        /* 2026.05.28 기획상 최신 사진이 상단에 고정되어야 하므로 append 후에도 최신순 정렬을 유지하도록 수정 by June */
        return (b.takenAt as number) - (a.takenAt as number);
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
      const assetId = getAssetIdFromPhUri(uri);
      if (!assetId) return uri;
      const info = await MediaLibrary.getAssetInfoAsync(assetId);
      const resolved = info?.localUri ?? "";
      if (!resolved.startsWith("file://")) {
        return uri;
      }
      resolvedUriCacheRef.current.set(uri, resolved);
      if (resolved !== uri) {
        void upsertDisplayUriCacheRows([
          {
            sourceUri: uri,
            assetId,
            displayUri: resolved,
            updatedAt: Date.now(),
          },
        ]).catch((err) => {
          console.log("[Cache] displayUri persistent save error", err);
        });
      }
      return resolved;
    } catch (err) {
      console.log("resolveDisplayUri error:", err);
      return uri;
    }
  }, []);

  /* 2026.04.22 사용자가 사진을 눌렀을 때 해당 항목만 고해상도 URI로 보강해 리스트 전체 변환 없이 상세 품질을 확보하기 위해 뷰어 전용 로더를 추가 by June */
  const resolveViewerDetailUri = useCallback(
    async (sourceUri: string) => {
      const resolved = await resolveDisplayUri(sourceUri);
      setViewerDetailUriMap((prev) => {
        if (prev[sourceUri] === resolved) return prev;
        return { ...prev, [sourceUri]: resolved };
      });
    },
    [resolveDisplayUri],
  );

  const waitWithTimeout = useCallback(
    async (work: Promise<unknown>, timeoutMs: number) => {
      await Promise.race([
        work,
        new Promise((resolve) => setTimeout(resolve, timeoutMs)),
      ]);
    },
    [],
  );

  async function prepareAndStartSlideshow(params?: {
    startIndex?: number;
    sourceUris?: string[];
  }) {
    const currentUris =
      params?.sourceUris && params.sourceUris.length > 0
        ? params.sourceUris
        : photosRef.current.map((photo) => photo.uri);
    if (currentUris.length === 0) return;

    const safeIndex = Math.min(
      Math.max(params?.startIndex ?? 0, 0),
      currentUris.length - 1,
    );
    const sourcePhoto =
      photosRef.current.find((photo) => photo.uri === currentUris[safeIndex]) ??
      photosRef.current[safeIndex];
    slideshowRunTokenRef.current += 1;

    setSlideshowPreparing(true);
    try {
      setViewerPhotoUris(currentUris);
      setSlideshowPhotoUris(currentUris);

      startSlideshow(safeIndex, currentUris);

      const currentUri = currentUris[safeIndex];
      /* 2026.06.03 슬라이드쇼 시작은 즉시성을 우선하고 위치 reverse geocode까지 기다리지는 않도록 현재 장 상세 URI만 짧게 준비 by Codex */
      void waitWithTimeout(resolveViewerDetailUri(currentUri), SLIDESHOW_PREP_TIMEOUT_MS).catch(() => {});
      if (sourcePhoto) {
        void prioritizePhotoLocation(sourcePhoto);
      }
    } finally {
      setSlideshowPreparing(false);
    }
  }

  useEffect(() => {
    displayUriMapRef.current = displayUriMap;
  }, [displayUriMap]);

  useEffect(() => {
    thumbnailReadyByUriRef.current = thumbnailReadyByUri;
  }, [thumbnailReadyByUri]);

  useEffect(() => {
    thumbnailReadyByUriRef.current = {};
    setThumbnailReadyByUri({});
  }, [thumbnailBlockingSignature]);

  const markThumbnailReady = useCallback((uri: string) => {
    if (!uri) return;
    if (thumbnailReadyByUriRef.current[uri]) return;

    setThumbnailReadyByUri((prev) => {
      if (prev[uri]) return prev;
      const next: Record<string, true> = { ...prev, [uri]: true };
      thumbnailReadyByUriRef.current = next;
      return next;
    });
  }, []);

  useEffect(() => {
    setThumbnailResolveLimit(IOS_THUMBNAIL_RESOLVE_INITIAL_LIMIT);
  }, [filter.dateStart, filter.dateEnd, filter.timeStart, filter.timeEnd, filter.countries, filter.cities]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(thumbnailSkeletonAnim, {
        toValue: 1,
        duration: 1550,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
    );

    loop.start();

    return () => {
      loop.stop();
      thumbnailSkeletonAnim.stopAnimation();
      thumbnailSkeletonAnim.setValue(0);
    };
  }, [thumbnailSkeletonAnim]);

  const thumbnailSkeletonTranslateX = useMemo(
    () =>
      thumbnailSkeletonAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [-imageWidth * 1.15, imageWidth * 1.35],
      }),
    [thumbnailSkeletonAnim],
  );

  useEffect(() => {
    if (Platform.OS !== "ios") {
      setThumbnailResolving(false);
      return;
    }

    /* 2026.05.28 기존 200장 동시 변환은 iOS 메모리 피크를 만들 수 있어 현재 화면 근처 항목만 순차 배치로 해상하도록 변경 by June */
    const targets = photos
      .slice(0, thumbnailResolveLimit)
      .map((p) => p.uri)
      .filter(
        (uri) => uri.startsWith("ph://") && !displayUriMapRef.current[uri],
      );

    if (targets.length === 0) {
      setThumbnailResolving(false);
      return;
    }

    let cancelled = false;
    const runId = thumbnailResolveRunIdRef.current + 1;
    thumbnailResolveRunIdRef.current = runId;
    setThumbnailResolveRunId(runId);
    setThumbnailResolving(true);
    console.log("[Thumbnail] queue", {
      runId,
      total: targets.length,
      cached: Object.keys(displayUriMapRef.current).length,
      limit: thumbnailResolveLimit,
    });

    void (async () => {
      try {
        for (
          let i = 0;
          i < targets.length;
          i += IOS_THUMBNAIL_RESOLVE_BATCH_SIZE
        ) {
          if (cancelled || thumbnailResolveRunIdRef.current !== runId) {
            console.log("[Thumbnail] skipped stale request", {
              runId,
              current: thumbnailResolveRunIdRef.current,
              start: i,
            });
            return;
          }

          const batch = targets.slice(
            i,
            i + IOS_THUMBNAIL_RESOLVE_BATCH_SIZE,
          );
          console.log("[Thumbnail] batch start", {
            runId,
            start: i,
            size: batch.length,
          });
          const pairs = await Promise.all(
            batch.map(
              async (uri) => [uri, await resolveDisplayUri(uri)] as const,
            ),
          );

          if (cancelled || thumbnailResolveRunIdRef.current !== runId) {
            console.log("[Thumbnail] skipped stale request", {
              runId,
              current: thumbnailResolveRunIdRef.current,
              start: i,
            });
            return;
          }

          setDisplayUriMap((prev) => {
            let changed = false;
            const next = { ...prev };
            for (const [sourceUri, resolvedUri] of pairs) {
              if (
                !next[sourceUri] &&
                resolvedUri &&
                resolvedUri !== sourceUri
              ) {
                next[sourceUri] = resolvedUri;
                changed = true;
              }
            }
            if (changed) displayUriMapRef.current = next;
            if (changed) {
              console.log("[Cache] displayUriMap size", {
                size: Object.keys(next).length,
              });
            }
            return changed ? next : prev;
          });
          console.log("[Thumbnail] batch done", {
            runId,
            start: i,
            resolved: pairs.length,
          });

          if (i + IOS_THUMBNAIL_RESOLVE_BATCH_SIZE < targets.length) {
            await new Promise((resolve) =>
              setTimeout(resolve, IOS_THUMBNAIL_RESOLVE_BATCH_DELAY_MS),
            );
          }
        }
      } finally {
        if (!cancelled && thumbnailResolveRunIdRef.current === runId) {
          setThumbnailResolving(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [photos, resolveDisplayUri, thumbnailResolveLimit]);

  /* 2026.06.02 초기/필터 로드 직후 자동 위치 보강은 사용자가 요청하지 않은 추가 작업이라 비활성화.
     위치 정보는 위치 필터 적용, 지도 진입, 썸네일 탭 같은 명시적 액션에서만 확장되도록 유지 by June */

  /* 2026.04.15 DB 조회 결과를 기존 화면 Photo 타입으로 안전하게 변환해 기존 렌더링/로케이션 코드와 호환시키기 위해 추가 by June */
  const mapDbRowsToPhotos = useCallback(
    (
      rows: {
        assetId?: string;
        uri: string;
        takenAt: number | null;
        latitude: number | null;
        longitude: number | null;
      }[],
    ): Photo[] => {
      return rows.map((row) => ({
        uri: row.uri,
        assetId: row.assetId,
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
    [],
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
          },
        );
        return {
          usedDb: false as const,
          photos: [] as Photo[],
          dbHasMore: false,
          nextOffset: offset,
          isIndexComplete: false,
          totalCount: 0,
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
          },
        );
        return {
          usedDb: false as const,
          photos: [] as Photo[],
          dbHasMore: false,
          nextOffset: offset,
          isIndexComplete: false,
          totalCount: 0,
        };
      }
      /* 2026.04.22 인덱싱 완료 여부를 함께 확인해 DB 단독 신뢰 여부를 결정하기 위해 동기화 상태 조회 추가 by June */
      const syncState = await getPhotoSyncState();
      const isIndexComplete = !syncState.hasNextPage;
      setDbIndexComplete(isIndexComplete);
      const queryDateStartMs = dayStartMs(currentFilter.dateStart);
      const queryDateEndNextMs = dayEndNextMs(currentFilter.dateEnd);
      const totalCount = await countPhotoMetadataByDateTime({
        dateStartMs: queryDateStartMs,
        dateEndNextMs: queryDateEndNextMs,
        timeStart: currentFilter.timeStart,
        timeEnd: currentFilter.timeEnd,
      });

      console.log("[PhotoLoad] db query range", {
        dateStart: new Date(queryDateStartMs).toISOString(),
        dateEndNext: new Date(queryDateEndNextMs).toISOString(),
        timeStart: currentFilter.timeStart,
        timeEnd: currentFilter.timeEnd,
        limit,
        offset,
        isIndexComplete,
        indexedCount: metadataCount,
      });

      const rows = await queryPhotoMetadataByDateTime({
        dateStartMs: queryDateStartMs,
        dateEndNextMs: queryDateEndNextMs,
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
          },
        );
        return {
          usedDb: false as const,
          photos: [] as Photo[],
          dbHasMore: false,
          nextOffset: offset,
          isIndexComplete,
          totalCount,
        };
      }

      /* 2026.04.22 DB 조회 성공 지연을 결과 건수와 함께 기록해 장기 범위 검색 최적화 튜닝 포인트를 찾기 위해 계측을 추가 by June */
      recordPerfMetric(
        "home.db_datetime_query.ms",
        Date.now() - dbLoadStartedAt,
        {
          context: {
            usedDb: true,
            resultCount: photosFromDb.length,
            limit,
            offset,
            dbHasMore,
            isIndexComplete,
          },
          logEvery: 2,
        },
      );

      return {
        usedDb: true as const,
        photos: photosFromDb,
        dbHasMore,
        isIndexComplete,
        totalCount,
        /* 2026.04.22 다음 append 시작 오프셋을 한 곳에서 계산해 호출부의 중복 계산/오차를 방지하기 위해 반환값에 포함 by June */
        nextOffset: offset + photosFromDb.length,
      };
    },
    [
      dayEndNextMs,
      dayStartMs,
      dedupePhotosByUri,
      mapDbRowsToPhotos,
      sortPhotosForDisplay,
    ],
  );

  const loadAllPhotosFromDbForDateTime = useCallback(
    async (currentFilter: FilterState) => {
      const baseFilter = buildBaseDateTimeFilter(currentFilter);
      const totalCount = await countPhotoMetadataByDateTime({
        dateStartMs: dayStartMs(baseFilter.dateStart),
        dateEndNextMs: dayEndNextMs(baseFilter.dateEnd),
        timeStart: baseFilter.timeStart,
        timeEnd: baseFilter.timeEnd,
      });

      if (totalCount <= 0) {
        return {
          photos: [] as Photo[],
          totalCount: 0,
          isCacheHit: false,
        };
      }

      const rows = await queryPhotoMetadataByDateTime({
        dateStartMs: dayStartMs(baseFilter.dateStart),
        dateEndNextMs: dayEndNextMs(baseFilter.dateEnd),
        timeStart: baseFilter.timeStart,
        timeEnd: baseFilter.timeEnd,
        limit: totalCount,
        offset: 0,
      });

      return {
        photos: sortPhotosForDisplay(
          dedupePhotosByUri(mapDbRowsToPhotos(rows)),
        ),
        totalCount,
        isCacheHit: rows.length > 0,
      };
    },
    [
      buildBaseDateTimeFilter,
      dayEndNextMs,
      dayStartMs,
      dedupePhotosByUri,
      mapDbRowsToPhotos,
      sortPhotosForDisplay,
    ],
  );

  const collectAllPhotosForDateTimeRange = useCallback(
    async (
      currentFilter: FilterState,
      mode: "initial" | "filter-reset" | "append",
    ) => {
      const collected: Photo[] = [];
      let cursor: string | null = null;
      let nextPage = true;
      let totalCount = 0;

      while (nextPage) {
        const result = await fetchAssetsPage({
          after: cursor,
          first: FETCH_PAGE_SIZE,
          createdAfter: dayStartMs(currentFilter.dateStart),
          createdBefore: dayEndNextMs(currentFilter.dateEnd),
        });

        totalCount = result.totalCount ?? totalCount;
        const assets = (result.assets ?? []).filter((asset) =>
          matchesDateTimeFilter(asset, currentFilter),
        );
        const needsLocation = shouldUseGeocoding(currentFilter, mode);
        let photosChunk = await hydrateAssetsToPhotos(assets, {
          enrichLocationOnAndroid: needsLocation,
        });

        if (needsLocation) {
          photosChunk = await imagesWithLocation(photosChunk, {
            maxLookups: photosChunk.length,
            precision: 2,
            delayMs: 80,
          });
        }

        collected.push(...photosChunk);
        cursor = result.endCursor ?? null;
        nextPage = result.hasNextPage;
      }

      return {
        photos: sortPhotosForDisplay(dedupePhotosByUri(collected)),
        totalCount,
      };
    },
    [
      dayEndNextMs,
      dayStartMs,
      dedupePhotosByUri,
      fetchAssetsPage,
      hydrateAssetsToPhotos,
      imagesWithLocation,
      matchesDateTimeFilter,
      shouldUseGeocoding,
      sortPhotosForDisplay,
    ],
  );

  const loadPhotosForDateTimeSegment = useCallback(
    async (currentFilter: FilterState, mode: "initial" | "filter-reset" | "append") => {
      const hasLocationFilter =
        currentFilter.countries.length > 0 || currentFilter.cities.length > 0;
      if (!hasLocationFilter) {
        const dbLoaded = await loadAllPhotosFromDbForDateTime(currentFilter);
        if (dbLoaded.isCacheHit) {
          return {
            photos: dbLoaded.photos,
            totalCount: dbLoaded.totalCount,
            source: "db" as const,
          };
        }
      }

      const mediaLoaded = await collectAllPhotosForDateTimeRange(currentFilter, mode);
      return {
        photos: mediaLoaded.photos,
        totalCount: mediaLoaded.totalCount,
        source: "medialibrary" as const,
      };
    },
    [collectAllPhotosForDateTimeRange, loadAllPhotosFromDbForDateTime],
  );

  /* 2026.06.11 완전 로드된 coverage를 여러 조각까지 재사용하고, 빠진 구간만 보충해서 이어붙이도록 확장 by June */
  const tryReuseLoadedBaseRangeFromMemory = useCallback(
    async (currentFilter: FilterState) => {
      const requestedStartMs = dayStartMs(currentFilter.dateStart);
      const requestedEndNextMs = dayEndNextMs(currentFilter.dateEnd);

      const candidateCoverages = loadedDateTimeCoverageRef.current
        .filter(
          (entry) =>
            entry.fullyLoaded &&
            isDateTimeCoverageTimeCompatible(entry, currentFilter) &&
            entry.dateEndNextMs > requestedStartMs &&
            entry.dateStartMs < requestedEndNextMs,
        )
        .sort((a, b) => {
          if (a.dateStartMs !== b.dateStartMs) {
            return a.dateStartMs - b.dateStartMs;
          }
          return a.dateEndNextMs - b.dateEndNextMs;
        });

      if (candidateCoverages.length === 0) return false;

      const reusedPhotos: Photo[] = [];
      const missingIntervals: { startMs: number; endMs: number }[] = [];
      let cursor = requestedStartMs;

      for (const coverage of candidateCoverages) {
        const sliceStartMs = Math.max(requestedStartMs, coverage.dateStartMs);
        const sliceEndNextMs = Math.min(requestedEndNextMs, coverage.dateEndNextMs);
        if (sliceStartMs >= sliceEndNextMs) continue;

        if (sliceStartMs > cursor) {
          missingIntervals.push({
            startMs: cursor,
            endMs: sliceStartMs,
          });
        }

        reusedPhotos.push(
          ...coverage.photos.filter((photo) => {
            const ts = photo.takenAt;
            if (typeof ts !== "number" || !Number.isFinite(ts)) return true;
            return ts >= sliceStartMs && ts < sliceEndNextMs;
          }),
        );

        cursor = Math.max(cursor, sliceEndNextMs);
      }

      if (reusedPhotos.length === 0) return false;

      if (cursor < requestedEndNextMs) {
        missingIntervals.push({
          startMs: cursor,
          endMs: requestedEndNextMs,
        });
      }

      const gapPhotos: Photo[] = [];
      let gapSource: "db" | "medialibrary" = "db";

      for (const gap of missingIntervals) {
        if (gap.startMs >= gap.endMs) continue;

        const gapFilter = {
          ...currentFilter,
          dateStart: new Date(gap.startMs),
          dateEnd: new Date(gap.endMs - 1),
        };
        const gapResult = await loadPhotosForDateTimeSegment(
          gapFilter,
          "filter-reset",
        );

        if (gapResult.source === "medialibrary") {
          gapSource = "medialibrary";
        }
        gapPhotos.push(...gapResult.photos);
      }

      const nextBase = sortPhotosForDisplay(
        dedupePhotosByUri([...reusedPhotos, ...gapPhotos]),
      );
      const nextVisible = deriveVisiblePhotos(nextBase, currentFilter);

      setCurrentDataSource(gapSource);
      setPhotosAll(nextBase);
      setPhotos(nextVisible);
      photosAllRef.current = nextBase;
      photosRef.current = nextVisible;
      pruneDisplayUriCacheForPhotos(nextBase);
      setEndCursor(null);
      setHasNextPage(false);
      dbDateTimePagingRef.current = { enabled: false, offset: 0 };
      setLocationSearchTargetTotalCount(nextVisible.length);
      void refreshFilterProgress(currentFilter, nextVisible.length);
      markLoadedBaseRange(currentFilter, true);
      setEmptyMessage(nextVisible.length === 0 ? EMPTY_DEFAULT_MESSAGE : null);
      return true;
    },
    [
      EMPTY_DEFAULT_MESSAGE,
      dayEndNextMs,
      dayStartMs,
      dedupePhotosByUri,
      deriveVisiblePhotos,
      isDateTimeCoverageTimeCompatible,
      loadPhotosForDateTimeSegment,
      markLoadedBaseRange,
      pruneDisplayUriCacheForPhotos,
      refreshFilterProgress,
      sortPhotosForDisplay,
    ],
  );

  const tryApplyIncrementalDateRangeReload = useCallback(
    async (currentFilter: FilterState) => {
      const previousBaseFilter = lastLoadedBaseFilterRef.current;
      if (!previousBaseFilter) return false;
      if (!lastLoadedBaseFullyLoadedRef.current) return false;
      if (
        photosAllRef.current.length <= 0 ||
        photosAllRef.current.length > INCREMENTAL_DATE_RELOAD_MAX_BASE_SIZE
      ) {
        return false;
      }
      if (
        previousBaseFilter.timeStart !== currentFilter.timeStart ||
        previousBaseFilter.timeEnd !== currentFilter.timeEnd
      ) {
        return false;
      }

      const startShift = Math.abs(
        diffDaysDateOnly(previousBaseFilter.dateStart, currentFilter.dateStart),
      );
      const endShift = Math.abs(
        diffDaysDateOnly(previousBaseFilter.dateEnd, currentFilter.dateEnd),
      );
      if (
        startShift > INCREMENTAL_DATE_RELOAD_MAX_SHIFT_DAYS ||
        endShift > INCREMENTAL_DATE_RELOAD_MAX_SHIFT_DAYS
      ) {
        return false;
      }

      const nextBaseFilter = buildBaseDateTimeFilter(currentFilter);
      const keptBase = photosAllRef.current.filter((photo) => {
        const ts = photo.takenAt;
        if (typeof ts !== "number" || !Number.isFinite(ts)) return true;
        return (
          ts >= dayStartMs(nextBaseFilter.dateStart) &&
          ts < dayEndNextMs(nextBaseFilter.dateEnd)
        );
      });

      const additionalFilters: FilterState[] = [];
      if (currentFilter.dateStart < previousBaseFilter.dateStart) {
        const additionalEnd = new Date(previousBaseFilter.dateStart);
        additionalEnd.setDate(additionalEnd.getDate() - 1);
        additionalFilters.push(
          buildBaseDateTimeFilter({
            ...currentFilter,
            dateStart: currentFilter.dateStart,
            dateEnd: additionalEnd,
          }),
        );
      }
      if (currentFilter.dateEnd > previousBaseFilter.dateEnd) {
        const additionalStart = new Date(previousBaseFilter.dateEnd);
        additionalStart.setDate(additionalStart.getDate() + 1);
        additionalFilters.push(
          buildBaseDateTimeFilter({
            ...currentFilter,
            dateStart: additionalStart,
            dateEnd: currentFilter.dateEnd,
          }),
        );
      }

      const additionalSegments = await Promise.all(
        additionalFilters.map((segmentFilter) =>
          loadPhotosForDateTimeSegment(segmentFilter, "filter-reset"),
        ),
      );

      const nextBase = sortPhotosForDisplay(
        dedupePhotosByUri([
          ...keptBase,
          ...additionalSegments.flatMap((segment) => segment.photos),
        ]),
      );
      const nextVisible = deriveVisiblePhotos(nextBase, currentFilter);

      await hydratePersistedDisplayUriCache(nextBase, "incremental-date-reload");
      setPhotosAll(nextBase);
      setPhotos(nextVisible);
      photosAllRef.current = nextBase;
      photosRef.current = nextVisible;
      pruneDisplayUriCacheForPhotos(nextBase);
      setEndCursor(null);
      setHasNextPage(false);
      dbDateTimePagingRef.current = {
        enabled: true,
        offset: nextBase.length,
      };
      setLocationSearchTargetTotalCount(nextBase.length);
      void refreshFilterProgress(currentFilter, nextVisible.length);
      markLoadedBaseRange(currentFilter, true);
      return true;
    },
    [
      buildBaseDateTimeFilter,
      dayEndNextMs,
      dayStartMs,
      dedupePhotosByUri,
      deriveVisiblePhotos,
      diffDaysDateOnly,
      hydratePersistedDisplayUriCache,
      loadPhotosForDateTimeSegment,
      markLoadedBaseRange,
      pruneDisplayUriCacheForPhotos,
      refreshFilterProgress,
      sortPhotosForDisplay,
    ],
  );

  /* 2026.05.26 Android에서 Location.reverseGeocodeAsync가 위치 권한을 요구하지만 앱 측에서 권한 요청을
     하지 않아 country/city 보강이 영구 차단되던 문제 수정. 사용자에게 한 번만 묻고 결과를 모듈 스코프에
     캐시해 반복 다이얼로그를 방지 by yen */
  const ensureLocationPermissionOnce = async () => {
    if (locationPermissionAskedRef.current) return;
    locationPermissionAskedRef.current = true;
    try {
      if (Platform.OS === "android") {
        /* 2026.05.27 Android에서 사진 EXIF GPS를 읽으려면 foreground 위치 권한과 별개로 ACCESS_MEDIA_LOCATION 권한이 필요해 추가 요청 by June */
        const hasMediaLocation = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.ACCESS_MEDIA_LOCATION,
        );
        if (!hasMediaLocation) {
          await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.ACCESS_MEDIA_LOCATION,
          );
        }
      }

      const current = await Location.getForegroundPermissionsAsync();
      if (current.status === "granted") return;
      if (!current.canAskAgain) return;
      await Location.requestForegroundPermissionsAsync();
    } catch {
      // 권한 요청 실패는 무시 — 위치 필터만 비어 있고 사진 로딩에는 영향 없음
    }
  };

  /** 사진 접근 권한 처리 */
  const ensurePhotoPermission = async () => {
    const { status, canAskAgain } = await MediaLibrary.getPermissionsAsync();

    let hasPerm = status === "granted";

    if (!hasPerm && canAskAgain) {
      const req = await MediaLibrary.requestPermissionsAsync(false);
      hasPerm = req.status === "granted";
    }

    if (hasPerm) {
      /* 2026.05.26 Android에서 Location.reverseGeocodeAsync는 위치 권한이 있어야 동작 — 사진 권한 획득 후
         일회성으로 foreground 위치 권한을 요청해 country/city 보강이 진행되도록 처리. iOS는 권한 없이도
         reverse geocode가 동작하므로 건너뜀. 사용자가 거부해도 사진 로딩은 그대로 동작하며 위치 필터만
         빈 상태로 유지됨 by yen */
      if (Platform.OS === "android") {
        await ensureLocationPermissionOnce();
      }
      return true;
    }

    if (!canAskAgain) {
      /* 2026.04.22 권한 거부 안내 알럿을 다국어로 통일해 언어 설정과 사용자 안내 문구를 일치시키기 위해 수정 by June */
      Alert.alert(
        t("permissionRequiredTitle", "Permission Required"),
        t(
          "photoPermissionSettingsMessage",
          "To display photos, allow photo access in Settings.",
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
        ],
      );
    } else {
      /* 2026.04.22 재요청 가능 상태의 권한 알럿도 다국어 처리해 언어별 UX 일관성을 유지하기 위해 수정 by June */
      Alert.alert(
        t("permissionRequiredTitle", "Permission Required"),
        t("photoPermissionRequired", "Photo access permission is required."),
      );
    }

    return false;
  };

  /** 목표 개수 확보까지 반복 fetch 처리 */
  const collectPhotosForTarget = useCallback(async ({
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
    const pageStartedAt = Date.now();
    const result = await fetchAssetsPage({
      after: startCursor,
      first: targetCount,
      createdAfter: dayStartMs(currentFilter.dateStart),
      createdBefore: dayEndNextMs(currentFilter.dateEnd),
    });

    const totalCount = result.totalCount ?? 0;
    const assets = result.assets ?? [];
    const dateTimeMatched = assets.filter((asset) =>
      matchesDateTimeFilter(asset, currentFilter),
    );

    /* 2026.05.26 위치 필터가 활성일 때만 Android에서 per-asset location 보강을 활성화 — 그래야
       Android에서 country/city 필터링이 실제로 동작 by yen */
    const needsLocation = shouldUseGeocoding(currentFilter, mode);
    let photosChunk = await hydrateAssetsToPhotos(dateTimeMatched, {
      enrichLocationOnAndroid: needsLocation,
    });

    if (needsLocation) {
      photosChunk = await imagesWithLocation(photosChunk, {
        maxLookups: photosChunk.length,
        precision: 2,
        delayMs: 80,
      });
    }

    /* 2026.04.22 페이지 처리 시간을 모드/누적건수와 함께 기록해 append/background 튜닝 근거를 확보하기 위해 계측을 추가 by June */
    recordPerfMetric("home.collect_page.ms", Date.now() - pageStartedAt, {
      context: {
        mode,
        pageCount: 1,
        collected: photosChunk.length,
        totalCount,
      },
      logEvery: 3,
    });

    /* 2026.04.22 수집 루프 전체 시간을 기록해 날짜 범위별 체감 지연과의 상관관계를 추적하기 위해 계측을 추가 by June */
    recordPerfMetric("home.collect_total.ms", Date.now() - collectStartedAt, {
      context: {
        mode,
        pageCount: 1,
        collected: photosChunk.length,
        targetCount,
      },
      logEvery: 2,
    });

    return {
      photos: photosChunk,
      endCursor: result.endCursor ?? null,
      hasNextPage: result.hasNextPage,
      totalCount,
    };
  }, [
    dayEndNextMs,
    dayStartMs,
    hydrateAssetsToPhotos,
    imagesWithLocation,
  ]);

  /** 날짜 범위 전용 fallback. 현재는 MediaLibrary 자체 createdAfter/createdBefore 질의를 사용해
      선택한 날짜 범위에서만 최신순 페이지네이션을 수행하도록 변경 by June */
  const collectPhotosForDateRangeFallback = async ({
    currentFilter,
    targetCount,
    startCursor = null,
    mode,
    maxPages = DATE_RANGE_FALLBACK_MAX_PAGES,
  }: {
    currentFilter: FilterState;
    targetCount: number;
    startCursor?: string | null;
    mode: "initial" | "background" | "append" | "filter-reset";
    maxPages?: number;
  }) => {
    /* 2026.06.02 선택한 날짜 범위를 MediaLibrary에 직접 전달해 최신->과거 전역 스캔을 제거 by June */
    const collectStartedAt = Date.now();
    const rangeStartMs = dayStartMs(currentFilter.dateStart);
    const rangeEndNextMs = dayEndNextMs(currentFilter.dateEnd);
    let cursor: string | null = startCursor;
    let nextPage = true;
    let totalCount = 0;
    let pageCount = 0;
    let reachedDateWindow = false;
    let passedDateWindow = false;
    const collected: Photo[] = [];

    while (
      nextPage &&
      collected.length < targetCount &&
      pageCount < maxPages &&
      !passedDateWindow
    ) {
      pageCount += 1;
      const result = await fetchAssetsPage({
        after: cursor,
        first: FETCH_PAGE_SIZE,
        createdAfter: rangeStartMs,
        createdBefore: rangeEndNextMs,
      });

      totalCount = result.totalCount ?? totalCount;
      const assets = result.assets ?? [];
      const timestamps = assets
        .map((asset) => getAssetTimestampMs(asset))
        .filter((ts): ts is number => typeof ts === "number");

      const newestMs = timestamps.length ? Math.max(...timestamps) : null;
      const oldestMs = timestamps.length ? Math.min(...timestamps) : null;
      reachedDateWindow = reachedDateWindow || assets.length > 0;

      const dateTimeMatched = assets.filter((asset) =>
        matchesDateTimeFilter(asset, currentFilter),
      );

      const needsLocation = shouldUseGeocoding(currentFilter, mode);
      let photosChunk = await hydrateAssetsToPhotos(dateTimeMatched, {
        enrichLocationOnAndroid: needsLocation,
      });

      if (needsLocation) {
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

      /* 같은 날짜 범위 내 페이징이므로 더 이상 다음 페이지가 없거나 targetCount를 채우면 종료 */
      if (!nextPage || assets.length === 0) {
        passedDateWindow = true;
      }

      console.log("[PhotoLoad] medialibrary date fallback page", {
        mode,
        pageCount,
        fetched: assets.length,
        matched: locationMatched.length,
        collected: collected.length,
        newest: newestMs ? new Date(newestMs).toISOString() : null,
        oldest: oldestMs ? new Date(oldestMs).toISOString() : null,
        reachedDateWindow,
        passedDateWindow,
        hasNextPage: nextPage,
      });
    }

    const hasNextPageForRange =
      collected.length >= targetCount ? nextPage : nextPage && !passedDateWindow;

    console.log("[PhotoLoad] medialibrary date fallback done", {
      mode,
      pageCount,
      collected: collected.length,
      targetCount,
      reachedDateWindow,
      passedDateWindow,
      maxPages,
      hasNextPage: hasNextPageForRange,
      elapsedMs: Date.now() - collectStartedAt,
    });

    return {
      photos: collected,
      endCursor: cursor,
      hasNextPage: hasNextPageForRange,
      totalCount,
      pageCount,
      reachedDateWindow,
      passedDateWindow,
    };
  };

  /** 앱 기동 후 초기 진입 시 사진 로드 빠르게 처리 */
  const loadInitialPhotos = useCallback(async () => {
    if (requestInFlightRef.current || initialLoadStartedRef.current) {
      return;
    }

    initialLoadStartedRef.current = true;
    requestInFlightRef.current = true;
    let initialHasNextPage = false;
    /* 2026.04.22 초기 진입 로딩 총 시간을 계측해 사용자 첫 체감 속도를 p50/p95로 관리하기 위해 타이머를 추가 by June */
    const initialLoadStartedAt = Date.now();
    /* 2026.04.22 초기 로드가 DB/MediaLibrary 중 어떤 경로를 탔는지 성능 로그에 남기기 위해 경로 라벨 변수를 추가 by June */
    let initialLoadPath:
      | "db"
      | "medialibrary"
      | "permission_denied"
      | "skipped" = "skipped";

    const initialFilterForLoad: FilterState = {
      dateStart: defaultRangeStart,
      dateEnd: new Date(),
      timeStart: 0,
      timeEnd: 1439,
      countries: [],
      cities: [],
    };
    const requestId = beginPhotoLoad("idle", initialFilterForLoad);

    const ok = await ensurePhotoPermission();
    if (!ok) {
      initialLoadPath = "permission_denied";
      setCurrentDataSource("permission-denied");
      requestInFlightRef.current = false;
      initialLoadStartedRef.current = false;
      /* 2026.04.22 권한 거부 케이스도 계측에 포함해 초기 로드 실패 원인 비율을 확인하기 위해 로그를 추가 by June */
      recordPerfMetric(
        "home.initial_load.ms",
        Date.now() - initialLoadStartedAt,
        {
          context: { path: initialLoadPath },
          logEvery: 1,
        },
      );
      return;
    }

    setInitialLoading(true);
    setEmptyMessage(null);

    try {
      const initialDbResult = await tryLoadPhotosFromDbForDateTime(
        buildBaseDateTimeFilter(initialFilterForLoad),
        INITIAL_TARGET_COUNT,
        0,
      );

      let initialBase: Photo[] = [];
      let nextCursor: string | null = null;
      let nextHasPage = false;

      if (initialDbResult.usedDb && initialDbResult.photos.length > 0) {
        initialLoadPath = "db";
        setCurrentDataSource("db");
        initialBase = initialDbResult.photos.slice(0, INITIAL_TARGET_COUNT);
        nextHasPage =
          initialDbResult.dbHasMore || !initialDbResult.isIndexComplete;
        dbDateTimePagingRef.current = {
          enabled: true,
          offset: initialDbResult.nextOffset,
        };
        setLocationSearchTargetTotalCount(
          initialDbResult.totalCount > 0 ? initialDbResult.totalCount : null,
        );
      } else {
        initialLoadPath = "medialibrary";
        setCurrentDataSource("medialibrary");
        const result = await collectPhotosForTarget({
          currentFilter: initialFilterForLoad,
          targetCount: INITIAL_TARGET_COUNT,
          startCursor: null,
          mode: "initial",
        });

        initialBase = sortPhotosForDisplay(
          dedupePhotosByUri(result.photos),
        ).slice(0, INITIAL_TARGET_COUNT);
        nextCursor = result.endCursor ?? null;
        nextHasPage = result.hasNextPage;
        dbDateTimePagingRef.current = { enabled: false, offset: 0 };
        setLocationSearchTargetTotalCount(
          typeof result.totalCount === "number" && result.totalCount > 0
            ? result.totalCount
            : null,
        );
      }

      initialHasNextPage = nextHasPage;
      const initial = deriveVisiblePhotos(initialBase, initialFilterForLoad);
      console.log("[PhotoLoad] fetched", {
        requestId,
        source: initialLoadPath,
        count: initialBase.length,
      });
      console.log("[PhotoLoad] sorted first", {
        requestId,
        creationTime: initialBase[0]?.takenAt ?? null,
      });
      if (!isLatestPhotoLoad(requestId)) {
        skipStalePhotoLoad(requestId, "initial medialibrary apply");
        return;
      }

      await hydratePersistedDisplayUriCache(initialBase, "initial-medialibrary");
      setPhotos(initial);
      setPhotosAll(initialBase);
      /* 2026.04.22 초기 MediaLibrary 경로에서도 현재 표출 건수를 progress에 반영해 사용자에게 로드 상태를 보여주기 위해 추가 by June */
      void refreshFilterProgress(
        {
          dateStart: defaultRangeStart,
          dateEnd: new Date(),
          timeStart: 0,
          timeEnd: 1439,
          countries: [],
          cities: [],
        },
        initial.length,
      );
      setEndCursor(nextCursor);
      setHasNextPage(nextHasPage);
      markLoadedBaseRange(initialFilterForLoad, !nextHasPage);
      setDidInitialLoad(true);
    } catch (err) {
      console.log("initial load error:", err);
    } finally {
      /* 2026.04.22 초기 로드 전체 시간을 경로/결과건수와 함께 기록해 실제 체감 성능 회귀를 빠르게 탐지하기 위해 계측을 추가 by June */
      recordPerfMetric(
        "home.initial_load.ms",
        Date.now() - initialLoadStartedAt,
        {
          context: {
            path: initialLoadPath,
            visibleCount: photosRef.current.length,
            initialHasNextPage,
          },
          logEvery: 1,
        },
      );
      setInitialLoading(false);
      requestInFlightRef.current = false;
      if (!didInitialLoad) {
        initialLoadStartedRef.current = false;
      }

      /* 2026.04.22 자동 background append 대신 하단 명시적 버튼으로만 다음 페이지를 로드하도록 UX 정책을 변경해 예측 가능한 동작을 제공하기 위해 자동 호출 제거 by June */
    }
    /* 2026.04.15 loadMorePhotos 선언 순서와의 순환 참조를 피하기 위해 의존성 배열에서 제외하고 기존 동작과 동일하게 후속 로딩을 유지하도록 수정 by June */
  }, [
    beginPhotoLoad,
    buildBaseDateTimeFilter,
    collectPhotosForTarget,
    dedupePhotosByUri,
    deriveVisiblePhotos,
    hydratePersistedDisplayUriCache,
    isLatestPhotoLoad,
    markLoadedBaseRange,
    defaultRangeStart,
    refreshFilterProgress,
    sortPhotosForDisplay,
    skipStalePhotoLoad,
    tryLoadPhotosFromDbForDateTime,
    didInitialLoad,
  ]);

  /** 날짜 필터 변경 처리 - 유저가 날짜 변경 시 해당 날짜 조건에 맞는 결과를 찾을 때까지 다시 탐색 */
  const reloadPhotosForFilter = useCallback(async () => {
    const currentFilter = filterRef.current;
    const requestId = beginPhotoLoad("idle", currentFilter);

    if (requestInFlightRef.current) {
      pendingReloadRef.current = true;
      setPendingReloadVisible(true);
      console.log("[Filter] changed", {
        requestId,
        pending: true,
        filter: formatFilterForLog(currentFilter),
      });
      setAsyncWarnings((prev) =>
        ["filter reload queued while previous request is running", ...prev].slice(
          0,
          5,
        ),
      );
      return;
    }

    /* 2026.04.22 필터 변경 시 재검색 총 시간을 계측해 사용자 액션 체감 속도를 p50/p95로 관리하기 위해 타이머를 추가 by June */
    const reloadStartedAt = Date.now();
    /* 2026.04.22 필터 재검색 경로(DB/MediaLibrary)를 로그에서 구분하기 위해 경로 라벨 변수를 추가 by June */
    let reloadPath: "db" | "medialibrary" | "permission_denied" | "skipped" =
      "skipped";

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
    setAppendLoading(false);
    setBackgroundLoading(false);
    setThumbnailResolving(false);
    thumbnailResolveRunIdRef.current += 1;
    setThumbnailResolveRunId(thumbnailResolveRunIdRef.current);
    /* 2026.04.22 필터 변경 시 이전 상세 URI 캐시를 비워 누적 메모리 증가를 방지하기 위해 초기화 추가 by June */
    setViewerDetailUriMap({});
    /* 2026.04.22 필터 재검색 시작 시 progress를 초기화해 이전 필터 값이 남아 혼동되는 것을 방지하기 위해 추가 by June */
    setProgress({ loaded: 0, total: null });
    setLocationSearchTargetTotalCount(null);
    setEndCursor(null); // 새 필터는 처음부터 다시 시작
    setHasNextPage(true); // 새 필터는 다시 탐색 가능 상태로 초기화
    /* 2026.04.22 필터 변경 시 이전 DB 오프셋이 남아 다음 조회가 어긋나는 문제를 막기 위해 페이지네이션 상태를 먼저 초기화 by June */
    dbDateTimePagingRef.current = { enabled: false, offset: 0 };
    console.log("[Filter] changed", {
      requestId,
      pending: false,
      filter: formatFilterForLog(currentFilter),
    });

    try {
      const reusedLoadedBase = await tryReuseLoadedBaseRangeFromMemory(
        currentFilter,
      );
      if (reusedLoadedBase) {
        reloadPath = "db";
        setEmptyMessage(
          photosRef.current.length === 0 ? EMPTY_DEFAULT_MESSAGE : null,
        );
        return;
      }

      const incrementalApplied = await tryApplyIncrementalDateRangeReload(
        currentFilter,
      );
      if (incrementalApplied) {
        reloadPath = "db";
        setCurrentDataSource("db");
        setEmptyMessage(
          photosRef.current.length === 0 ? EMPTY_DEFAULT_MESSAGE : null,
        );
        return;
      }

      const dbResult = await tryLoadPhotosFromDbForDateTime(
        buildBaseDateTimeFilter(currentFilter),
        FILTER_RESET_TARGET_COUNT,
        0,
      );

      let sortedBase: Photo[] = [];
      let sorted: Photo[] = [];
      let nextCursor: string | null = null;
      let nextHasPage = false;

      if (dbResult.usedDb && dbResult.photos.length > 0) {
        reloadPath = "db";
        setCurrentDataSource("db");
        sortedBase = dbResult.photos.slice(0, FILTER_RESET_TARGET_COUNT);
        sorted = deriveVisiblePhotos(sortedBase, currentFilter);
        nextHasPage = dbResult.dbHasMore || !dbResult.isIndexComplete;
        dbDateTimePagingRef.current = {
          enabled: true,
          offset: dbResult.nextOffset,
        };
        setLocationSearchTargetTotalCount(
          dbResult.totalCount > 0 ? dbResult.totalCount : null,
        );
      } else {
        reloadPath = "medialibrary";
        setCurrentDataSource("medialibrary");
        const result = await collectPhotosForTarget({
          currentFilter,
          targetCount: FILTER_RESET_TARGET_COUNT,
          startCursor: null,
          mode: "filter-reset",
        });

        setLocationSearchTargetTotalCount(
          typeof result.totalCount === "number" && result.totalCount > 0
            ? result.totalCount
            : null,
        );
        sortedBase = sortPhotosForDisplay(dedupePhotosByUri(result.photos));
        sorted = deriveVisiblePhotos(sortedBase, currentFilter);
        nextCursor = result.endCursor;
        nextHasPage = result.hasNextPage;
        dbDateTimePagingRef.current = { enabled: false, offset: 0 };
      }
      console.log("[PhotoLoad] fetched", {
        requestId,
        source: reloadPath,
        count: sortedBase.length,
      });
      console.log("[PhotoLoad] sorted first", {
        requestId,
        creationTime: sortedBase[0]?.takenAt ?? null,
      });
      if (!isLatestPhotoLoad(requestId)) {
        skipStalePhotoLoad(requestId, "filter medialibrary apply");
        return;
      }

      await hydratePersistedDisplayUriCache(sortedBase, "filter-medialibrary");
      setPhotos(sorted);
      setPhotosAll(sortedBase);
      pruneDisplayUriCacheForPhotos(sortedBase);
      /* 2026.04.22 MediaLibrary 경로에서도 현재 필터의 표출/전체 건수를 동기화해 append 전 진행률 기준을 맞추기 위해 추가 by June */
      void refreshFilterProgress(currentFilter, sorted.length);
      setEndCursor(nextCursor);
      setHasNextPage(nextHasPage);
      markLoadedBaseRange(currentFilter, !nextHasPage);

      if (sorted.length === 0 && !nextHasPage) {
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
        t("reloadPhotosError", "There was a problem while reloading photos."),
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
  }, [
    filter,
    beginPhotoLoad,
    buildBaseDateTimeFilter,
    formatFilterForLog,
      deriveVisiblePhotos,
      hydratePersistedDisplayUriCache,
      isLatestPhotoLoad,
      markLoadedBaseRange,
      pruneDisplayUriCacheForPhotos,
      refreshFilterProgress,
      tryReuseLoadedBaseRangeFromMemory,
      skipStalePhotoLoad,
      t,
      collectPhotosForTarget,
      dedupePhotosByUri,
      sortPhotosForDisplay,
      tryApplyIncrementalDateRangeReload,
      tryLoadPhotosFromDbForDateTime,
    ]);

  /** append/background 공용 로드 처리 */
  const loadMorePhotos = useCallback(
    async ({ mode }: { mode: "background" | "append" }) => {
      /* 2026.04.22 append/background 추가 로딩 시간을 계측해 스크롤 체감 지연을 p50/p95로 확인하기 위해 타이머를 추가 by June */
      const loadMoreStartedAt = Date.now();
      const currentFilter = filterRef.current;
      let requestId = photoLoadRequestIdRef.current;
      /* 2026.04.22 loadMore 경로에서 예외가 Promise rejection으로 전파되며 앱이 중단되는 문제를 막기 위해 전체 흐름을 try/catch로 감싸 안전화 by June */
      let acquiredInFlight = false;
      try {
        if (requestInFlightRef.current) {
          console.log("[PhotoLoad] skipped stale", {
            requestId,
            current: photoLoadRequestIdRef.current,
            stage: `${mode} request already in flight`,
          });
          return;
        }
        if (filterLoading) return;
        if (!hasNextPage) return;

        requestId = beginPhotoLoad("medialibrary", currentFilter);

        const ok = await ensurePhotoPermission();
        if (!ok) {
          /* 2026.04.22 권한 미허용으로 추가 로딩이 중단된 케이스를 별도 계측해 운영 로그 해석 정확도를 높이기 위해 추가 by June */
          recordPerfMetric(
            "home.load_more.ms",
            Date.now() - loadMoreStartedAt,
            {
              context: { mode, permission: "denied" },
              logEvery: 1,
            },
          );
          return;
        }

        requestInFlightRef.current = true;
        acquiredInFlight = true;

        if (mode === "append") {
          setAppendLoading(true);
        } else {
          setBackgroundLoading(true);
        }

        let fetchedPhotos: Photo[] = [];
        let nextCursor: string | null = endCursor;
        let nextHasPage = false;
        let sourceLabel: "db" | "medialibrary" = "medialibrary";

        if (dbDateTimePagingRef.current.enabled) {
          const dbResult = await tryLoadPhotosFromDbForDateTime(
            buildBaseDateTimeFilter(currentFilter),
            APPEND_TARGET_COUNT,
            dbDateTimePagingRef.current.offset,
          );

          if (dbResult.usedDb) {
            sourceLabel = "db";
            fetchedPhotos = dbResult.photos;
            nextHasPage = dbResult.dbHasMore || !dbResult.isIndexComplete;
            dbDateTimePagingRef.current = {
              enabled: true,
              offset: dbResult.nextOffset,
            };
            setLocationSearchTargetTotalCount(
              dbResult.totalCount > 0 ? dbResult.totalCount : null,
            );
          } else if (dbResult.isIndexComplete) {
            setEndCursor(null);
            setHasNextPage(false);
            markLoadedBaseRange(currentFilter, true);
            return;
          }
        }

        if (fetchedPhotos.length === 0) {
          setCurrentDataSource("medialibrary");
          const result = await collectPhotosForTarget({
            currentFilter,
            targetCount: APPEND_TARGET_COUNT,
            startCursor: endCursor,
            mode,
          });

          setLocationSearchTargetTotalCount(
            typeof result.totalCount === "number" && result.totalCount > 0
              ? result.totalCount
              : null,
          );
          fetchedPhotos = result.photos;
          nextCursor = result.endCursor;
          nextHasPage = result.hasNextPage;
          dbDateTimePagingRef.current = { enabled: false, offset: 0 };
        } else {
          setCurrentDataSource("db");
        }

        const mergedBase = dedupePhotosByUri([
          ...photosAllRef.current,
          ...fetchedPhotos,
        ]);
        const sortedBase = sortPhotosForDisplay(mergedBase);
        const sorted = deriveVisiblePhotos(sortedBase, currentFilter);
        console.log("[PhotoLoad] fetched", {
          requestId,
          source: sourceLabel,
          count: fetchedPhotos.length,
          mergedCount: sortedBase.length,
        });
        console.log("[PhotoLoad] sorted first", {
          requestId,
          creationTime: sortedBase[0]?.takenAt ?? null,
        });
        if (!isLatestPhotoLoad(requestId)) {
          skipStalePhotoLoad(requestId, `${mode} medialibrary apply`);
          return;
        }

        await hydratePersistedDisplayUriCache(sortedBase, `${mode}-medialibrary`);
        setPhotos(sorted);
        setPhotosAll(sortedBase);
        pruneDisplayUriCacheForPhotos(sortedBase);
        /* 2026.04.22 MediaLibrary append에서도 누적 표출 건수를 프로그레스바에 반영해 사용자 체감 진행률을 맞추기 위해 추가 by June */
        void refreshFilterProgress(currentFilter, sorted.length);
        setEndCursor(nextCursor);
        setHasNextPage(nextHasPage);
        markLoadedBaseRange(currentFilter, !nextHasPage);
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
    [
      APPEND_TARGET_COUNT,
      beginPhotoLoad,
      buildBaseDateTimeFilter,
      endCursor,
      filter,
      deriveVisiblePhotos,
      filterLoading,
      hasNextPage,
      hydratePersistedDisplayUriCache,
      isLatestPhotoLoad,
      markLoadedBaseRange,
      pruneDisplayUriCacheForPhotos,
      refreshFilterProgress,
      skipStalePhotoLoad,
      sortPhotosForDisplay,
      tryLoadPhotosFromDbForDateTime,
    ],
  );
  /** 2026.03.26 By June END */

  const PAGE_SIZE = 50;
  const { dateStart, dateEnd, timeStart, timeEnd, countries, cities } = filter;

  const loadCountRef = useRef(0);
  /* 2026.06.03 All Dates에서 실제 갤러리 최저 촬영일을 반복 탐색하지 않도록 세션 캐시와 in-flight ref를 추가 by June */
  const oldestGalleryDateRef = useRef<Date | null>(null);
  const oldestGalleryDateResolvedRef = useRef(false);
  const oldestGalleryDatePromiseRef = useRef<Promise<Date | null> | null>(null);
  /* 2026.04.22 All Dates 프리셋 시작일을 실제 최저 촬영일로 바꾸기 위해 DateTimeFilter에서 호출할 최소 날짜 resolver를 추가 by June */
  const resolveOldestPhotoDate = useCallback(async () => {
    if (oldestGalleryDateResolvedRef.current) {
      return oldestGalleryDateRef.current;
    }

    if (oldestGalleryDatePromiseRef.current) {
      return oldestGalleryDatePromiseRef.current;
    }

    const work = (async () => {
      try {
        /* 2026.06.03 All Dates는 DB 캐시가 아니라 실제 네이티브 갤러리 기준 최저 날짜를 우선 반영하기 위해 creationTime ASC 1건 조회를 1순위로 추가 by June */
        const permission = await MediaLibrary.getPermissionsAsync();
        if (permission.status === "granted") {
          const result = await MediaLibrary.getAssetsAsync({
            first: 1,
            mediaType: MediaLibrary.MediaType.photo,
            sortBy: [[MediaLibrary.SortBy.creationTime, true]],
          });
          const oldestAsset = result.assets?.[0];
          const oldestCreationTime = oldestAsset?.creationTime;
          if (
            oldestCreationTime &&
            Number.isFinite(oldestCreationTime) &&
            oldestCreationTime > 0
          ) {
            const oldestDate = new Date(oldestCreationTime);
            oldestGalleryDateRef.current = oldestDate;
            oldestGalleryDateResolvedRef.current = true;
            return oldestDate;
          }
        }
      } catch (error) {
        /* 2026.06.03 네이티브 최저 날짜 직접 조회 실패가 All Dates 전체 실패로 이어지지 않도록 기존 fallback으로 이어가기 위해 오류만 로깅 by June */
        console.log("resolve oldest photo date from gallery error:", error);
      }

      try {
        /* 2026.04.22 실제 갤러리 직접 조회 실패 시에는 기존 DB 최소 촬영일 fallback을 유지해 기능 회복력을 확보 by June */
        const oldestTakenAt = await getOldestPhotoTakenAt();
        if (oldestTakenAt && Number.isFinite(oldestTakenAt)) {
          const oldestDate = new Date(oldestTakenAt);
          oldestGalleryDateRef.current = oldestDate;
          oldestGalleryDateResolvedRef.current = true;
          return oldestDate;
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

      const fallbackDate = minTakenAt ? new Date(minTakenAt) : null;
      oldestGalleryDateRef.current = fallbackDate;
      oldestGalleryDateResolvedRef.current = true;
      return fallbackDate;
    })();

    oldestGalleryDatePromiseRef.current = work.finally(() => {
      oldestGalleryDatePromiseRef.current = null;
    });

    return oldestGalleryDatePromiseRef.current;
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
          t("photoPermissionRequired", "Photo access permission is required."),
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
          after: reset ? undefined : (endCursor ?? undefined),
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
            tsMs,
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
              const uri = info?.localUri ?? info?.uri ?? a.uri;

              return {
                uri,
                assetId: a.id,
                takenAt: info?.creationTime ?? a.creationTime ?? null,
                location: info?.location
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
                assetId: a.id,
                takenAt: a.creationTime ?? null,
                location: (a as any).location
                  ? {
                      latitude: Number((a as any).location.latitude),
                      longitude: Number((a as any).location.longitude),
                    }
                  : null,
              };
            }
          }),
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
          // 2026-05-12: '모든 위치' 선택 시 사진이 모두 사라지는 버그 수정 - "All" 센티널은 해당 축에 위치값이 있는 사진을 의미하도록 처리 by yen
          if (cities.length > 0) {
            const city = photo.city ?? "";
            return cities.includes("All") ? city !== "" : cities.includes(city);
          }
          const country = photo.country ?? "";
          return countries.includes("All")
            ? country !== ""
            : countries.includes(country);
        });
        // 7) 상태 업데이트
        setPhotos((prev) => {
          const merged = reset
            ? filteredWithLocation
            : [...prev, ...filteredWithLocation];

          return sortPhotosByTakenAtDesc(merged);
        });
        setEndCursor(result.endCursor ?? null);
        setHasNextPage(result.hasNextPage);
      } catch (err) {
        console.log("MediaLibrary 오류:", err);
        /* 2026.04.22 사진 로드 실패 알럿을 다국어로 통일해 오류 메시지 현지화 누락을 방지하기 위해 수정 by June */
        Alert.alert(
          t("errorTitle", "Error"),
          t("loadPhotosError", "There was a problem while loading photos."),
        );
      } finally {
        setLoading(false);
      }
    },
    [loading, hasNextPage, endCursor, filter, t],
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
        t("photoPermissionRequired", "Photo access permission is required."),
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
              const uri = info?.localUri ?? info?.uri ?? a.uri;

              return {
                uri,
                assetId: a.id,
                takenAt: info?.creationTime ?? a.creationTime ?? null,
                location: info?.location
                  ? {
                      latitude: Number(info.location.latitude),
                      longitude: Number(info.location.longitude),
                    }
                  : null,
              };
            } catch {
              return {
                uri: a.uri,
                assetId: a.id,
                takenAt: a.creationTime ?? null,
                location: null,
              };
            }
          }),
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
          // 2026-05-12: '모든 위치' 선택 시 사진이 모두 사라지는 버그 수정 - "All" 센티널은 해당 축에 위치값이 있는 사진을 의미하도록 처리 by yen
          if (cities.length > 0) {
            const city = photo.city ?? "";
            return cities.includes("All") ? city !== "" : cities.includes(city);
          }
          const country = photo.country ?? "";
          return countries.includes("All")
            ? country !== ""
            : countries.includes(country);
        });

        collected = [...collected, ...filteredWithLocation];

        cursor = result.endCursor ?? undefined;
        nextPage = result.hasNextPage;
      }

      const deduped = Array.from(
        new Map(collected.map((photo) => [photo.uri, photo])).values(),
      );

      deduped.sort((a, b) => {
        const aHas =
          typeof a.takenAt === "number" && Number.isFinite(a.takenAt);
        const bHas =
          typeof b.takenAt === "number" && Number.isFinite(b.takenAt);

        if (aHas && bHas) return (b.takenAt as number) - (a.takenAt as number);
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
        t("reloadPhotosError", "There was a problem while reloading photos."),
      );
    } finally {
      setLoading(false);
    }
  }, [loading, dateStart, dateEnd, timeStart, timeEnd, countries, cities, t]);

  /** 2026.03.03 사진 삭제 등으로 데이터 갱신 발생 시 새로고침 관련 추가 By June START */
  const [refreshing, setRefreshing] = useState(false);

  /** 2026.03.26 수정 By June */
  const reloadPhotos = useCallback(async () => {
    await reloadPhotosForFilter();
  }, [reloadPhotosForFilter]);

  /** 초기 진입 이펙트 추가 2026.03.26 By June */
  useEffect(() => {
    if (didInitialLoad) return;
    void loadInitialPhotos();
  }, [didInitialLoad, loadInitialPhotos]);

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
  const lastHandledDateTimeSigRef = useRef<string>("");
  const lastHandledLocationSigRef = useRef<string>("");

  const dateTimeFilterSignature = useMemo(() => {
    return [
      filter.dateStart.getTime(),
      filter.dateEnd.getTime(),
      filter.timeStart,
      filter.timeEnd,
    ].join("|");
  }, [
    filter.dateStart,
    filter.dateEnd,
    filter.timeStart,
    filter.timeEnd,
  ]);

  const locationFilterSignature = useMemo(() => {
    const countriesSig = [...filter.countries].sort().join(",");
    const citiesSig = [...filter.cities].sort().join(",");
    return [countriesSig, citiesSig].join("|");
  }, [filter.countries, filter.cities]);

  /* 2026.04.15 reloadPhotosForFilter의 최신 구현을 ref에 동기화해 effect 의존성 루프 없이 최신 로직을 호출하기 위해 추가 by June */
  useEffect(() => {
    reloadPhotosForFilterRef.current = reloadPhotosForFilter;
  }, [reloadPhotosForFilter]);

  useEffect(() => {
    if (!pendingReloadVisible) return;
    if (requestInFlightRef.current) return;

    pendingReloadRef.current = false;
    setPendingReloadVisible(false);
    void reloadPhotosForFilterRef.current();
  }, [pendingReloadVisible]);

  useEffect(() => {
    lastAutoAppendContentLengthRef.current = -1;
  }, [dateTimeFilterSignature, locationFilterSignature]);

  useEffect(() => {
    if (!didMountFilterEffectRef.current) {
      didMountFilterEffectRef.current = true;
      lastHandledDateTimeSigRef.current = dateTimeFilterSignature;
      lastHandledLocationSigRef.current = locationFilterSignature;
      return;
    }

    const dateTimeChanged =
      lastHandledDateTimeSigRef.current !== dateTimeFilterSignature;
    const locationChanged =
      lastHandledLocationSigRef.current !== locationFilterSignature;

    if (!dateTimeChanged && !locationChanged) return;

    lastHandledDateTimeSigRef.current = dateTimeFilterSignature;
    lastHandledLocationSigRef.current = locationFilterSignature;

    /* 2026.04.15 날짜 사용 여부를 truthy 체크 대신 초기값 비교로 판정해 항상 true가 되는 버그를 수정하기 위해 변경 by June */
    const usedDate =
      filter.dateStart.getTime() !==
        initialFilterRef.current.dateStart.getTime() ||
      filter.dateEnd.getTime() !== initialFilterRef.current.dateEnd.getTime();
    const usedTime = filter.timeStart !== 0 || filter.timeEnd !== 1439;
    const usedLocation =
      filter.countries.length > 0 || filter.cities.length > 0;

    if (usedDate) incrementDateFilter();
    if (usedTime) incrementTimeFilter();
    if (usedLocation) incrementLocationFilter();

  }, [
    dateTimeFilterSignature,
    filter.dateEnd,
    filter.dateStart,
    filter.timeEnd,
    filter.timeStart,
    locationFilterSignature,
    filter.cities,
    filter.countries,
    incrementDateFilter,
    incrementTimeFilter,
    incrementLocationFilter,
  ]);
  /** 2026.03.26 By June */

  // 썸네일 그리드에 사진 데이터 렌더링
  const renderItem: ListRenderItem<Photo> = ({ item, index }) => {
    const isThumbnailReady = Boolean(thumbnailReadyByUri[item.uri]);
    const resolvedDisplayUri = displayUriMap[item.uri];
    const hasUsableDisplayUri =
      !item.uri.startsWith("ph://") ||
      (typeof resolvedDisplayUri === "string" &&
        resolvedDisplayUri.startsWith("file://"));
    const shouldShowPhPlaceholder =
      Platform.OS === "ios" &&
      item.uri.startsWith("ph://") &&
      !hasUsableDisplayUri;
    const shouldShowThumbnailPlaceholder =
      shouldShowPhPlaceholder || !isThumbnailReady;

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

          setViewerEntryPoint("home");
          setViewerPhotoUris(photosRef.current.map((photo) => photo.uri));
          setViewerIndex(index);
          setViewerVisible(true);
          /* 2026.05.27 선택한 사진의 위치 메타 유무를 즉시 확인하기 위한 진단 로그 추가 by June */
          void debugPhotoLocationMeta(item);
          /* 2026.04.22 상세 보기 진입 시 선택 사진만 고해상도 URI를 비동기 보강해 리스트 전체 메모리 사용 없이 상세 품질을 확보하기 위해 추가 by June */
          void resolveViewerDetailUri(item.uri);
          /* 2026.05.06 사용자가 선택한 사진의 위치정보는 즉시 우선 보강해 상세 진입 직후 공백 시간을 줄이기 위해 추가 by June */
          void prioritizePhotoLocation(item);
          /* 2026.04.22 좌우 스와이프 첫 체감을 개선하기 위해 인접 1장의 URI도 선행 보강하되 범위를 최소화해 메모리 피크를 제한 by June */
          const next = photosRef.current[index + 1];
          if (next?.uri) {
            void resolveViewerDetailUri(next.uri);
          }
        }}
      >
        <View style={styles.imageFrame}>
          {!shouldShowPhPlaceholder ? (
            /* 2026.06.03 일반 URI도 실제 onLoad 전까지는 placeholder를 남겨 흰 박스처럼 보이지 않도록 조정 by June */
            <Image
              source={{
                uri: hasUsableDisplayUri
                  ? (resolvedDisplayUri ?? item.uri)
                  : item.uri,
              }}
              style={[styles.image, styles.imageLayer, !isThumbnailReady && styles.imageHidden]}
              resizeMode="cover"
              onLoad={() => markThumbnailReady(item.uri)}
              onError={() => markThumbnailReady(item.uri)}
            />
          ) : null}
          {shouldShowThumbnailPlaceholder ? (
            /* 2026.04.28 빈 URI 전달 경고를 없애기 위해 미해결 ph:// 썸네일은 임시 플레이스홀더로 렌더링 by June */
            <View style={[styles.image, styles.imagePlaceholder, styles.imagePlaceholderLayer]}>
              <LinearGradient
                colors={["#F4F7FB", "#EAEFF6", "#F7FAFC"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFillObject}
              />
              <View style={styles.imagePlaceholderTint} />
              <View style={styles.imagePlaceholderBars}>
                <View style={[styles.imagePlaceholderBar, styles.imagePlaceholderBarWide]} />
                <View style={[styles.imagePlaceholderBar, styles.imagePlaceholderBarMedium]} />
              </View>
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.imagePlaceholderSheen,
                  {
                    transform: [
                      { translateX: thumbnailSkeletonTranslateX },
                      { skewX: "-12deg" },
                    ],
                  },
                ]}
              />
            </View>
          ) : null}
        </View>
      </TouchableOpacity>
    );
  };

  // 시각(분) 윈도우 판정: timeStart~timeEnd(분), 1439=23:59 처리 포함
  const inTimeWindow = (
    tsMs: string | number | Date,
    timeStart: number,
    timeEnd: number,
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

  const currentViewerUri = viewerPhotoUris[viewerIndex] ?? "";
  const currentViewerPhoto =
    photosAll.find((photo) => photo.uri === currentViewerUri) ??
    photos.find((photo) => photo.uri === currentViewerUri);
  const viewerLocationText =
    currentViewerPhoto?.city && currentViewerPhoto?.country
      ? `${currentViewerPhoto.city}, ${currentViewerPhoto.country}`
      : currentViewerPhoto?.country
        ? currentViewerPhoto.country
        : !currentViewerPhoto?.location
          ? "No location info"
          : t("loadingLocationInfo", "Loading location info...");

  const handleViewerShare = useCallback(async () => {
    if (!currentViewerPhoto?.uri) return;
    try {
      const messagePrefix = t(
        "sharePhotoMessagePrefix",
        "Check out this photo!",
      );
      const message = viewerLocationText
        ? `${messagePrefix} ${viewerLocationText}`
        : messagePrefix;
      await Share.open({
        message,
        url:
          Platform.OS === "android"
            ? `file://${currentViewerPhoto.uri}`
            : currentViewerPhoto.uri,
        type: "image/jpeg",
      });
    } catch (err: unknown) {
      const errMessage = err instanceof Error ? err.message : "";
      if (errMessage !== "User did not share") {
        Alert.alert(
          t("errorTitle", "Error"),
          t("shareFailedMessage", "Failed to share the photo."),
        );
      }
    }
  }, [currentViewerPhoto?.uri, t, viewerLocationText]);

  const handleViewerDelete = useCallback(() => {
    Alert.alert(
      t("deletePhotoTitle", "Delete Photo"),
      t("deletePhotoConfirm", "Are you sure you want to delete this photo?"),
      [
        { text: t("cancel", "Cancel"), style: "cancel" },
        {
          text: t("delete", "Delete"),
          style: "destructive",
          onPress: () => {
            setPhotos((prev) =>
              prev.filter((_, idx) => idx !== viewerIndexRef.current),
            );
            closeViewer();
          },
        },
      ],
    );
  }, [closeViewer, t]);

  const normalizeDateOnly = useCallback((value: Date) => {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }, []);

  const normalizeSelectionList = useCallback((values?: string[]) => {
    return [...new Set(values ?? [])].sort();
  }, []);

  const areSelectionListsEqual = useCallback(
    (a?: string[], b?: string[]) => {
      const left = normalizeSelectionList(a);
      const right = normalizeSelectionList(b);
      if (left.length !== right.length) return false;
      return left.every((value, index) => value === right[index]);
    },
    [normalizeSelectionList],
  );

  const normalizeEffectiveLocationSelection = useCallback(
    (countriesInput?: string[], citiesInput?: string[]) => {
      /* 2026.05.28 위치 필터는 raw 선택값이 달라도 실제 결과가 같을 수 있어 현재 후보 기준의 의미값으로 정규화 by June */
      const availableCountries = new Set<string>();
      const availableCities = new Set<string>();

      for (const photo of photosAllRef.current) {
        const country = String(photo.country ?? "").trim();
        const city = String(photo.city ?? "").trim();
        if (country) availableCountries.add(country);
        if (city) availableCities.add(city);
      }

      const normalizeAxis = (values: string[] | undefined, allValues: Set<string>) => {
        const source = values ?? [];
        const selected = normalizeSelectionList(source).filter(
          (value) => value && value !== "All",
        );
        const available = normalizeSelectionList([...allValues]);
        const selectsAll = source.includes("All") || selected.length === 0;
        const coversEveryAvailable =
          available.length > 0 &&
          available.every((value) => selected.includes(value));

        if (selectsAll || coversEveryAvailable) return [];
        return selected;
      };

      return {
        countries: normalizeAxis(countriesInput, availableCountries),
        cities: normalizeAxis(citiesInput, availableCities),
      };
    },
    [normalizeSelectionList],
  );

  const handleLocationChange = useCallback(
    (selections: LocationFilterState) => {
      const prev = filterRef.current;
      const nextCountries = selections.countries ?? prev.countries;
      const nextCities = selections.cities ?? prev.cities;
      const nextLocationLabel = selections.locationLabel ?? prev.locationLabel;
      const prevEffective = normalizeEffectiveLocationSelection(
        prev.countries,
        prev.cities,
      );
      const nextEffective = normalizeEffectiveLocationSelection(
        nextCountries,
        nextCities,
      );
      const valueUnchanged =
        areSelectionListsEqual(prevEffective.countries, nextEffective.countries) &&
        areSelectionListsEqual(prevEffective.cities, nextEffective.cities);
      const labelUnchanged = prev.locationLabel === nextLocationLabel;

      if (valueUnchanged && labelUnchanged) {
        console.log("[Filter] unchanged", {
          type: "location",
          reason: "effective-selection-same",
        });
        return;
      }

      const nextFilter = {
        ...prev,
        countries: nextEffective.countries,
        cities: nextEffective.cities,
        locationLabel: nextLocationLabel,
      };

      setFilter(nextFilter);

      if (valueUnchanged) {
        return;
      }

      const nextVisible = deriveVisiblePhotos(photosAllRef.current, nextFilter);
      setPhotos(nextVisible);
      void refreshFilterProgress(nextFilter, nextVisible.length);
      setEmptyMessage(
        nextVisible.length === 0 ? EMPTY_DEFAULT_MESSAGE : null,
      );
    },
    [
      EMPTY_DEFAULT_MESSAGE,
      areSelectionListsEqual,
      deriveVisiblePhotos,
      normalizeEffectiveLocationSelection,
      refreshFilterProgress,
    ],
  );

  const handleDateTimeChange = useCallback(
    (selections: Partial<DateTimeFilterState>) => {
      console.log("[Filter] date-time received", {
        dateStart: selections.dateStart?.toISOString?.() ?? null,
        dateEnd: selections.dateEnd?.toISOString?.() ?? null,
        timeStart: selections.timeStart ?? null,
        timeEnd: selections.timeEnd ?? null,
      });

      const prev = filterRef.current;
      const nextDateStart = selections.dateStart
        ? normalizeDateOnly(selections.dateStart)
        : prev.dateStart;
      const nextDateEnd = selections.dateEnd
        ? normalizeDateOnly(selections.dateEnd)
        : prev.dateEnd;
      const nextTimeStart = selections.timeStart ?? prev.timeStart;
      const nextTimeEnd = selections.timeEnd ?? prev.timeEnd;

      const valueUnchanged =
        dayStartMs(prev.dateStart) === dayStartMs(nextDateStart) &&
        dayStartMs(prev.dateEnd) === dayStartMs(nextDateEnd) &&
        prev.timeStart === nextTimeStart &&
        prev.timeEnd === nextTimeEnd;

      if (valueUnchanged) {
        console.log("[Filter] unchanged", { type: "date-time" });
        return;
      }

      const nextFilter = {
        ...prev,
        dateStart: nextDateStart,
        dateEnd: nextDateEnd,
        timeStart: nextTimeStart,
        timeEnd: nextTimeEnd,
      };

      console.log("[Filter] date-time normalized", {
        from: {
          dateStart: prev.dateStart.toISOString(),
          dateEnd: prev.dateEnd.toISOString(),
          timeStart: prev.timeStart,
          timeEnd: prev.timeEnd,
        },
        to: {
          dateStart: nextDateStart.toISOString(),
          dateEnd: nextDateEnd.toISOString(),
          timeStart: nextTimeStart,
          timeEnd: nextTimeEnd,
        },
      });

      setFilter(nextFilter);
      void prefetchLocationSearchTargetTotalCount(nextFilter);
      armLocationSearchWorkflowForFilter(nextFilter);
    },
    [
      armLocationSearchWorkflowForFilter,
      dayStartMs,
      normalizeDateOnly,
      prefetchLocationSearchTargetTotalCount,
    ],
  );

  const handleAutoLoadMoreOnScroll = useCallback(() => {
    if (refreshing || filterLoading || appendLoading || initialLoading) return;
    if (locationSearchWorkflowStatus === "preparing") return;
    if (
      locationSearchWorkflowStatus === "ad-required" ||
      locationSearchWorkflowStatus === "search-prompt"
    ) {
      return;
    }
    if (!hasNextPage) return;

    const contentLength = photosAllRef.current.length;
    if (contentLength <= 0) return;
    if (lastAutoAppendContentLengthRef.current === contentLength) return;

    lastAutoAppendContentLengthRef.current = contentLength;
    void loadMorePhotos({ mode: "append" });
  }, [
    appendLoading,
    filterLoading,
    hasNextPage,
    initialLoading,
    loadMorePhotos,
    locationSearchWorkflowStatus,
    refreshing,
  ]);

  const handleScrollDownHintPress = useCallback(() => {
    /* 2026.06.09 스크롤이 거의 생기지 않는 짧은 리스트에서도 사용자가 명시적으로 다음 구간 탐색을 진행할 수 있도록 하단 화살표 버튼을 추가 by June */
    photoGridListRef.current?.scrollToOffset({
      offset: photoGridScrollOffsetRef.current + screenHeight * 0.72,
      animated: true,
    });
    void handleAutoLoadMoreOnScroll();
  }, [handleAutoLoadMoreOnScroll, screenHeight]);

  const handleShowOnMap = () => {
    <View style={styles.mapContainer}>
      <ShowOnMap images={photos} />
    </View>;
    console.log("Show on map, photos: ", photos.length);
  };
  /* 2026.05.12 지도 마커 탭 시 동일 공통 상세 뷰어를 열되 지도 컨텍스트를 유지하기 위해 index 매칭 기반 오픈 핸들러를 추가 by June */
  const handleOpenPhotoFromMap = useCallback(
    async (payload: { sourceUri: string; city?: string; country?: string }) => {
      const sourceUri = String(payload.sourceUri ?? "");
      if (!sourceUri) return;

      const foundIndex = photosRef.current.findIndex(
        (p) => p.uri === sourceUri,
      );
      if (foundIndex < 0) return;

      swipe_count_ref.current = 0;
      swipe_threshold_fired_ref.current = false;
      setViewerEntryPoint("map");
      setViewerPhotoUris(photosRef.current.map((photo) => photo.uri));
      setViewerIndex(foundIndex);
      setViewerVisible(true);

      await resolveViewerDetailUri(sourceUri);
      await prioritizePhotoLocation(photosRef.current[foundIndex]);
    },
    [prioritizePhotoLocation, resolveViewerDetailUri],
  );

  const edges = ["bottom", "left", "right"];
  if (Platform.OS === "ios") {
    edges.push("top"); // iOS는 top 추가해야 UI 안깨짐
  }
  const safeAreaEdges: Edges = edges as Edges;
  const hasPendingDisplayThumbnails =
    Platform.OS === "ios" &&
    photos
      .slice(0, thumbnailResolveLimit)
      .some((p) => p.uri.startsWith("ph://") && !displayUriMap[p.uri]);
  const hasPendingVisibleThumbnailPaint =
    thumbnailBlockingUris.length > 0 &&
    thumbnailBlockingUris.some((uri) => !thumbnailReadyByUri[uri]);
  /* 2026.05.28 메인 썸네일/필터 변경 중에는 중복 입력을 막고 현재 처리 상태를 명확히 보여주기 위한 안내 문구를 분리 by June */
  const mainLoadingMessage = !didInitialLoad || initialLoading
    ? t("loadingPhotos", "Loading thumbnails...")
    : filterLoading
      ? "Updating thumbnails..."
    : thumbnailResolving ||
            hasPendingDisplayThumbnails ||
            hasPendingVisibleThumbnailPaint
          ? t("loadingPhotos", "Loading thumbnails...")
          : isScanning
            ? "Scanning photos..."
            : "";
  const isMainInteractionBlocked =
    !didInitialLoad || initialLoading || filterLoading;
  const mainInteractionBlockReason = !didInitialLoad
    ? "didInitialLoad=false"
    : initialLoading
      ? "initialLoading=true"
      : filterLoading
        ? "filterLoading=true"
        : "";
  /* 2026.05.28 위치 인덱싱/필터 갱신 중 위치 바텀시트에 아직 목록이 완성되지 않았음을 안내하기 위한 준비 상태 by June */
  const isLocationListPreparing =
    !didInitialLoad ||
    initialLoading ||
    filterLoading ||
    isScanning ||
    visibleLocationPreparing;
  const locationPreparingMessage = "Preparing location list. Please wait...";
  const shouldShowLocationSearchModal =
    locationSearchWorkflowStatus === "ad-required" ||
    locationSearchWorkflowStatus === "search-prompt" ||
    locationSearchWorkflowStatus === "preparing";
  const effectiveLocationSearchEstimatedSeconds =
    locationSearchEstimatedSeconds > 0
      ? locationSearchEstimatedSeconds
      : currentEstimatedLocationSearchSeconds;
  const locationSearchEstimatedMinutesLabel = useMemo(() => {
    if (effectiveLocationSearchEstimatedSeconds < 60) {
      return `${effectiveLocationSearchEstimatedSeconds}초`;
    }
    const minutes = Math.floor(effectiveLocationSearchEstimatedSeconds / 60);
    const seconds = effectiveLocationSearchEstimatedSeconds % 60;
    return `${minutes}분 ${seconds}초`;
  }, [effectiveLocationSearchEstimatedSeconds]);
  const locationSearchRemainingLabel = useMemo(() => {
    const remainingSeconds = Math.max(
      0,
      effectiveLocationSearchEstimatedSeconds -
        Math.round(
          (effectiveLocationSearchEstimatedSeconds * locationSearchProgressPercent) / 100,
        ),
    );
    if (remainingSeconds < 60) {
      return `예상 남은 시간: ${remainingSeconds}초`;
    }
    const min = Math.floor(remainingSeconds / 60);
    const sec = remainingSeconds % 60;
    return `예상 남은 시간: ${min}분 ${sec}초`;
  }, [effectiveLocationSearchEstimatedSeconds, locationSearchProgressPercent]);

  useEffect(() => {
    if (!isMainInteractionBlocked) return;

    console.log("[FilterBlock] active", {
      reason: mainInteractionBlockReason,
      emptyMessage,
      photosLength: photos.length,
      initialLoading,
      filterLoading,
      appendLoading,
      backgroundLoading,
      thumbnailResolving,
      hasPendingDisplayThumbnails,
      hasPendingVisibleThumbnailPaint,
      didInitialLoad,
    });
  }, [
    appendLoading,
    backgroundLoading,
    didInitialLoad,
    emptyMessage,
    filterLoading,
    hasPendingDisplayThumbnails,
    hasPendingVisibleThumbnailPaint,
    initialLoading,
    isMainInteractionBlocked,
    mainInteractionBlockReason,
    photos.length,
    thumbnailResolving,
  ]);

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
                  onPress={() =>
                    slideshowOn ? handleCloseSlideshow() : handleSlideshow()
                  }
                  activeOpacity={0.9}
                >
                  <LinearGradient
                    colors={["#2B7FFF", "#AD46FF"]}
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
                  <ShowOnMap
                    images={photosAll}
                    onOpenRequest={() => requestLocationFeatureOpen("map")}
                    openToken={mapOpenToken}
                    preparingLocations={visibleLocationPreparing}
                    preparingMessage="Preparing map markers. Please wait..."
                    onOpenPhotoFromMap={handleOpenPhotoFromMap}
                  />
                </TouchableOpacity>

                {/* Settings 버튼 */}
                <TouchableOpacity
                  onPress={() => router.push("/settings")}
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
                ref={(ref) => {
                  photoGridListRef.current = ref;
                }}
                style={{ flex: 1 }} // 리스트가 남은 세로 공간을 다 차지
                data={photos}
                numColumns={numColumns}
                /* 2026.04.22 index key 사용 시 append/재정렬 구간에서 셀 재생성이 과도해져 스크롤 안정성이 저하될 수 있어 URI 우선 key로 변경 by June */
                keyExtractor={(item, i) => `${item.uri || "missing-uri"}::${i}`}
                renderItem={renderItem}
                /* 2026.04.22 대량 사진 스크롤 시 메모리 사용량을 낮춰 OS 강제 종료 가능성을 줄이기 위해 FlatList 배치 렌더 파라미터를 최적화 by June */
                initialNumToRender={25}
                maxToRenderPerBatch={20}
                windowSize={7}
                removeClippedSubviews
                onViewableItemsChanged={
                  thumbnailViewableItemsChangedRef.current
                }
                viewabilityConfig={thumbnailViewabilityConfigRef.current}
                refreshing={refreshing} // 2026.03.03 June 추가
                onRefresh={onRefresh} // 2026.03.03 June 추가
                contentContainerStyle={{
                  paddingHorizontal: horizontalPadding,
                  padding: 8,
                  flexGrow: 1, // 아이템 0개여도 높이 채우기
                  backgroundColor: "#FFF",
                  borderRadius: 10,
                }}
                ListEmptyComponent={
                  !initialLoading &&
                  !filterLoading &&
                  !appendLoading &&
                  !isScanning &&
                  !error ? (
                    <View style={styles.emptyWrap}>
                      <Text style={styles.emptyTitle}>
                        {emptyMessage ?? EMPTY_DEFAULT_MESSAGE}
                      </Text>
                      {emptyMessage !== EMPTY_RECENT_3Y_MESSAGE ? (
                        <Text style={styles.emptyDesc}>
                          {EMPTY_DEFAULT_DESC}
                        </Text>
                      ) : null}
                    </View>
                  ) : null
                }
                onEndReachedThreshold={0.4}
                onEndReached={() => {
                  /* 2026.06.09 로드모어 버튼을 제거하고 사용자가 실제로 하단까지 스크롤한 시점에만 다음 30장을 이어서 로드하도록 변경 by June */
                  handleAutoLoadMoreOnScroll();
                }}
                ListFooterComponent={
                  !initialLoading && !filterLoading ? (
                    <View style={{ paddingVertical: 12, alignItems: "center" }}>
                      {appendLoading || backgroundLoading ? (
                        <View style={{ alignItems: "center", gap: 8 }}>
                          <ActivityIndicator />
                          <Text style={styles.loadingSubText}>
                            {t("loadingMorePhotos", "Loading more photos...")}
                          </Text>
                        </View>
                      ) : (
                        <Text style={styles.loadingSubText}>
                          {t(
                            "allFilteredPhotosLoaded",
                            "All filtered photos are loaded",
                          )}
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
                  photoGridScrollOffsetRef.current = Math.max(0, y);
                  /* 2026.04.22 상단 당김(y<=-60) 구간은 onRefresh와 역할이 겹치고 append 경쟁으로 앱 크래시를 유발해 해당 경로를 비활성화 by June */
                  if (y <= -60) {
                    return;
                  }
                }}
                scrollEventThrottle={16}
              />
              {!initialLoading && !filterLoading && hasNextPage ? (
                <TouchableOpacity
                  style={styles.scrollDownHintButton}
                  activeOpacity={0.9}
                  onPress={handleScrollDownHintPress}
                >
                  <Ionicons name="chevron-down" size={24} color="#ffffff" />
                </TouchableOpacity>
              ) : null}
              {/* 썸네일 그리드 END */}
              {/** Progress bar START */}
              {!didInitialLoad ||
              initialLoading ||
              filterLoading ||
              thumbnailResolving ||
              hasPendingDisplayThumbnails ||
              isScanning ? ( // 2026.03.27 By June
                <View style={styles.gridOverlay} pointerEvents="auto">
                  <View style={styles.loadingBox}>
                    <ActivityIndicator size="large" />
                    <Text style={styles.loadingText}>
                      {/* 2026.05.28 최초 로딩/필터 변경/추가 로딩을 구분해 사용자가 현재 상태를 알 수 있도록 문구 세분화 by June */}
                      {mainLoadingMessage || t("loadingPhotos", "Loading photos...")}
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
                      <Button
                        title="Close"
                        onPress={() => setSelectedImage(null)}
                      />
                    </View>
                  </Modal>
                </>
              )}
              {/** Progress bar END */}
            </View>
          </View>
          <View style={styles.bottomArea}>
            <DateTimeFilter
              /* 2026.06.09 상위 필터 상태가 강제 보정돼도 바텀 필터 UI가 즉시 같은 값을 표시하도록 controlled value를 연결 by June */
              value={{
                dateStart: filter.dateStart,
                dateEnd: filter.dateEnd,
                timeStart: filter.timeStart,
                timeEnd: filter.timeEnd,
              }}
              onChange={handleDateTimeChange}
              photos={photosAll}
              /* 2026.04.22 DateTimeFilter의 All Dates 프리셋이 DB 최소 날짜를 사용하도록 resolver prop을 연결하기 위해 추가 by June */
              resolveOldestPhotoDate={resolveOldestPhotoDate}
              onLocationChange={handleLocationChange}
              locationPreparing={isLocationListPreparing}
              locationPreparingMessage={locationPreparingMessage}
              onOpenLocationRequest={() =>
                requestLocationFeatureOpen("location-filter")
              }
              locationOpenToken={locationFilterOpenToken}
              interactionBlocked={isMainInteractionBlocked}
              interactionBlockedReason={mainInteractionBlockReason}
            />
          </View>
        </View>

        <Modal
          visible={shouldShowLocationSearchModal}
          transparent
          animationType="fade"
          onRequestClose={() => {
            // blocked on purpose while workflow is active
          }}
        >
          <View style={styles.locationSearchModalBackdrop} pointerEvents="auto">
            <View style={styles.locationSearchModalCard}>
              {locationSearchWorkflowStatus === "ad-required" ? (
                <>
                  <Text style={styles.locationSearchModalTitle}>
                    31일 초과 기간에서도 장소 검색과 지도 기능을 사용할 수 있습니다
                  </Text>
                  <Text style={styles.locationSearchModalBody}>
                    광고를 시청하면 2시간 동안 확장 기간 검색을 사용할 수 있습니다.
                  </Text>
                  <View style={styles.locationSearchModalActions}>
                    <TouchableOpacity
                      style={styles.locationSearchSecondaryButton}
                      activeOpacity={0.85}
                      onPress={handleExtendedFeatureDecline}
                    >
                      <Text style={styles.locationSearchSecondaryButtonText}>
                        31일로 줄이기
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.locationSearchPrimaryButton}
                      activeOpacity={0.9}
                      onPress={() => void handleExtendedFeatureApprove()}
                    >
                      <Text style={styles.locationSearchPrimaryButtonText}>
                        광고 보기
                      </Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : null}

              {locationSearchWorkflowStatus === "search-prompt" ? (
                <>
                  <Text style={styles.locationSearchModalTitle}>
                    {`${locationSearchTargetCountLabel}장의 사진을 검색해야 합니다.`}
                  </Text>
                  <Text style={styles.locationSearchModalBody}>
                    {`예상 시간은 약 ${locationSearchEstimatedMinutesLabel}입니다.`}
                  </Text>
                  {effectiveLocationSearchEstimatedSeconds > 30 ? (
                    <Text style={styles.locationSearchModalHint}>
                      연,월,시간,장소 조건을 좁혀보세요. 검색 범위가 줄어들어 소요시간을 줄일 수 있습니다.
                    </Text>
                  ) : null}
                  <View style={styles.locationSearchModalActions}>
                    <TouchableOpacity
                      style={styles.locationSearchSecondaryButton}
                      activeOpacity={0.85}
                      onPress={handleLocationSearchDecline}
                    >
                      <Text style={styles.locationSearchSecondaryButtonText}>
                        나중에
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.locationSearchPrimaryButton}
                      activeOpacity={0.9}
                      onPress={() => void handleLocationSearchConfirm()}
                    >
                      <Text style={styles.locationSearchPrimaryButtonText}>
                        시작
                      </Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : null}

              {locationSearchWorkflowStatus === "preparing" ? (
                <>
                  <Text style={styles.locationSearchModalTitle}>
                    선택한 범위의 사진을 정리하고 있습니다.
                  </Text>
                  <Text style={styles.locationSearchProgressBody}>
                    {`${locationSearchProgressChecked.toLocaleString()} / ${Math.max(locationSearchProgressTotal, currentSearchTargetCount).toLocaleString()}장 확인 중`}
                  </Text>
                  <View style={styles.locationSearchProgressTrack}>
                    <View
                      style={[
                        styles.locationSearchProgressFill,
                        {
                          width: `${Math.max(4, Math.min(100, locationSearchProgressPercent))}%`,
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.locationSearchProgressPercentText}>
                    {`진행률 ${locationSearchProgressPercent}%`}
                  </Text>
                  <Text style={styles.locationSearchProgressSubText}>
                    {locationSearchRemainingLabel}
                  </Text>
                  <Text style={styles.locationSearchProgressSubText}>
                    {locationSearchPhaseText}
                  </Text>
                  <TouchableOpacity
                    style={styles.locationSearchSecondaryButton}
                    activeOpacity={0.85}
                    onPress={handleLocationSearchCancel}
                  >
                    <Text style={styles.locationSearchSecondaryButtonText}>
                      선택취소
                    </Text>
                  </TouchableOpacity>
                </>
              ) : null}
            </View>
          </View>
        </Modal>

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
        <PhotoDetailViewer
          visible={viewerVisible || slideshowVisible}
          images={viewerImages}
          imageIndex={viewerIndex}
          onRequestClose={closeViewer}
          onImageIndexChange={(i: number) => {
            setViewerIndex(i);
            viewerIndexRef.current = i;
            swipe_count_ref.current += 1;
            if (
              !swipe_threshold_fired_ref.current &&
              swipe_count_ref.current >= SWIPE_THRESHOLD
            ) {
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
            const nextViewerUri = viewerPhotoUris[i] ?? "";
            if (nextViewerUri) {
              const nextViewerPhoto =
                photosAllRef.current.find((photo) => photo.uri === nextViewerUri) ??
                photosRef.current.find((photo) => photo.uri === nextViewerUri);
              void prioritizePhotoLocation(nextViewerPhoto);
              void resolveViewerDetailUri(nextViewerUri);
            }
          }}
          showPlayButton={viewerEntryPoint === "home" && !slideshowOn}
          onPressPlay={handleViewerPlayPress}
          dateText={
            currentViewerPhoto ? fmtDateTime(currentViewerPhoto.takenAt) : ""
          }
          locationText={viewerLocationText}
          onPressShare={handleViewerShare}
          onPressDelete={handleViewerDelete}
        />

        <Modal visible={slideshowPreparing} animationType="fade" transparent>
          <View style={styles.mapPreparingOverlay}>
            <View style={styles.mapPreparingCard}>
              <ActivityIndicator size="large" color="#ffffff" />
              <Text style={styles.mapPreparingTitle}>
                Preparing slideshow...
              </Text>
              <Text style={styles.mapPreparingSubtitle}>
                Please wait while we prepare the photos.
              </Text>
            </View>
          </View>
        </Modal>

        {/* <AsyncWorkDebugOverlay
          dbIndexComplete={dbIndexComplete}
          indexedPhotoCount={indexingProgress.photoIndexed}
          currentFilterPhotoCount={progress.total}
          photosLength={photos.length}
          photosAllLength={photosAll.length}
          displayUriMapSize={Object.keys(displayUriMap).length}
          thumbnailResolving={thumbnailResolving}
          thumbnailResolveRunId={thumbnailResolveRunId}
          photoLoadRequestId={photoLoadRequestId}
          currentDataSource={currentDataSource}
          hasNextPage={hasNextPage}
          appendLoading={appendLoading}
          backgroundLoading={backgroundLoading}
          pendingReload={pendingReloadVisible}
          staleRequestSkipCount={staleRequestSkipCount}
          warnings={asyncWarnings}
        /> */}
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: 20,
    ...Platform.select({
      //ios: { paddingTop: 0 },
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
  imageFrame: {
    width: "100%",
    aspectRatio: 1,
    height: imageWidth,
    borderRadius: 10,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 10 },
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
  imageLayer: {
    position: "absolute",
    top: 0,
    left: 0,
  },
  imageHidden: {
    opacity: 0,
  },
  /* 2026.04.28 ph:// 미해결 구간의 빈 썸네일을 명시적으로 표시해 로딩 중 화면이 깨진 것처럼 보이지 않도록 추가 by June */
  imagePlaceholder: {
    backgroundColor: "#EEF2F7",
    overflow: "hidden",
    justifyContent: "flex-end",
  },
  imagePlaceholderLayer: {
    position: "absolute",
    top: 0,
    left: 0,
  },
  imagePlaceholderTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  imagePlaceholderBars: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 12,
    gap: 7,
  },
  imagePlaceholderBar: {
    height: 9,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.52)",
  },
  imagePlaceholderBarWide: {
    width: "72%",
  },
  imagePlaceholderBarMedium: {
    width: "46%",
  },
  imagePlaceholderSheen: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: "34%",
    backgroundColor: "rgba(255,255,255,0.48)",
    opacity: 0.9,
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
    backgroundColor: "#FFFFFF", // 내부 흰색
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
  scrollDownHintButton: {
    position: "absolute",
    right: 18,
    bottom: 22,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(17,24,39,0.82)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
    zIndex: 12,
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
  mapPreparingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.58)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  mapPreparingCard: {
    width: "100%",
    maxWidth: 320,
    borderRadius: 20,
    paddingHorizontal: 22,
    paddingVertical: 24,
    backgroundColor: "rgba(17,24,39,0.94)",
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.28,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 10,
  },
  mapPreparingTitle: {
    marginTop: 14,
    fontSize: 17,
    fontWeight: "700",
    color: "#FFFFFF",
    textAlign: "center",
  },
  mapPreparingSubtitle: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 18,
    color: "rgba(255,255,255,0.78)",
    textAlign: "center",
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
  disabledWhileLoading: {
    opacity: 0.55,
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
  emptyTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111",
    marginBottom: 6,
  },
  emptyDesc: {
    fontSize: 13,
    color: "#666",
    textAlign: "center",
    lineHeight: 18,
  },

  croppedButtonWrap: {
    //width: 128,
    height: 60,
    overflow: "hidden",
    //borderRadius: 16,
    //marginRight: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  croppedButtonImage: {
    width: "100%",
    height: 56, // 원본보다 더 크게 잡고
    transform: [{ translateY: -6 }], // 아래 여백 잘라내기
  },

  /** 2026.03.18 Add by June */
  topButtonsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    width: "100%",
  },
  topBannerWrap: {
    width: "100%",
    marginBottom: 10,
  },

  topLeftSpace: {
    flex: 3, // 30%
  },

  topButtonsGroup: {
    flex: 7, // 70%
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  playButtonSlot: {
    flex: 3, // 30
    height: 38,
    marginRight: 5,
    justifyContent: "center",
  },

  mapButtonSlot: {
    flex: 3, // 30
    height: 38,
    marginLeft: 0,
    marginRight: 5,
    justifyContent: "center",
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
    width: "100%",
    height: "100%",
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#2563EB",
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },
  locationSearchModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.42)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  locationSearchModalCard: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 28,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 24,
    paddingVertical: 28,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
  },
  locationSearchModalTitle: {
    fontSize: 28,
    lineHeight: 38,
    fontWeight: "700",
    color: "#111827",
    textAlign: "center",
  },
  locationSearchModalBody: {
    marginTop: 16,
    fontSize: 18,
    lineHeight: 30,
    fontWeight: "600",
    color: "#1F2937",
    textAlign: "center",
  },
  locationSearchModalHint: {
    marginTop: 22,
    fontSize: 16,
    lineHeight: 28,
    color: "#374151",
    textAlign: "center",
  },
  locationSearchModalActions: {
    marginTop: 28,
    gap: 12,
  },
  locationSearchPrimaryButton: {
    borderRadius: 18,
    backgroundColor: "#111827",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 52,
    paddingHorizontal: 16,
  },
  locationSearchPrimaryButtonText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "700",
  },
  locationSearchSecondaryButton: {
    borderRadius: 18,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 52,
    paddingHorizontal: 16,
  },
  locationSearchSecondaryButtonText: {
    color: "#111827",
    fontSize: 17,
    fontWeight: "700",
  },
  locationSearchProgressBody: {
    marginTop: 20,
    fontSize: 18,
    lineHeight: 28,
    color: "#1F2937",
    textAlign: "center",
    fontWeight: "600",
  },
  locationSearchProgressTrack: {
    marginTop: 18,
    height: 12,
    borderRadius: 999,
    backgroundColor: "#E5E7EB",
    overflow: "hidden",
  },
  locationSearchProgressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: "#4F46E5",
  },
  locationSearchProgressPercentText: {
    marginTop: 14,
    fontSize: 17,
    color: "#111827",
    textAlign: "center",
    fontWeight: "700",
  },
  locationSearchProgressSubText: {
    marginTop: 8,
    fontSize: 15,
    color: "#4B5563",
    textAlign: "center",
    lineHeight: 24,
  },
  /** 2026.03.18 Add by June */
});
