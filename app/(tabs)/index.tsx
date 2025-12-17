import DateTimeFilter from "@/components/DateTimeFilter";
import ShowOnMap from "@/components/ShowOnMap";
import * as Location from "expo-location";
import * as MediaLibrary from "expo-media-library";
import { useCallback, useEffect, useMemo, useRef, useState, useLayoutEffect } from "react";
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
import ImageViewing from 'react-native-image-viewing';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from "@expo/vector-icons";
import { Link, Stack, useRouter, useNavigation } from 'expo-router';

import * as amplitude from '@amplitude/analytics-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import uuid from 'react-native-uuid';

// 설치 단위 가상 디바이스 ID 생성
const deviceId = uuid.v4() as string;

// Responsive image grid calculations
const screenWidth = Dimensions.get("window").width;
const minImageWidth = 100;
const imageMargin = 2;
const numColumns = Math.max(
  5,
  Math.floor(screenWidth / (minImageWidth + imageMargin * 2))
);
const imageWidth = Math.floor(
  (screenWidth - numColumns * imageMargin * 2) / numColumns
);

async function getAllImages() {
  let allAssets: MediaLibrary.Asset[] = [];
  let hasNextPage = true;
  let after: string | undefined = undefined;
  try {
    //while (hasNextPage) {
      const result = await MediaLibrary.getAssetsAsync({
        first: 30,
        mediaType: MediaLibrary.MediaType.photo,
        after,
      });

      allAssets = allAssets.concat(result.assets);
      hasNextPage = result.hasNextPage;
      after = result.endCursor;
    //}
  } catch (error) {
    console.error("Error fetching media library assets:", error);
    return { assets: [] };
  }

  return { assets: allAssets };
}

type DateTimeFilterState = {
  dateStart: Date;
  dateEnd: Date;
  timeStart: number;
  timeEnd: number;
};

