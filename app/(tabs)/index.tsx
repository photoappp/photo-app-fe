import DateTimeFilter from "@/components/DateTimeFilter";
import ShowOnMap from "@/components/ShowOnMap";
import { Photo } from "@/types/Photo";
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from "expo-location";
import * as MediaLibrary from "expo-media-library";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Button,
  Dimensions,
  FlatList,
  Image,
  ListRenderItem,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  useColorScheme,
  View
} from "react-native";
import ImageViewing from "react-native-image-viewing";
import { SafeAreaView } from "react-native-safe-area-context";

import ShowonmapIcon from '@/assets/icons/showonmap.svg';
import SlideshowIcon from '@/assets/icons/slideshow.svg';

import ShowonmapIcon from "@/assets/icons/showonmap.svg";
import SlideshowIcon from "@/assets/icons/slideshow.svg";
import { AMPLITUDE_API_KEY } from '@/constants/env';
import * as amplitude from '@amplitude/analytics-react-native';

// Responsive image grid calculations
const screenWidth = Dimensions.get("window").width;
const minImageWidth = 100;
const horizontalPadding = 4;
const imageMargin = 2;
const numColumns = 5;
// ✅ 실제로 쓸 수 있는 폭: 화면 - (바깥 24 + 안쪽 horizontalPadding) * 2
const usableWidth = screenWidth - (24 + horizontalPadding) * 2;
// ✅ 이 usableWidth 기준으로 5등분 + margin
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
  continents: string[];
  countries: string[];
  cities: string[];
};
type FilterState = DateTimeFilterState & LocationFilterState;

