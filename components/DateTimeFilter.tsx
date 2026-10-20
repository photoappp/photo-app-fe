// DateTimeFilter.tsx
import { Photo } from "@/types/Photo";
import { LinearGradient } from "expo-linear-gradient";
import {
  useCallback,
  useEffect,
  //useCallback, useMemo, ,
  useRef,
  useState,
} from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  //Button, FlatList, PermissionsAndroid,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import DateTimePicker from "./DateTimePicker";
// 2026-03-03 추가: LocationSelector 컴포넌트 import by yen
import { useSafeAreaInsets } from "react-native-safe-area-context";
import LocationSelector, { LocationSelectorHandle } from "./LocationSelector";

import { useI18n } from "@/components/context/useI18n";

import ICON_CLOSE from "@/assets/icons/ic_close.svg";
import ICON_DATE from "@/assets/icons/ic_date.svg";
import ICON_LOCATION from "@/assets/icons/ic_location.svg";
import ICON_RESET from "@/assets/icons/ic_reset.svg";
import ICON_TIME from "@/assets/icons/ic_time.svg";
import { clampToToday, shiftMonthsClamped } from "@/components/dateUtil";
import * as amplitude from "@amplitude/analytics-react-native";

type DatePickersResponsiveProps = {
  dateStart: Date;
  dateEnd: Date;
  onChangeStart: (d: Date) => void;
  onChangeEnd: (d: Date) => void;
};

const DatePickersResponsive = ({
  dateStart,
  dateEnd,
  onChangeStart,
  onChangeEnd,
}: DatePickersResponsiveProps) => {
  const { width } = useWindowDimensions();
  // 폭이 좁으면 세로 스택, 넓으면 좌우 배치
  const stack = true;
  const maxDate = new Date();

  return (
    <>
      <View
        style={[
          styles.row,
          stack && { flexDirection: "column", alignItems: "stretch" },
        ]}
      >
        <View style={[styles.pickerBox, stack && styles.pickerBoxStack]}>
          <DateTimePicker
            mode="date"
            value={dateStart}
            onChange={onChangeStart}
            maximumDate={maxDate}
          />
        </View>

        <View style={[styles.pickerBox, stack && styles.pickerBoxStack]}>
          <DateTimePicker
            mode="date"
            value={dateEnd}
            onChange={onChangeEnd}
            maximumDate={maxDate}
          />
        </View>
      </View>
    </>
  );
};

// iOS UIDatePicker 스피너 기본 높이(기기별 216~220)
const IOS_WHEEL_NATIVE_HEIGHT = 220;
// 한 줄 높이(UIDatePicker 폰트 기준 대략 44pt)
const ROW_HEIGHT = 30;
const VISIBLE_ROWS = 3;
const VISIBLE_HEIGHT = ROW_HEIGHT * VISIBLE_ROWS;
const WHEEL_SCALE = 0.95; // 0.88~0.95 사이 조절 가능

// scale 후 실제 렌더 높이
const RENDERED_HEIGHT = IOS_WHEEL_NATIVE_HEIGHT * WHEEL_SCALE;
// 위/아래 덮을 마스크 높이
const COVER_HEIGHT = Math.max(0, (RENDERED_HEIGHT - VISIBLE_HEIGHT) / 2);