/** ---------- HomeScreen ---------- */
export default function HomeScreen() {
	const router = useRouter();
	const navigation = useNavigation();
	
	useEffect(() => {
			navigation.setOptions({ headerShown: false });
		}, [navigation]);
	
	useEffect(() => {
		async function setupAmplitude() {
			// 앱 설치 단위 랜덤 고유 ID 생성
			let userId = await AsyncStorage.getItem('userId');
			if (!userId) {
				userId = uuid.v4() as string; // 랜덤 UUID 생성
				await AsyncStorage.setItem('userId', userId);
			}

			// SDK 초기화
			amplitude.init('3b48b6b041a40b99d4aa3c6b37bbcaad', undefined, {
				disableCookies: true,
				logLevel: amplitude.Types.LogLevel.Debug,
			});

			// Amplitude에 userId 설정
			amplitude.setUserId(userId);

			// 디바이스/앱 정보 user properties로 기록
			const identifyObj = new amplitude.Identify();
			identifyObj.set('deviceOS', Platform.OS);
			identifyObj.set('appVersion', '0.0.1'); // 업데이트 하기
			identifyObj.set('platform', Platform.OS);
			amplitude.identify(identifyObj);
			
			// 테스트 이벤트
//			amplitude.track('Home Screen Viewed');
		}

		setupAmplitude();
	}, []);
	
	// Amplitude 클릭 이벤트
 const handleDateClick = () => amplitude.track("Date_Clicked");
 const handleTimeClick = () => amplitude.track("Time_Clicked");
 const handleLocationClick = () => amplitude.track("Location_Clicked");
 const handleSlideClick = () => amplitude.track("Slide_Clicked");
 const handleShowOnMapClick = () => amplitude.track("Show_on_the_map");
 const handleSettingsClick = () => amplitude.track("Settings_Clicked");

  const [images, setImages] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [progress, setProgress] = useState<{ loaded: number; total: number | null }>({ loaded: 0, total: null });

  const colorScheme = useColorScheme();
  const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

  // ---- 사진 목록/페이지네이션 ----
  const [photos, setPhotos] = useState<Photo[]>([]); // 화면에 뿌릴 가공된 데이터 (필터 적용 후)
	const [photosAll, setPhotosAll] = useState<Photo[]>([]); // 필터 적용 전 전체 사진
  const [endCursor, setEndCursor] = useState<string | null>(null); // MediaLibrary가 돌려주는 다음 페이지 커서 문자열
  const [hasNextPage, setHasNextPage] = useState<boolean>(true); // 다음 페이지 있는지 여부
  const [loading, setLoading] = useState<boolean>(false);

  const [userScrolled, setUserScrolled] = useState(false);
  const [listCanScroll, setListCanScroll] = useState(false);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);

  // ImageViewing 에 넘길 images 배열 (형식: { uri: string }[])
  const viewerImages = useMemo(
    () => photos.map(p => ({ uri: p.uri })),
    [photos]
  );

  const lastEndCallRef = useRef(0);
  const onEndLockRef = useRef(false); // 연속 호출 잠금
  const onEndDuringMomentumRef = useRef(true); // 모멘텀 중 중복 호출 방지
  const isPaginatingRef = useRef(false);       // footer 로딩바 표시에만 사용

  // 날짜,시간 필터링 관련 ===> 컴포넌트로 분리하기!!
  const dayStartMs = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).getTime();
  const dayEndNextMs = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 0, 0, 0).getTime();

  const today = new Date();
  const oneMonthAgo = new Date(today.getFullYear(), today.getMonth() - 1, today.getDate());
  // const [dateStart, setDateStart] = useState(oneMonthAgo);
  // const [dateEnd, setDateEnd] = useState(today);
  // const [timeStart, setTimeStart] = useState(0);
  // const [timeEnd, setTimeEnd] = useState(1440);

  const [filter, setFilter] = useState<DateTimeFilterState>({
    dateStart: oneMonthAgo,
    dateEnd: new Date(),
    timeStart: 0,
    timeEnd: 1440,
  });

  async function imagesWithLocation(
    images: any[],
    opts?: { maxLookups?: number; precision?: number; delayMs?: number }
  ) {
    const maxLookups = opts?.maxLookups ?? 60;   // 한 번 로드에서 지오코딩 최대 호출 수
    const precision  = opts?.precision  ?? 2;    // 좌표 라운딩 자릿수(2 ≈ ~1km)
    const delayMs    = opts?.delayMs    ?? 150;  // 호출 간 지연(ms)
    const cache = new Map<string, { country: string | null; city: string | null }>();
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
          const [res] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lon });
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

  // ---- 권한 요청 ----
  const requestPermission = useCallback(async (): Promise<boolean> => {
    // iOS와 Android 공통 처리
    const { status, canAskAgain } = await MediaLibrary.getPermissionsAsync();
  
    if (status !== "granted" && canAskAgain) {
      const req = await MediaLibrary.requestPermissionsAsync(false);
      return req.status === "granted";
    }
  
    return status === "granted";
  }, []);
  

  const PAGE_SIZE = 50;

  const loadPhotos = useCallback(
    async ({ reset = false }: { reset?: boolean } = {}) => {
      const { dateStart, dateEnd, timeStart, timeEnd } = filter;
  
      // 1) 권한 확인
      const hasPerm = await requestPermission();
      if (!hasPerm) {
        Alert.alert('권한 필요', '사진 접근 권한이 필요합니다.');
        return;
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
				
				// 전체 사진 상태 업데이트 (필터링 전)
				setPhotosAll(prev => reset ? assets : [...prev, ...assets]);
  
        // 4) 날짜/시간 필터
        const filtered = assets.filter((a) => {
          const tsMs = a.creationTime ?? a.modificationTime ?? null;
          if (!tsMs) return false;
  
          if (tsMs < dayStartMs(dateStart) || tsMs >= dayEndNextMs(dateEnd)) {
            return false;
          }
  
          return inTimeWindow(tsMs, timeStart, timeEnd);
        });
  
        // 5) 상세 정보 + 위치 포함해서 Photo로 매핑
        const baseInfos: Photo[] = await Promise.all(
          filtered.map(async (a) => {
            try {
              const info = await MediaLibrary.getAssetInfoAsync(a.id);
              const uri =
                Platform.OS === "ios"
                  ? info.localUri ?? info.uri
                  : info.uri;
  
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
  
        // 6) 위치 정보 기반으로 country/city 붙이기
        const withPlaces = await imagesWithLocation(baseInfos, {
          maxLookups: 60,
          precision: 2,
          delayMs: 150,
        });
  
        // 7) 상태 업데이트
        setPhotos((prev) => (reset ? withPlaces : [...prev, ...withPlaces]));
        setEndCursor(result.endCursor ?? null);
        setHasNextPage(result.hasNextPage);
      } catch (err) {
        console.log('MediaLibrary 오류:', err);
        Alert.alert('오류', '사진을 불러오는 중 문제가 발생했습니다.');
      } finally {
        setLoading(false);
      }
    },
    [
      requestPermission,
      loading,
      hasNextPage,
      endCursor,
      filter,
    ]
  );
  
  useEffect(() => {

    // 필터 바뀌면 페이지네이션 리셋 후 처음부터 다시 로드
    setEndCursor(null);
    setHasNextPage(true);
    loadPhotos({ reset: true });

  }, [filter]); 

  type Photo = {
    uri: string;
    takenAt?: number | null;  // 있으면 쓰고, 아니면 빼도 됨

    //localUri: string;
    city?: string;
    country?: string;
    location?: {
      latitude: string | number;
      longitude: string | number;
    } | null;
  };

  // 썸네일 그리드에 사진 데이터 렌더링
  const renderItem: ListRenderItem<Photo> = ({ item, index }) => {
    console.log('PHOTO URI >>>', item.uri);
    return (
      <TouchableOpacity
      activeOpacity={0.9}
      onPress={() => { setViewerIndex(index); setViewerVisible(true); }}
    >
      {/* <Image source={{ uri: item.uri }} style={styles.thumb} /> */}
      <Image source={{ uri: item.uri }} style={{ width: 90, height: 90, margin: 2, borderRadius: 6 }} />
    </TouchableOpacity>
    )
  };

  // 시각(분) 윈도우 판정: timeStart~timeEnd(분), 1440=24:00 처리 포함
  const inTimeWindow = (tsMs: string | number | Date, timeStart: number, timeEnd: number) => {
    const local = new Date(tsMs);
    const mins = local.getHours() * 60 + local.getMinutes();
    if (timeEnd === 1440) return mins >= timeStart && mins <= 1439; // 24:00은 하루 끝까지
    if (timeEnd >= timeStart) return mins >= timeStart && mins <= timeEnd;
    // (필요시) 밤을 가르는 구간도 지원하려면 아래처럼:
    // return mins >= timeStart || mins <= timeEnd;
    return mins >= timeStart && mins <= timeEnd; // 기본: 정상 구간
  };

  const fmtDateTime = (ms: string | number | Date | null | undefined) => {
    if (!ms) return 'Unknown';
    const d = new Date(ms);
    const yyyy = d.getFullYear();
    const MM = `${d.getMonth()+1}`.padStart(2, '0');
    const DD = `${d.getDate()}`.padStart(2, '0');
    const hh = `${d.getHours()}`.padStart(2, '0');
    const mm = `${d.getMinutes()}`.padStart(2, '0');
    return `${yyyy}/${MM}/${DD} ${hh}:${mm}`;
  };

  const viewerStyles = StyleSheet.create({
    header: {
      position: 'absolute',
      top: 44,                // 노치 고려해서 여백
      left: 16,
      right: 16,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    counter: { color: '#fff', fontSize: 16, fontWeight: '600' },
    metaTxt: { color: '#fff', fontSize: 14, fontWeight: '600' },
    closeBtn: {
      zIndex: 999,
      width: 32, height: 32, borderRadius: 16,
      backgroundColor: 'rgba(255,255,255,0.16)',
      alignItems: 'center', justifyContent: 'center',
    },
    closeTxt: { color: '#fff', fontSize: 18, fontWeight: '700' },
  });

  const Header = useCallback(() => {
    const current = photos[viewerIndex];
    return (
      <View style={viewerStyles.header}>
        <Text style={viewerStyles.metaTxt}>
          {current ? fmtDateTime(current.takenAt) : ''}
        </Text>
        <TouchableOpacity
          onPress={() => setViewerVisible(false)}
          style={viewerStyles.closeBtn}
        >
          <Text style={viewerStyles.closeTxt}>✕</Text>
        </TouchableOpacity>
      </View>
    );
  }, [photos, viewerIndex]);  

	// 사용자 데이터 AsyncStorage 저장
	useEffect(() => {
		async function saveUserData() {
			// 1) 앱 시작일 가져오기
			const startDateIso = await AsyncStorage.getItem('appStartDate') ?? new Date().toISOString();
			const startDate = startDateIso.split('T')[0];
			await AsyncStorage.setItem('appStartDate', startDate);
			
			// 2) 위치 검색 횟수 가져오기
			const locationSearchCount = parseInt((await AsyncStorage.getItem('locationSearchCount')) || '0', 10);

			// 3) 필터 적용된 시간 검색 횟수 계산 (photosAll 기반)
			const filteredTimeCount = photosAll.filter(p => {
				if (!p.takenAt) return false;

				// 날짜 필터 적용
				if (p.takenAt < dayStartMs(filter.dateStart) || p.takenAt >= dayEndNextMs(filter.dateEnd)) return false;

				// 시간 필터 적용
				return inTimeWindow(p.takenAt, filter.timeStart, filter.timeEnd);
			}).length;

			// 4) 전체 사진 개수 (필터링 전)
			const totalPhotos = photosAll.length;

			// 5) AsyncStorage에 저장
			const userData = { startDate, timeSearchCount: filteredTimeCount, locationSearchCount, totalPhotos };
			await AsyncStorage.setItem('userData', JSON.stringify(userData));
			
			setUserData(userData);
		}

		saveUserData();
	}, [photosAll, filter]);
	
  return (

    <SafeAreaView style={{ flex: 1, paddingTop: 48 }}>
			{/* 상단 Settings 버튼 */}
			<View style={styles.header}>
					<TouchableOpacity onPress={() => router.push('/settings')} style={{ marginRight: 15 }}>
						<Ionicons name="settings-outline" size={28} color="black" />
					</TouchableOpacity>
			</View>
      {/* 지도에서 보기 */}
      <View style={styles.mapContainer}>
        {/* <ShowOnMap images={images} /> */}
        <ShowOnMap images={photos} />
      </View>

      {/* 날짜/시간으로 필터링 모듈 Start 
          - 유저가 조작한 값을 모듈에서 받은 후 Prop으로 메인 소스에 넘겨 갱신한다.
      */}
        <DateTimeFilter
						onChange={setFilter}
						onDateClick={handleDateClick}   // DatePicker 클릭 시
						onTimeClick={handleTimeClick}   // TimePicker 클릭 시
						onLocationClick={handleLocationClick}
				/>
      {/* 날짜/시간으로 필터링 모듈 End */}

      {/* 썸네일 그리드 */}
      <FlatList<Photo>
        style={{ flex: 1 }} // 리스트가 남은 세로 공간을 다 차지
        data={photos}
        numColumns={numColumns}
        keyExtractor={(_, i) => i.toString()}
        renderItem={renderItem}
        contentContainerStyle={{ padding: 4 }}
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
          (isPaginatingRef.current && loading) ? <ActivityIndicator style={{ marginVertical: 12 }} /> : null
        }

        onLayout={({nativeEvent:{layout:{height: lh}}}) => {
          // 높이는 onContentSizeChange에서 비교
        }}
        
        onContentSizeChange={(_, ch) => {
          // 화면보다 컨텐츠가 클 때만 다음 페이지 로딩 허용
          setListCanScroll(ch > 0);
        }}
      />

      {/* 전체화면 이미지 뷰어 (핀치줌/스와이프) */}
      <ImageViewing
        //images={photos.map(p => ({ uri: p.uri }))}
        images={viewerImages}
        imageIndex={viewerIndex}
        visible={viewerVisible}
        onRequestClose={() => setViewerVisible(false)}
        onImageIndexChange={(i: number) => setViewerIndex(i)}  // ← 추가
        // 선택: 상단 닫기버튼(간단한 헤더)
        HeaderComponent={Header}
        // 선택: 바닥 여백(제스처 충돌 완화)
        backgroundColor="rgba(0,0,0,0.98)"
        swipeToCloseEnabled={false}   // ← 스와이프 제스처가 터치 선점하는 것 방지
        doubleTapToZoomEnabled
      />

      {(loading || isScanning) ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator />
          <Text style={{ marginTop: 8 }}>
            Loading photos… {progress.loaded}{progress.total ? ` / ${progress.total}` : ""}
          </Text>
          {progress.total ? (
            <View style={{ width: 220, height: 6, backgroundColor: "#e5e7eb", marginTop: 8, borderRadius: 3 }}>
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
      )
    }
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
			flexDirection: "row",
			justifyContent: "flex-end",
			alignItems: "center",
			paddingHorizontal: 15,
			height: 48,
		},
});