/** ---------- HomeScreen ---------- */
export default function HomeScreen() {

  const navigation = useNavigation<any>();

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
  const colorScheme = useColorScheme();
  const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

  // ---- 사진 목록/페이지네이션 ----
  const [photos, setPhotos] = useState<Photo[]>([]); // 화면에 뿌릴 가공된 데이터
  const [endCursor, setEndCursor] = useState<string | null>(null); // MediaLibrary가 돌려주는 다음 페이지 커서 문자열
  const [hasNextPage, setHasNextPage] = useState<boolean>(true); // 다음 페이지 있는지 여부
  const [loading, setLoading] = useState<boolean>(false);

  const [userScrolled, setUserScrolled] = useState(false);
  const [listCanScroll, setListCanScroll] = useState(false);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);

  // ImageViewing 에 넘길 images 배열 (형식: { uri: string }[])
  const viewerImages = useMemo(
    () => photos.map((p) => ({ uri: p.uri })),
    [photos]
  );

  const photosRef = useRef<Photo[]>(photos);
  const viewerIndexRef = useRef<number>(viewerIndex);

  const lastEndCallRef = useRef(0);
  const onEndLockRef = useRef(false); // 연속 호출 잠금
  const onEndDuringMomentumRef = useRef(true); // 모멘텀 중 중복 호출 방지
  const isPaginatingRef = useRef(false); // footer 로딩바 표시에만 사용

  // ----- amplitude tracking helpers -----
  const is_amp_ready_ref = useRef(false);
  const home_view_start_ms_ref = useRef<number>(Date.now());

  // swipe threshold tracking (viewer)
  const swipe_count_ref = useRef(0);
  const swipe_threshold_fired_ref = useRef(false);
  const SWIPE_THRESHOLD = 10;
  let app_launched_tracked = false;

  // 날짜,시간 필터링 관련 ===> 컴포넌트로 분리하기!!
  const dayStartMs = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).getTime();
  const dayEndNextMs = (d: Date) =>
    new Date(
      d.getFullYear(),
      d.getMonth(),
      d.getDate() + 1,
      0,
      0,
      0,
      0
    ).getTime();

  const today = new Date();
  const oneMonthAgo = new Date(
    today.getFullYear(),
    today.getMonth() - 1,
    today.getDate()
  );

  const [filter, setFilter] = useState<FilterState>({
    dateStart: oneMonthAgo,
    dateEnd: new Date(),
    timeStart: 0,
    timeEnd: 1440,
    continents: [],
    countries: [],
    cities: [],
  });

  // 슬라이드쇼 관련
  const SLIDESHOW_MS = 2000;
  const [slideshowOn, setSlideshowOn] = useState(false);
  const slideshowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closingRef = useRef(false);
  const [slideshowVisible, setSlideshowVisible] = useState(false);
  const slideshowListRef = useRef<FlatList<{ uri: string }> | null>(null);


  const stopSlideshow = useCallback(() => {
    closingRef.current = true;
    setSlideshowOn(false);
    if (slideshowTimerRef.current !== null) {
      clearInterval(slideshowTimerRef.current);
      slideshowTimerRef.current = null;
    }
  }, []);
  
  const startSlideshow = useCallback(
    (startIndex: number = 0) => {
      // 사진 없으면 아무것도 하지 않음
      if (!photosRef.current?.length) return;
  
      // 기존 타이머 있으면 정리
      if (slideshowTimerRef.current !== null) {
        clearInterval(slideshowTimerRef.current);
        slideshowTimerRef.current = null;
      }      

      closingRef.current = false; // ✅ 시작할 때 닫기 플래그 해제
      setSlideshowOn(true);
      setViewerIndex(startIndex);
      setSlideshowVisible(true);
  
      slideshowTimerRef.current = setInterval(() => {

        if (closingRef.current) return; // ✅ 닫는 중이면 업데이트 금지

        const len = photosRef.current.length;
        if (!len) return;
      
        setViewerIndex((prev) => {
          const next = prev + 1;
      
          if (next >= len) {
            closeSlideshow();
            return prev;
          }
      
          slideshowListRef.current?.scrollToIndex({
            index: next,
            animated: true,
          });
      
          return next;
        });
      }, SLIDESHOW_MS);      
      
    },
    [stopSlideshow]
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
  
  useEffect(() => {
    return () => {
      // 앱 체류시간 측정
      const dwell_ms = Date.now() - home_view_start_ms_ref.current;
      amplitude.track("screen_home_exited", {
        screen_name: "home",
        dwell_ms,
      });
      // 화면 떠날 때 타이머 정리
      if (slideshowTimerRef.current) clearInterval(slideshowTimerRef.current);
    };
  }, []);

  const closeViewer = useCallback(() => {
    stopSlideshow();
    setViewerVisible(false);
  }, [stopSlideshow]);  

  const closeSlideshow = useCallback(() => {
    closingRef.current = true;
    setSlideshowOn(false);
  
    if (slideshowTimerRef.current !== null) {
      clearInterval(slideshowTimerRef.current);
      slideshowTimerRef.current = null;
    }

    amplitude.track("slideshow_closed", {
      screen_name: "home",
      end_index: viewerIndexRef.current ?? 0,
    });

    setSlideshowVisible(false); // ✅ 모달 닫기까지 여기서 끝냄
  }, []);

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
  
  
  async function imagesWithLocation(
    images: any[],
    opts?: { maxLookups?: number; precision?: number; delayMs?: number }
  ) {
    const maxLookups = opts?.maxLookups ?? 60; // 한 번 로드에서 지오코딩 최대 호출 수
    const precision = opts?.precision ?? 2; // 좌표 라운딩 자릿수(2 ≈ ~1km)
    const delayMs = opts?.delayMs ?? 150; // 호출 간 지연(ms)
    const cache = new Map<
      string,
      { country: string | null; city: string | null }
    >();
    const updated: any[] = [];
    let lookups = 0;

    for (const img of images) {
      if (!img.location) {
        updated.push({ ...img, country: null, city: null });
        continue;
      }

      const lat = Number(img.location.latitude);
      const lon = Number(img.location.longitude);
      const key = `${lat.toFixed(precision)},${lon.toFixed(precision)}`;
      let place = cache.get(key);

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
          lookups += 1;
          if (delayMs > 0) await sleep(delayMs);
        } catch (e: any) {
          // 레이트리밋/기타 에러 → 해당 좌표는 빈 값 캐시하고 진행
          place = { country: null, city: null };
          cache.set(key, place);
          // 간단 백오프
          await sleep(delayMs * 4);
        }
      }

      // 상한 초과 or 캐시된 값 사용
      if (!place) place = { country: null, city: null };
      updated.push({ ...img, ...place });
    }
    return updated;
  }

  const PAGE_SIZE = 50;
  const { dateStart, dateEnd, timeStart, timeEnd, countries, cities } = filter;

  const loadPhotos = useCallback(

    async ({ reset = false }: { reset?: boolean } = {}) => {
      // 1) 권한 확인
      const { status, canAskAgain } = await MediaLibrary.getPermissionsAsync();

      let hasPerm = status === "granted";

      if (!hasPerm && canAskAgain) {
        const req = await MediaLibrary.requestPermissionsAsync(false);
        hasPerm = req.status === "granted";
      }

      if (!hasPerm) {
        Alert.alert("권한 필요", "사진 접근 권한이 필요합니다.");
        return;
      } else {
        console.log("Access permit OK")
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

        const assets = result.assets ?? [];

        // 4) 날짜/시간 필터
        const filtered = assets.filter((a) => {
          const created =
            a.creationTime && a.creationTime > 0 ? a.creationTime : null;

          const modified =
            a.modificationTime && a.modificationTime > 0 ? a.modificationTime : null;

          const tsMs = created ?? modified;

          console.log(
            "creation:", a.creationTime,
            "mod:", a.modificationTime,
            "tsMs:", tsMs
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

        console.log('filtered length:::', filtered.length);


        // 5) 상세 정보 + 위치 포함해서 Photo로 매핑
        const baseInfos: Photo[] = await Promise.all(
          filtered.map(async (a) => {
            try {
              const info = await MediaLibrary.getAssetInfoAsync(a.id);
              const uri =
                true ? info.localUri ?? info.uri : info.uri;
              console.log("uri: ", uri);
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

        console.log("photos.length 1: ", photos.length)

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
        setPhotos((prev) =>
          reset ? filteredWithLocation : [...prev, ...filteredWithLocation]
        );
        setEndCursor(result.endCursor ?? null);
        setHasNextPage(result.hasNextPage);
      } catch (err) {
        console.log("MediaLibrary 오류:", err);
        Alert.alert("오류", "사진을 불러오는 중 문제가 발생했습니다.");
      } finally {
        setLoading(false);
      }
    },
    [loading, hasNextPage, endCursor, filter]
  );

  useEffect(() => {
    // 필터 바뀌면 페이지네이션 리셋 후 처음부터 다시 로드
    setEndCursor(null);
    setHasNextPage(true);
    loadPhotos({ reset: true });
  }, [filter]);

  // 썸네일 그리드에 사진 데이터 렌더링
  const renderItem: ListRenderItem<Photo> = ({ item, index }) => {
    console.log("PHOTO URI >>>", item.uri);
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

  // 시각(분) 윈도우 판정: timeStart~timeEnd(분), 1440=24:00 처리 포함
  const inTimeWindow = (
    tsMs: string | number | Date,
    timeStart: number,
    timeEnd: number
  ) => {
    const local = new Date(tsMs);
    const mins = local.getHours() * 60 + local.getMinutes();
    if (timeEnd === 1440) return mins >= timeStart && mins <= 1439; // 24:00은 하루 끝까지
    if (timeEnd >= timeStart) return mins >= timeStart && mins <= timeEnd;
    // (필요시) 밤을 가르는 구간도 지원하려면 아래처럼:
    // return mins >= timeStart || mins <= timeEnd;
    return mins >= timeStart && mins <= timeEnd; // 기본: 정상 구간
  };

  const fmtDateTime = (ms: string | number | Date | null | undefined) => {
    if (!ms) return "Unknown";
    const d = new Date(ms);
    const yyyy = d.getFullYear();
    const MM = `${d.getMonth() + 1}`.padStart(2, "0");
    const DD = `${d.getDate()}`.padStart(2, "0");
    const hh = `${d.getHours()}`.padStart(2, "0");
    const mm = `${d.getMinutes()}`.padStart(2, "0");
    return `${yyyy}/${MM}/${DD} ${hh}:${mm}`;
  };

  const Header = useCallback(() => {
    const current = photos[viewerIndex];
    return (
      <View style={styles.header}>
        <Text style={styles.metaTxt}>
          {current ? fmtDateTime(current.takenAt) : ""}
        </Text>
        <TouchableOpacity onPress={closeViewer} style={styles.closeBtn}>
          <Text style={styles.closeTxt}>X</Text>
        </TouchableOpacity>
      </View>
    );
  }, [photos, viewerIndex]);

  const handleSelectionChange = (selections: LocationFilterState) => {
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

  const handleShowOnMap = () => {
    <View style={styles.mapContainer}>
      <ShowOnMap images={photos} />
    </View>
    console.log("Show on map, photos: ", photos.length);
  };


  return (
    <LinearGradient
    colors={['#E8F2FF', '#F9F3FF']} // 연한 하늘색 + 약간 보라 느낌
    style={styles.screen}
    >
    <SafeAreaView style={{ flex: 1 }} edges={["left", "right"]}>
      <View style={{ flex: 1 }}>
        <View style={styles.topArea}>

          {/* 상단버튼영역 */}
          <View style={styles.topButtonsRow}>

              {/* 슬라이드쇼 버튼 (파란 그라디언트) */}
              <TouchableOpacity
                onPress={() => (slideshowOn ? closeSlideshow() : handleSlideshow())}
                activeOpacity={0.9}
              >
                <LinearGradient
                  colors={['#2B7FFF', '#AD46FF']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.primaryButton}
                >
                  <SlideshowIcon width={16} height={16} style={{ marginRight: 8 }}/>
                  <Text style={styles.primaryButtonText}>Slideshow</Text>
                </LinearGradient>
              </TouchableOpacity>
      
              {/* Show on map 버튼 (화이트 카드) */}
              <View style={styles.secondaryButton}>
                <ShowonmapIcon width={16} height={16} style={{ marginRight: 8 }}/>
                <ShowOnMap images={photos} />
              </View>

              {/* 설정 아이콘 버튼 */}
              <TouchableOpacity
                onPress={handleOpenSettings}
                activeOpacity={0.7}
                style={styles.iconButton}
              >
                <Ionicons name="settings-outline" size={20} color="#374151" />
              </TouchableOpacity>
            </View>
            
          {/* 썸네일 그리드 */}
          <FlatList<Photo>
            style={{ flex: 1 }} // 리스트가 남은 세로 공간을 다 차지
            data={photos}
            numColumns={numColumns}
            keyExtractor={(_, i) => i.toString()}
            renderItem={renderItem}
            contentContainerStyle={{
              paddingHorizontal: horizontalPadding,
              padding: 8,
              backgroundColor: "#FFF",
              borderRadius: 10,
            }}
            onScrollBeginDrag={() => {
              setUserScrolled(true);
            }}
            onMomentumScrollBegin={() => {
              setUserScrolled(true);
              onEndDuringMomentumRef.current = false;
            }}
            onMomentumScrollEnd={() => {
              onEndDuringMomentumRef.current = true;
            }}
            onEndReachedThreshold={0.4}
            onEndReached={() => {
              // 1) 스크롤 시작 전이면 무시
              if (!userScrolled) return;
              // 2) 모멘텀 중 첫 호출만 허용
              if (onEndDuringMomentumRef.current) return;
              // 3) 이미 로딩 중/락이면 무시
              if (loading || onEndLockRef.current) return;
              // 4) 더 불러올 페이지 없으면 무시
              if (!hasNextPage) return;
              // ---- 페이지네이션 시작 ----
              onEndLockRef.current = true;
              onEndDuringMomentumRef.current = true; // 이번 모멘텀 사이클에서는 한 번만
              isPaginatingRef.current = true;

              loadPhotos({ reset: false }).finally(() => {
                onEndLockRef.current = false;
                isPaginatingRef.current = false;
              });
            }}
            ListFooterComponent={
              // 사용자가 스크롤해서 로딩하는 경우에만 표시(초기 자동 로딩 표시 억제)
              isPaginatingRef.current && loading ? (
                <ActivityIndicator style={{ marginVertical: 12 }} />
              ) : null
            }
            onLayout={({
              nativeEvent: {
                layout: { height: lh },
              },
            }) => {
              // 높이는 onContentSizeChange에서 비교
            }}
            onContentSizeChange={(_, ch) => {
              // 화면보다 컨텐츠가 클 때만 다음 페이지 로딩 허용
              setListCanScroll(ch > 0);
            }}
          />
        </View>
        <View style={styles.bottomArea}>
          <DateTimeFilter onChange={handleDateTimeChange} />
        </View>
      </View>
    
      {/* 전체화면 이미지 뷰어 (핀치줌/스와이프) */}
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
      />
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
              <Image
                source={{ uri: item.uri }}
                style={{ width: screenWidth, height: "100%" }}
                resizeMode="contain"
              />
            )}
          />

          {/* 닫기 버튼 */}
          <TouchableOpacity
            onPress={closeSlideshow}
            style={{ position: "absolute", top: 20, right: 16, padding: 10 }}
          >
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
        </SafeAreaView>
      </Modal>

      {loading || isScanning ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator />
          <Text style={{ marginTop: 8 }}>
            Loading photos… {progress.loaded}
            {progress.total ? ` / ${progress.total}` : ""}
          </Text>
          {progress.total ? (
            <View
              style={{
                width: 220,
                height: 6,
                backgroundColor: "#e5e7eb",
                marginTop: 8,
                borderRadius: 3,
              }}
            >
              <View
                style={{
                  width: `${(progress.loaded / progress.total) * 100}%`,
                  height: "100%",
                  backgroundColor: "#9ca3af",
                  borderRadius: 3,
                }}
              />
            </View>
          ) : null}
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
    </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: 20,
    ...Platform.select({
      ios: { paddingTop: 20 }, 
      android: { paddingTop: 50 },
    }),
  },
  main: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 24,
  },
  topArea: {
    flex: 1,              // 남은 공간 다 차지
    // 여기 안에서 썸네일 카드에 shadow, radius 등 주면 됨
    paddingBottom: 12,    // 밑 여백
  },
  bottomArea: {
    //paddingBottom: 15,    // 밑 여백
    ...Platform.select({
      ios: { paddingBottom: 10 }, 
      android: { paddingBottom: 20 },
    }),
    paddingTop: 8,
  },
  topButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    columnGap: 8, // ✅ 간격 보장
    marginBottom: 16,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  
  // 메인 파란 버튼
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    height: 40,
    borderRadius: 14,
    shadowColor: '#2563EB',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  // 흰색 보조 버튼
  secondaryButton: {
    flex: 1, // ✅ 남는 공간을 먹고
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  
  secondaryButtonText: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '600',
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
    shadowColor: '#000',
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
  counter: { color: "#fff", fontSize: 16, fontWeight: "600" },
  metaTxt: { color: "#fff", fontSize: 14, fontWeight: "600" },
  closeBtn: {
    zIndex: 999,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },
  closeTxt: { color: "#fff", fontSize: 18, fontWeight: "700" },
  thumbnailCard: {
    backgroundColor: '#FFFFFF',   // 내부 흰색
    borderRadius: 32,             // 모서리 둥글게
    padding: 12,
    marginTop: 12,
    // 살짝 떠 있는 느낌
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,                 // Android
  },

});