const pad = (n: number) => `${n}`.padStart(2, "0");
const fmtDate = (d: Date) =>
  `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
const fmtTime = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;

/* 2026.10.19 Search 버튼은 'All Dates'/'All Times' 프리셋과 같은 그라데이션 디자인을 쓴다 by Claude */
const SEARCH_GRADIENT = ["#2B7FFF", "#AD46FF"] as const;
const SEARCH_GRADIENT_DISABLED = ["#A9C4EC", "#CBB6E8"] as const;

const today = new Date();
const recent31DaysStart = new Date(
  today.getFullYear(),
  today.getMonth(),
  today.getDate() - 30,
);

type DateTimeFilterValue = {
  dateStart: Date;
  dateEnd: Date;
  timeStart: number; // 0~1439
  timeEnd: number;
};

type DateTimeFilterProps = {
  value?: DateTimeFilterValue;
  onChange?: (value: DateTimeFilterValue) => void;
  photos: Photo[]; // add photos here
  /* 2026.04.22 All Dates 선택 시 실제 사진첩 최저 날짜를 외부(DB 우선)에서 주입받아 1970 고정 범위를 제거하기 위해 비동기 resolver prop을 추가 by June */
  resolveOldestPhotoDate?: () => Promise<Date | null>;
  /* 2026.05.28 위치 목록이 아직 인덱싱/지오코딩 중일 때 바텀시트 안에서 명확한 안내를 보여주기 위한 상태 by June */
  locationPreparing?: boolean;
  locationPreparingMessage?: string;
  /* 2026.10.11 백그라운드 도시 해소 잔여 수 — 위치 선택기에 '정리 중 (n)' 표시용 by Claude */
  geocodePendingCount?: number;
  /* 2026.10.19 DB 전체에서 구성한 장소 목록 by Claude */
  availablePlaces?: { country: string; city: string | null }[];
  onOpenLocationRequest?: () => boolean | Promise<boolean>;
  locationOpenToken?: number;
  interactionBlocked?: boolean;
  interactionBlockedReason?: string;
  /* 2026.10.19 검색 진행 중이면 시트의 Search 버튼을 비활성화하고 'Searching…'으로 표시 by Claude */
  searching?: boolean;
  onLocationChange: (value: {
    countries: string[];
    cities: string[];
    locationLabel: string;
  }) => void;
  /* 2026.06.23 [포인트3] 위치 메뉴 내부 버튼용 리워드 게이트 콜백을 LocationSelector로 전달 by yen */
  onLocationGate?: () => Promise<boolean>;
};

type TimePreset = {
  label: string;
  s: number; // start minute (0~1439)
  e: number; // end minute (0~1439)
};

const PRESETS: TimePreset[] = [
  { label: "00:00–05:59", s: 0, e: 6 * 60 - 1 }, // 00:00 – 05:59
  { label: "06:00–11:59", s: 6 * 60, e: 12 * 60 - 1 }, // 06:00 – 11:59
  { label: "12:00–17:59", s: 12 * 60, e: 18 * 60 - 1 }, // 12:00 – 17:59
  { label: "18:00–23:59", s: 18 * 60, e: 24 * 60 - 1 }, // 18:00 – 23:59
];

type DatePreset = {
  key:
    | "one_year_ago"
    | "past_12_months"
    | "one_month_ago"
    | "past_30_days"
    | "one_week_ago"
    | "past_7_days"
    | "all_times";
  label: string;
  fullWidth?: boolean;
  getRange: (now: Date) => { start: Date; end: Date };
};

const DATE_PRESETS: DatePreset[] = [
  {
    key: "one_year_ago",
    label: "One Year Ago",
    getRange: (now) => {
      const d = new Date(now);
      d.setFullYear(d.getFullYear() - 1);
      return { start: d, end: d };
    },
  },
  {
    key: "past_12_months",
    label: "Past 12 Months",
    getRange: (now) => {
      const end = clampToToday(now);
      const start = shiftMonthsClamped(end, -12);
      start.setDate(start.getDate() + 1);
      return { start, end };
    },
  },
  {
    key: "one_month_ago",
    label: "One Month Ago",
    getRange: (now) => {
      const d = shiftMonthsClamped(now, -1);
      return { start: d, end: d };
    },
  },
  {
    key: "past_30_days",
    label: "Past 30 Days",
    getRange: (now) => {
      const end = new Date(now);
      const start = new Date(now);
      start.setDate(start.getDate() - 29);
      return { start, end };
    },
  },
  {
    key: "one_week_ago",
    label: "One Week Ago",
    getRange: (now) => {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      return { start: d, end: d };
    },
  },
  {
    key: "past_7_days",
    label: "Past 7 Days",
    getRange: (now) => {
      const end = new Date(now);
      const start = new Date(now);
      start.setDate(start.getDate() - 6);
      return { start, end };
    },
  },
  {
    key: "all_times",
    label: "All Times",
    fullWidth: true,
    getRange: (now) => {
      const start = new Date(1970, 0, 1);
      const end = new Date(now);
      return { start, end };
    },
  },
];

export default function DateTimeFilter({
  value,
  onChange,
  photos,
  resolveOldestPhotoDate,
  locationPreparing = false,
  locationPreparingMessage,
  geocodePendingCount,
  availablePlaces,
  onOpenLocationRequest,
  locationOpenToken = 0,
  interactionBlocked = false,
  interactionBlockedReason,
  searching = false,
  onLocationChange,
  onLocationGate,
}: DateTimeFilterProps) {
  // ---- 필터 상태 ----
  const [dateStart, setDateStart] = useState(recent31DaysStart);
  const [dateEnd, setDateEnd] = useState(today);

  // 시간은 분 단위 (0~1439; 1439=24:00 허용)
  const [timeStart, setTimeStart] = useState(0);
  const [timeEnd, setTimeEnd] = useState(1439);

  const normalizeTimeRange = useCallback((nextStart: number, nextEnd: number) => {
    const clampTime = (value: number) => Math.max(0, Math.min(1439, value));
    const start = clampTime(nextStart);
    const end = clampTime(nextEnd);

    if (start > end) {
      return { timeStart: start, timeEnd: start };
    }

    return { timeStart: start, timeEnd: end };
  }, []);

  // ---- 모달 표시 상태 ----
  const [dateModalVisible, setDateModalVisible] = useState(false);
  const [timeModalVisible, setTimeModalVisible] = useState(false);
  const [locationModalVisible, setLocationModalVisible] = useState(false);
  // 2026-03-04 추가: LocationSelector에 전달할 ref by yen
  const locationRef = useRef<LocationSelectorHandle>(null);
  // 플랫폼 플래그
  const isIOS = Platform.OS === "ios";

  // 안드로이드에서만 사용할, “어느 필드를 편집 중인지” 상태
  const [androidDateField, setAndroidDateField] = useState<
    "start" | "end" | null
  >(null);
  const [androidTimeField, setAndroidTimeField] = useState<
    "start" | "end" | null
  >(null);

  /* 2026.10.19 시트를 여는 순간의 값을 스냅샷으로 들고, 시트 안의 조작은 모두 '초안(draft)'으로 취급한다.
     Search를 누르면 초안을 확정해 onChange로 올리고, 닫기(X/배경/백버튼)는 스냅샷으로 되돌린다.
     기존 디바운스 자동 emit(DEBOUNCE_MS/debounceTimerRef/bypassDebounceRef)은 '닫기=검색'이었기 때문에
     전부 제거했다 — Search만이 검색의 유일한 트리거 (PicQly-T와 동일) by Claude */
  const dateDraftSnapshotRef = useRef<{ dateStart: Date; dateEnd: Date } | null>(
    null,
  );
  const timeDraftSnapshotRef = useRef<{
    timeStart: number;
    timeEnd: number;
  } | null>(null);
  const sheetTransitionLockUntilRef = useRef(0);

  const onChangeStartSafe = (d: Date) => {
    const nd = clampToToday(d);
    setDateStart(nd);
    if (nd > dateEnd) setDateEnd(nd);
  };

  const onChangeEndSafe = (d: Date) => {
    const nd = clampToToday(d);
    setDateEnd(nd);
    if (nd < dateStart) setDateStart(nd);
  };

  const isSheetTransitionLocked = (type: string, action: string) => {
    const now = Date.now();
    if (now < sheetTransitionLockUntilRef.current) {
      console.log("[FilterSheet] ignored transition", {
        type,
        action,
        remainingMs: sheetTransitionLockUntilRef.current - now,
      });
      return true;
    }
    return false;
  };

  const lockSheetTransition = () => {
    sheetTransitionLockUntilRef.current = Date.now() + 350;
  };

  /* 2026.10.19 닫기는 아무것도 적용하지 않는다 — 시트를 열 때 찍어둔 스냅샷으로 값을 되돌리고 닫기만 한다.
     (이전에는 닫기가 flushPendingChange로 검색을 트리거했다) by Claude */
  const closeDateSheet = (source: string) => {
    if (!dateModalVisible) return;
    if (isSheetTransitionLocked("date", `close:${source}`)) return;
    lockSheetTransition();
    console.log("[FilterSheet] close", { type: "date", source, applied: false });
    const snapshot = dateDraftSnapshotRef.current;
    if (snapshot) {
      setDateStart(snapshot.dateStart);
      setDateEnd(snapshot.dateEnd);
    }
    setAndroidDateField(null);
    setDateModalVisible(false);
  };

  const closeTimeSheet = (source: string) => {
    if (!timeModalVisible) return;
    if (isSheetTransitionLocked("time", `close:${source}`)) return;
    lockSheetTransition();
    console.log("[FilterSheet] close", { type: "time", source, applied: false });
    const snapshot = timeDraftSnapshotRef.current;
    if (snapshot) {
      setTimeStart(snapshot.timeStart);
      setTimeEnd(snapshot.timeEnd);
    }
    setAndroidTimeField(null);
    setTimeModalVisible(false);
  };

  const closeLocationSheet = (source: string) => {
    if (!locationModalVisible) return;
    if (isSheetTransitionLocked("location", `close:${source}`)) return;
    lockSheetTransition();
    console.log("[FilterSheet] close", { type: "location", source });
    setLocationModalVisible(false);
  };

  const openDateSheet = () => {
    console.log("[FilterTap] date", {
      interactionBlocked,
      interactionBlockedReason: interactionBlockedReason ?? null,
      dateModalVisible,
      timeModalVisible,
      locationModalVisible,
      transitionLocked:
        Date.now() < sheetTransitionLockUntilRef.current,
      remainingMs: Math.max(
        0,
        sheetTransitionLockUntilRef.current - Date.now(),
      ),
    });
    if (dateModalVisible) return;
    if (isSheetTransitionLocked("date", "open")) return;
    lockSheetTransition();
    console.log("[FilterSheet] open", { type: "date" });
    amplitude.track("tap_date_filter", { screen_name: "home" });
    /* 2026.10.19 되돌리기용 스냅샷 — 닫기로 빠져나가면 이 값으로 복원 by Claude */
    dateDraftSnapshotRef.current = { dateStart, dateEnd };
    setDateModalVisible(true);
  };

  const openTimeSheet = () => {
    console.log("[FilterTap] time", {
      interactionBlocked,
      interactionBlockedReason: interactionBlockedReason ?? null,
      dateModalVisible,
      timeModalVisible,
      locationModalVisible,
      transitionLocked:
        Date.now() < sheetTransitionLockUntilRef.current,
      remainingMs: Math.max(
        0,
        sheetTransitionLockUntilRef.current - Date.now(),
      ),
    });
    if (timeModalVisible) return;
    if (isSheetTransitionLocked("time", "open")) return;
    lockSheetTransition();
    console.log("[FilterSheet] open", { type: "time" });
    amplitude.track("tap_time_filter", { screen_name: "home" });
    /* 2026.10.19 되돌리기용 스냅샷 — 닫기로 빠져나가면 이 값으로 복원 by Claude */
    timeDraftSnapshotRef.current = { timeStart, timeEnd };
    setTimeModalVisible(true);
  };

  const performOpenLocationSheet = () => {
    if (locationModalVisible) return;
    if (isSheetTransitionLocked("location", "open")) return;
    lockSheetTransition();
    console.log("[FilterSheet] open", { type: "location" });
    amplitude.track("tap_location_filter", { screen_name: "home" });
    setLocationModalVisible(true);
  };

  const openLocationSheet = async () => {
    console.log("[FilterTap] location", {
      interactionBlocked,
      interactionBlockedReason: interactionBlockedReason ?? null,
      locationPreparing,
      dateModalVisible,
      timeModalVisible,
      locationModalVisible,
      transitionLocked:
        Date.now() < sheetTransitionLockUntilRef.current,
      remainingMs: Math.max(
        0,
        sheetTransitionLockUntilRef.current - Date.now(),
      ),
    });
    const shouldOpen = onOpenLocationRequest
      ? await onOpenLocationRequest()
      : true;
    if (!shouldOpen) return;
    performOpenLocationSheet();
  };

  useEffect(() => {
    if (!locationOpenToken) return;
    performOpenLocationSheet();
  }, [locationOpenToken]);

  /* 2026.10.19 값이 바뀌면 디바운스 후 자동으로 onChange를 쏘던 effect를 제거했다 —
     시트를 닫는 것만으로 검색이 돌던 동작의 원인이었다. 지금은 Search 버튼과
     칩의 초기화 버튼만 emitChange를 호출한다 by Claude */

  /* 2026.10.19 상위가 '새로' 밀어준 값만 받아들인다 — 이전에는 local != value 이면 언제든 덮어썼기 때문에,
     Search로 확정한 직후(상위가 아직 반영 전) 이 effect가 돌면 방금 확정한 값이 옛 value로 되돌아갔다.
     value가 지난번에 본 값과 같으면(=상위에서 새로 온 게 없음) 아무것도 하지 않는다 by Claude */
  const lastSeenValueSigRef = useRef<string | null>(null);

  useEffect(() => {
    if (!value) return;
    if (
      dateModalVisible ||
      timeModalVisible ||
      androidDateField !== null ||
      androidTimeField !== null
    ) {
      return;
    }

    const nextDateStart = clampToToday(value.dateStart);
    const nextDateEnd = clampToToday(value.dateEnd);
    const externalSig = `${nextDateStart.getTime()}|${nextDateEnd.getTime()}|${value.timeStart}|${value.timeEnd}`;

    if (externalSig === lastSeenValueSigRef.current) return;
    lastSeenValueSigRef.current = externalSig;

    const localSig = `${dateStart.getTime()}|${dateEnd.getTime()}|${timeStart}|${timeEnd}`;
    if (externalSig === localSig) return;

    setDateStart(nextDateStart);
    setDateEnd(nextDateEnd);
    const normalizedTime = normalizeTimeRange(value.timeStart, value.timeEnd);
    setTimeStart(normalizedTime.timeStart);
    setTimeEnd(normalizedTime.timeEnd);
  }, [
    androidDateField,
    androidTimeField,
    dateEnd,
    dateModalVisible,
    dateStart,
    normalizeTimeRange,
    timeEnd,
    timeModalVisible,
    timeStart,
    value,
  ]);

  /* 2026.04.22 현재 로드된 사진 배열에서도 최소 날짜를 계산할 수 있도록 fallback 헬퍼를 추가해 DB 미적재 구간의 All Dates 정확도를 보강하기 위해 추가 by June */
  const getOldestDateFromLoadedPhotos = () => {
    let minTakenAt: number | null = null;
    for (const photo of photos) {
      if (!photo.takenAt || !Number.isFinite(photo.takenAt)) continue;
      if (minTakenAt === null || photo.takenAt < minTakenAt) {
        minTakenAt = photo.takenAt;
      }
    }
    return minTakenAt ? new Date(minTakenAt) : null;
  };

  /* 2026.04.22 All Dates 프리셋에서 비동기 최소 날짜 해석(DB 우선, 로컬 fallback)을 지원하기 위해 preset 적용 함수를 async로 확장 by June */
  const applyDatePreset = async (key: DatePreset["key"]) => {
    const preset = DATE_PRESETS.find((p) => p.key === key);
    if (!preset) return;

    const now = new Date();
    let { start, end } = preset.getRange(now);

    /* 2026.04.22 all_times에서만 동적 최소 날짜를 적용해 기존 다른 프리셋 동작은 완전히 유지하기 위해 조건 분기 추가 by June */
    if (key === "all_times") {
      try {
        /* 2026.04.22 우선순위를 DB resolver로 두어 전체 라이브러리 기준 최저 날짜를 반영하도록 먼저 조회 by June */
        const resolvedOldestDate = resolveOldestPhotoDate
          ? await resolveOldestPhotoDate()
          : null;
        /* 2026.04.22 resolver 미응답 시 현재 로드된 사진으로 보정해 사용자가 즉시 체감 가능한 범위를 제공하기 위해 fallback 적용 by June */
        const fallbackOldestDate = getOldestDateFromLoadedPhotos();
        const oldestDate = resolvedOldestDate ?? fallbackOldestDate;
        if (oldestDate && Number.isFinite(oldestDate.getTime())) {
          /* 2026.04.22 필터 시작 시각 변동으로 인한 일자 경계 흔들림을 막기 위해 시작일을 해당 날짜의 자정으로 정규화 by June */
          start = new Date(
            oldestDate.getFullYear(),
            oldestDate.getMonth(),
            oldestDate.getDate(),
          );
        }
      } catch (error) {
        /* 2026.04.22 최소 날짜 조회 실패가 프리셋 전체 실패로 이어지지 않도록 1970 fallback을 유지하면서 오류만 로깅하기 위해 보호 처리 추가 by June */
        console.log("all_times oldest date resolve error:", error);
      }
    }

    amplitude.track("tap_date_preset", {
      screen_name: "home",
      preset_key: key,
      start_ms: start.getTime(),
      end_ms: end.getTime(),
    });

    /* 2026.10.19 프리셋은 초안만 바꾼다 — 검색은 Search 버튼에서만 (PicQly-T와 동일) by Claude */
    setDateStart(start);
    setDateEnd(end);
  };

  const applyTimePreset = (s: number, e: number) => {
    /* 2026.10.19 프리셋은 초안만 바꾼다 — 검색은 Search 버튼에서만 by Claude */
    const normalized = normalizeTimeRange(s, e);
    setTimeStart(normalized.timeStart);
    setTimeEnd(normalized.timeEnd);
  };

  const onChangeTimeStartSafe = (d: Date) => {
    const nextStart = d.getHours() * 60 + d.getMinutes();
    const normalized = normalizeTimeRange(nextStart, timeEnd);
    setTimeStart(normalized.timeStart);
    setTimeEnd(normalized.timeEnd);
  };

  const onChangeTimeEndSafe = (d: Date) => {
    const nextEnd = d.getHours() * 60 + d.getMinutes();
    const normalized = normalizeTimeRange(timeStart, nextEnd);
    setTimeStart(normalized.timeStart);
    setTimeEnd(normalized.timeEnd);
  };

  /*
  // ---- 즐겨찾기 ----
  const favOneYearAgo = () => {
    amplitude.track("tap_date_favorite", {
      screen_name: "home",
      favorite_key: "one_year_ago",
    });

    const now = new Date();
    const d = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
    setDateStart(d);
    setDateEnd(d);
  };
  const favOneMonthAgo = () => {
    amplitude.track("tap_date_favorite", {
      screen_name: "home",
      favorite_key: "one_month_ago",
    });
    const now = new Date();
    const d = shiftMonthsClamped(now, -1);
    setDateStart(d);
    setDateEnd(d);
  };
  const favPastMonth = () => {
    amplitude.track("tap_date_favorite", {
      screen_name: "home",
      favorite_key: "past_month",
    });
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const last = new Date(now.getFullYear(), now.getMonth(), 0);
    setDateStart(first);
    setDateEnd(last);
  };
  const favPastWeek = () => {
    amplitude.track("tap_date_favorite", {
      screen_name: "home",
      favorite_key: "past_week",
    });
    const now = new Date();
    const s = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
    const e = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    setDateStart(s);
    setDateEnd(e);
  }; */

  // ---- Time 수정 유틸 (시/분을 분단위로) ----
  // ---- 렌더 ----
  const dateLabel = `${fmtDate(dateStart)} – ${fmtDate(dateEnd)}`;
  const timeLabel = `${fmtTime(timeStart)} – ${fmtTime(timeEnd)}`;
  /* 2026.04.22 번역 처리 재구현을 위해 컴포넌트에서 TRANSLATIONS 직접 접근 대신 공용 i18n 훅을 사용하도록 변경 by June */
  const { t } = useI18n();
  /* 2026.04.22 위치 라벨 기본값도 다국어로 노출되도록 빈 상태를 두고 렌더 시 번역 fallback을 사용하도록 변경 by June */
  const [locationLabel, setLocationLabel] = useState("");

  const emitCountRef = useRef(0);
  /* 2026.10.19 emit할 값을 인자로 받는다 — 이전에는 렌더 클로저의 state를 읽어서,
     setState 직후에 호출하면 한 틱 전 값이 올라가는 문제가 있었다(칩 초기화 버튼이 그 경로였다) by Claude */
  const emitChange = (payload: DateTimeFilterValue) => {
    const { dateStart: nextStart, dateEnd: nextEnd, timeStart: nextTimeStart, timeEnd: nextTimeEnd } =
      payload;

    /* 2026.10.19 동일 값 중복 emit 가드를 제거했다 — 상위 handleDateTimeChange가 이미
       valueUnchanged로 걸러내고, 여기서 또 막으면 직전 emit이 적용되지 않은 상황(검색 취소 등)에서
       Search가 아무 반응도 하지 않는 막힌 상태가 생긴다 by Claude */
    emitCountRef.current += 1;
    console.log(`[EMIT #${emitCountRef.current}]`, new Date().toISOString(), {
      dateStart: nextStart.toISOString().slice(0, 10),
      dateEnd: nextEnd.toISOString().slice(0, 10),
      timeStart: nextTimeStart,
      timeEnd: nextTimeEnd,
    });

    onChange?.(payload);
  };

  const insets = useSafeAreaInsets();

  /* 2026.10.19 Search 버튼 — 시트 안의 초안을 확정해 검색을 돌린다. 검색의 유일한 트리거 by Claude */
  const isDateRangeInvalid = dateStart.getTime() > dateEnd.getTime();
  const isSearchDisabled = searching || interactionBlocked;

  const runDateSearch = () => {
    if (isSearchDisabled || isDateRangeInvalid) return;
    console.log("[FilterSheet] search", { type: "date" });
    /* 닫기와 같은 전환 잠금 — 닫히는 애니메이션 중 재오픈으로 시트가 꼬이지 않게 by Claude */
    lockSheetTransition();
    /* 되돌릴 대상이 없어지므로 스냅샷을 비운다 — 이후 닫기에서 복원되지 않도록 */
    dateDraftSnapshotRef.current = null;
    setAndroidDateField(null);
    setDateModalVisible(false);
    emitChange({ dateStart, dateEnd, timeStart, timeEnd });
  };

  const runTimeSearch = () => {
    if (isSearchDisabled) return;
    console.log("[FilterSheet] search", { type: "time" });
    lockSheetTransition();
    timeDraftSnapshotRef.current = null;
    setAndroidTimeField(null);
    setTimeModalVisible(false);
    emitChange({ dateStart, dateEnd, timeStart, timeEnd });
  };

  // 날짜, 시간 초기화 버튼
  // const resetProcess = () => {

  // };

  /* 2026.04.15 렌더링 반복 시 콘솔 스팸으로 실제 에러 분석이 어려워져 ICON_DATE 디버그 로그를 제거 by June */

  return (
    <View>
      {/* 하단 고정 필터 패널 */}
      <View style={styles.filterPanel}>
        {/* Date row */}
        <View style={styles.filterRow}>
          <TouchableOpacity
            style={styles.filterIcon}
            activeOpacity={0.8}
            onPress={openDateSheet}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <ICON_DATE width={50} height={50} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={openDateSheet}
            activeOpacity={0.8}
            style={styles.filterCard}
          >
            <Text style={styles.filterValue} numberOfLines={1}>
              {dateLabel}
            </Text>
            <TouchableOpacity
              onPress={() => {
                /* 2026.10.19 칩의 초기화 버튼은 시트 밖이라 Search가 없으므로 즉시 적용 —
                   emitChange에 새 값을 직접 넘긴다(이전엔 state 갱신 전 값이 올라갔다) by Claude */
                setDateStart(recent31DaysStart);
                setDateEnd(today);
                emitChange({
                  dateStart: recent31DaysStart,
                  dateEnd: today,
                  timeStart,
                  timeEnd,
                });
              }}
            >
              <ICON_RESET width={70} />
            </TouchableOpacity>
          </TouchableOpacity>
        </View>

        {/* Time row */}
        <View style={styles.filterRow}>
          <TouchableOpacity
            style={styles.filterIcon}
            activeOpacity={0.8}
            onPress={openTimeSheet}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <ICON_TIME width={50} height={50} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={openTimeSheet}
            activeOpacity={0.8}
            style={styles.filterCard}
          >
            <Text style={styles.filterValue} numberOfLines={1}>
              {timeLabel}
            </Text>
            <TouchableOpacity
              onPress={() => {
                /* 2026.10.19 칩의 초기화 버튼은 즉시 적용 — 위 날짜 초기화와 동일 정책 by Claude */
                setTimeStart(0);
                setTimeEnd(1439);
                emitChange({
                  dateStart,
                  dateEnd,
                  timeStart: 0,
                  timeEnd: 1439,
                });
              }}
            >
              <ICON_RESET width={70} />
            </TouchableOpacity>
          </TouchableOpacity>
        </View>
        {/* 하단 고정 필터 패널 END */}

        {/* Location row */}
        <View style={styles.filterRow}>
          {/* 2026.03.03 아이콘 버튼 클릭 시에도 바텀시트 표출되도록 수정 June */}
          <TouchableOpacity
            style={styles.filterIcon}
            activeOpacity={0.8}
            onPress={openLocationSheet}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <ICON_LOCATION width={50} height={50} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={openLocationSheet}
            activeOpacity={0.8}
            style={styles.filterCard}
          >
            <View style={styles.filterValueArea}>
              <Text style={styles.filterValue} numberOfLines={1}>
                {/* 2026.04.22 선택 위치가 없을 때 현재 언어의 기본 라벨을 표시하도록 fallback을 적용 by June */}
                {/* 2026-05-12: 'Anywhere' 표기를 폐기하고 'All Locations' 하나로 통일 by yen */}
                {locationLabel || t("allLocations")}
              </Text>
              {/* 2026-02-21 location reset function trigger added by yen*/}
              <TouchableOpacity
                onPress={() => {
                  locationRef.current?.handleReset();
                }}
              >
                <View style={styles.filterIcon}>
                  <ICON_RESET width={70} />
                </View>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </View>
      </View>

      {/* Date Bottom Sheet START*/}
      <Modal
        visible={dateModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => closeDateSheet("request")}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => closeDateSheet("backdrop")}
        >
          <Pressable
            onPress={(event) => event.stopPropagation()}
            style={[
              styles.sheet,
              {
                paddingBottom:
                  12 +
                  Math.max(insets.bottom, Platform.OS === "android" ? 16 : 0),
              },
            ]}
          >
            <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
              {/* 헤더 */}
              <View style={styles.sheetHeader}>
                <Text style={styles.sheetTitle}>{t("selectDate")}</Text>
                <View style={{ flexDirection: "row" }}>
                  <TouchableOpacity
                    onPress={() => closeDateSheet("header")}
                    style={{ marginLeft: 16 }}
                  >
                    <ICON_CLOSE width={20} height={20} />
                  </TouchableOpacity>
                </View>
              </View>
              <DatePickersResponsive
                dateStart={dateStart}
                dateEnd={dateEnd}
                onChangeStart={onChangeStartSafe}
                onChangeEnd={onChangeEndSafe}
              />
              {/* 즐겨찾기 */}
              {/* <View style={styles.favs}>
                <Fav label="One Year Ago" onPress={favOneYearAgo} />
                <Fav label="One Month Ago" onPress={favOneMonthAgo} />
                <Fav label="Past Month" onPress={favPastMonth} />
                <Fav label="Past Week" onPress={favPastWeek} />
              </View> */}
              {/* Favorite */}
              <View style={styles.presetGrid}>
                {DATE_PRESETS.map((p) => (
                  <TouchableOpacity
                    key={p.key}
                    activeOpacity={0.9}
                    style={[
                      styles.presetBtn,
                      p.fullWidth && styles.presetBtnFull,
                    ]}
                    /* 2026.04.22 비동기 preset 적용 중 Promise 반환 경고를 피하고 기존 버튼 인터랙션 흐름을 유지하기 위해 void 호출로 명시 by June */
                    onPress={() => void applyDatePreset(p.key)}
                  >
                    <LinearGradient
                      colors={["#2B7FFF", "#AD46FF"]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.rangeBtnGradient}
                    >
                      <Text style={styles.presetTxt}>{t(p.key, p.label)}</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                ))}
              </View>

              {/* 2026.10.19 Search — 이 버튼만이 검색을 시작한다. 닫기(X/배경/백버튼)는 아무것도 적용하지 않음 by Claude */}
              {isDateRangeInvalid ? (
                <Text style={styles.searchHintTxt}>
                  {t("invalidDateRange", "Start date is after the end date.")}
                </Text>
              ) : null}
              <TouchableOpacity
                activeOpacity={0.8}
                disabled={isSearchDisabled || isDateRangeInvalid}
                onPress={runDateSearch}
                style={[styles.presetBtn, styles.presetBtnFull]}
              >
                <LinearGradient
                  colors={
                    isSearchDisabled || isDateRangeInvalid
                      ? SEARCH_GRADIENT_DISABLED
                      : SEARCH_GRADIENT
                  }
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.rangeBtnGradient}
                >
                  <Text style={styles.presetTxt}>
                    {searching
                      ? t("searching", "Searching…")
                      : t("search", "Search")}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
      {/* Date Bottom Sheet END */}

      {/* Time Bottom Sheet START */}
      <Modal
        visible={timeModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => closeTimeSheet("request")}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => closeTimeSheet("backdrop")}
        >
          <Pressable
            onPress={(event) => event.stopPropagation()}
            style={[
              styles.sheet,
              {
                paddingBottom:
                  12 +
                  Math.max(insets.bottom, Platform.OS === "android" ? 16 : 0),
              },
            ]}
          >
            <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
              {/* 헤더 */}
              <View style={styles.sheetHeader}>
                <Text style={styles.sheetTitle}>{t("selectTime")}</Text>
                <View style={{ flexDirection: "row" }}>
                  <TouchableOpacity
                    onPress={() => closeTimeSheet("header")}
                    style={{ marginLeft: 16 }}
                  >
                    <ICON_CLOSE width={20} height={20} />
                  </TouchableOpacity>
                </View>
              </View>

              {/* 2개 피커 */}
              <View style={styles.row}>
                <View style={styles.pickerBox}>
                  <DateTimePicker
                    mode="time"
                    value={
                      new Date(
                        2000,
                        0,
                        1,
                        Math.floor(timeStart / 60),
                        timeStart % 60,
                      )
                    }
                    onChange={onChangeTimeStartSafe}
                  />
                </View>

                <View style={styles.pickerBox}>
                  <DateTimePicker
                    mode="time"
                    value={
                      new Date(
                        2000,
                        0,
                        1,
                        Math.floor(timeEnd / 60),
                        timeEnd % 60,
                      )
                    }
                    onChange={onChangeTimeEndSafe}
                  />
                </View>
              </View>

              {/* 프리셋 4개 */}
              <View style={styles.presetGrid}>
                {PRESETS.map((p) => (
                  <TouchableOpacity
                    key={p.label}
                    style={styles.presetBtn}
                    activeOpacity={0.8}
                    onPress={() => {
                      amplitude.track("tap_time_favorite", {
                        screen_name: "home",
                        preset_label: p.label,
                        time_start_min: p.s,
                        time_end_min: p.e,
                      });
                      applyTimePreset(p.s, p.e);
                    }}
                  >
                    <LinearGradient
                      colors={["#2B7FFF", "#AD46FF"]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.rangeBtnGradient}
                    >
                      <Text style={styles.presetTxt}>{p.label}</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                ))}
              </View>

              {/* all_day */}
              <TouchableOpacity
                style={[styles.presetBtn, styles.presetBtnFull]}
                activeOpacity={0.8}
                onPress={() => {
                  amplitude.track("tap_time_favorite", {
                    screen_name: "home",
                    preset_label: "all_day",
                    time_start_min: 0,
                    time_end_min: 1439,
                  });
                  applyTimePreset(0, 1439);
                }}
              >
                <LinearGradient
                  colors={["#2B7FFF", "#AD46FF"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.rangeBtnGradient}
                >
                  <Text style={styles.presetTxt}>
                    {t("all_day", "All Times")}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>

              {/* 2026.10.19 Search — 이 버튼만이 검색을 시작한다. 닫기는 아무것도 적용하지 않음 by Claude */}
              <TouchableOpacity
                activeOpacity={0.8}
                disabled={isSearchDisabled}
                onPress={runTimeSearch}
                style={[styles.presetBtn, styles.presetBtnFull]}
              >
                <LinearGradient
                  colors={
                    isSearchDisabled ? SEARCH_GRADIENT_DISABLED : SEARCH_GRADIENT
                  }
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.rangeBtnGradient}
                >
                  <Text style={styles.presetTxt}>
                    {searching
                      ? t("searching", "Searching…")
                      : t("search", "Search")}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
      {
        <LocationSelector
          // 2026-03-04 ref 전달 추가 by yen
          ref={locationRef}
          visible={locationModalVisible}
          onClose={() => closeLocationSheet("selector")}
          onSelectionChange={({ countries, cities, locationLabel }) => {
            onLocationChange({ countries, cities, locationLabel });
            setLocationLabel(locationLabel);
          }}
          photos={photos}
          isPreparing={locationPreparing}
          preparingMessage={locationPreparingMessage}
          pendingCityCount={geocodePendingCount}
          availablePlaces={availablePlaces}
          searching={searching}
          onGate={onLocationGate}
        />
      }
      {/* Time Bottom Sheet END */}
    </View>
  );
}

/* ---------------- UI 컴포넌트 ---------------- */
type ChipProps = {
  label: string;
  onPress: () => void;
  onReset: () => void;
};

// const Chip = ({ label, onPress, onReset }: ChipProps) => (
//   <TouchableOpacity onPress={onPress} style={styles.chip}>
//     <Text style={styles.chipTxt}>{label}</Text>
//     {/* <TouchableOpacity onPress={onReset} style={{ marginLeft: 6 }}>
//         <Text style={{ fontWeight: '700' }}>Reset</Text>
//       </TouchableOpacity> */}
//   </TouchableOpacity>
// );

type FavProps = {
  label: string;
  onPress: () => void;
};

/*
const Fav = ({ label, onPress }: FavProps) => (
  <TouchableOpacity onPress={onPress}>
    <LinearGradient
      colors={["#2B7FFF", "#AD46FF"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={styles.quickBtnGradient}
    >
      <Text style={styles.favTxt}>{label}</Text>
    </LinearGradient>
  </TouchableOpacity>
);*/

/* ---------------- 스타일 ---------------- */
const styles = StyleSheet.create({
  filterCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#fff",
    paddingHorizontal: 14,
    //paddingVertical: 10,
    height: 50,
    borderRadius: 12,
    // 그림자
    elevation: 3,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    flex: 1, // ← 레이블 옆에서 가능한 공간을 전부 차지함
    marginLeft: 12,
  },
  filterLabel: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#777",
    width: 65, // ← 레이블 길이를 고정해야 줄바꿈 안 생김
  },
  filterIcon: {
    alignItems: "center",
    justifyContent: "center",
  },
  filterValue: {
    fontSize: 12,
    color: "#000",
    flex: 1,
  },
  filterEdit: {
    fontSize: 10,
    color: "#3478f6",
    marginLeft: 12,
  },
  filterPanel: {
    //borderTopWidth: 1,
    //borderColor: '#eee',
    //backgroundColor: '#fff',
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 0,
  },
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  filterTitle: {
    fontSize: 12,
    color: "#888",
    width: 90, // 왼쪽 제목 폭 고정해서 정렬
  },
  filterValueArea: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginRight: 8,
  },

  chipTxt: { fontSize: 12, color: "#000" },
  resetBtn: { marginLeft: "auto" },
  resetTxt: { color: "#3478f6", fontWeight: "600" },
  thumb: {
    width: "24%",
    aspectRatio: 1,
    backgroundColor: "#ddd",
    margin: "0.5%",
    borderRadius: 6,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 12,
    maxHeight: "80%",
  },
  sheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sheetTitle: { fontWeight: "600", fontSize: 15, color: "#000" },
  link: { color: "#3478f6", fontWeight: "600" },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
    color: "#000",
  },
  section: { fontWeight: "600", color: "#000" },
  pickerBox: {
    width: "49%",
    borderWidth: 1,
    borderColor: "#eee",
    borderRadius: 12,
    ...Platform.select({
      ios: { height: VISIBLE_HEIGHT }, // 3줄
      android: {
        // 안드로이드는 휠 자체가 더 커서 높이를 충분히 주고 잘라내지 않음
        height: 130,
      },
    }),
    overflow: "hidden",
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff", // 모달 배경과 동일해야 덮개가 티 안남
    color: "#000",
    marginBottom: 0,
  },
  cover: {
    position: "absolute",
    left: 0,
    right: 0,
    backgroundColor: "#fff", // 모달 바탕색과 동일
    zIndex: 10,
  },
  pickerBoxStack: { width: "100%", marginTop: 5 },
  favs: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 12 },
  favBtn: {
    backgroundColor: "#F3F4F6",
    borderWidth: 1,
    borderColor: "#F3F4F6",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginRight: 0,
    marginBottom: 0,
  },
  favTxt: { fontSize: 9, fontWeight: "800", color: "#FFF" },

  presetGrid: {
    marginTop: 12,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  presetBtn: {
    width: "49%",
    //borderWidth: 1,
    //borderColor: '#999',
    borderRadius: 10,
    paddingVertical: 0,
    marginBottom: 5,
    alignItems: "center",
    justifyContent: "center",
  },
  presetBtnFull: {
    width: "100%",
    borderColor: "#999",
    //paddingVertical: 12,
  },
  presetTxt: {
    fontWeight: "600",
    color: "#FFF",
  },

  quickBtnGradient: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 14,
  },

  rangeBtnGradient: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    width: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  searchHintTxt: {
    marginTop: 8,
    textAlign: "center",
    color: "#C0392B",
    fontSize: 12,
  },
});
