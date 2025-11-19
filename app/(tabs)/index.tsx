//import ParallaxScrollView from "@/components/ParallaxScrollView";
import DateTimeFilter from "@/components/DateTimeFilter";
import ShowOnMap from "@/components/ShowOnMap";
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
  PermissionsAndroid,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  useColorScheme,
  View,
} from "react-native";
import ImageViewing from 'react-native-image-viewing';
import { SafeAreaView } from 'react-native-safe-area-context';

// const [progress, setProgress] = useState<{loaded:number; total:number|null}>({ loaded: 0, total: null });
// const [isScanning, setIsScanning] = useState(false);


// Responsive image grid calculations
const screenWidth = Dimensions.get("window").width;
const minImageWidth = 100;
const horizontalPadding = 4;
const imageMargin = 2;
const usableWidth = screenWidth - horizontalPadding * 2;
const numColumns = Math.max(
  5,
  Math.floor(usableWidth / (minImageWidth + imageMargin * 2))
);
const imageWidth = (usableWidth - numColumns * imageMargin * 2) / numColumns;

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

  const [images, setImages] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [progress, setProgress] = useState<{ loaded: number; total: number | null }>({ loaded: 0, total: null });

  const colorScheme = useColorScheme();
  const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

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
    if (Platform.OS === 'android') {
      // SDK33+ READ_MEDIA_IMAGES, 그 이하 READ_EXTERNAL_STORAGE
      const perm =
        Platform.Version >= 33
          ? PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES
          : PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE;

      const granted = await PermissionsAndroid.request(perm);
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    }
    // iOS는 getPhotos 호출시 시스템 권한 플로우
    return true;
  }, []);

  const PAGE_SIZE = 50;

  /* const loadPhotos = useCallback(
    async ({ reset = false }: { reset?: boolean } = {}) => {

      const { dateStart, dateEnd, timeStart, timeEnd } = filter;

      // 1) 권한 확인
      const hasPerm = await requestPermission();
      if (!hasPerm) {
        Alert.alert('권한 필요', '사진 접근 권한이 필요합니다.');
        return;
      }
  
      // 2) 중복 호출 방지 / 다음 페이지 없으면 종료
      if (loading) return;
      if (!reset && !hasNextPage) return;
  
      setLoading(true);
  
      try {
        // 3) MediaLibrary에서 한 페이지 가져오기
        const result = await MediaLibrary.getAssetsAsync({
          first: PAGE_SIZE,
          mediaType: MediaLibrary.MediaType.photo,
          // reset이면 처음부터, 아니면 이전 endCursor 이후부터
          after: reset ? undefined : endCursor ?? undefined,
          // 정렬 옵션은 필요하면 추가 (최신순 등)
          sortBy: [MediaLibrary.SortBy.creationTime],
        });
  
        const assets = result.assets ?? [];
  
        // 4) 날짜 + 시간 필터 적용
        const filtered = assets.filter((a) => {
          const tsMs = a.creationTime ?? a.modificationTime ?? null;
          if (!tsMs) return false;
  
          // 날짜 범위
          if (tsMs < dayStartMs(dateStart) || tsMs >= dayEndNextMs(dateEnd)) {
            return false;
          }
  
          // 시간대 범위 (이미 만들었던 함수)
          return inTimeWindow(tsMs, timeStart, timeEnd);
        });

        // ❗ iOS에서는 localUri를 가져온다
        const infos: Photo[] = await Promise.all(
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
              };
            } catch (e) {
              // 실패 시에도 최소한 죽지 않게 fallback
              return {
                uri: a.uri,
                takenAt: a.creationTime ?? null,
              };
            }
          })
        );
        
        // 최종적으로 photos에는 infos를 넣어야 함
        setPhotos((prev) => (reset ? infos : [...prev, ...infos]));
  
        // 5) 화면용 데이터로 매핑
        // const mapped: Photo[] = filtered.map((a) => ({
        //   uri: a.uri,
        //   takenAt: a.creationTime ?? null,
        // }));
  
        // 6) reset이면 갈아끼우고, 아니면 뒤에 이어 붙이기
        //setPhotos((prev) => (reset ? mapped : [...prev, ...mapped]));
  
        // 7) 다음 페이지 정보 업데이트
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
      filter
    ]
  );*/

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
    // const loadImages = async () => {
    //   try {

    //     const { status } = await (MediaLibrary.requestPermissionsAsync as any)(
    //       false,
    //       ["photo"]
    //     );

    //     if (status !== "granted") {
    //       setError("Permission denied to access media library");
    //       Alert.alert(
    //         "Permission Required",
    //         "Please grant permission to access photos"
    //       );
    //       setLoading(false);
    //       return;
    //     }

    //     if (Platform.OS === "android") {
    //       const { status } = await Location.requestForegroundPermissionsAsync();
    //       if (status !== "granted") {
    //         console.warn("Android location permission denied");
    //         setError("Android location permission denied");
    //       }
    //     }

    //     const assets = await getAllImages();
    //     if (assets.assets.length === 0) {
    //       setError("No images found in media library");
    //       setLoading(false);
    //       return;
    //     }

    //     // Get detailed info for each asset
    //     const assetInfos = await Promise.all(
    //       assets.assets.map(async (asset) => {
    //         try {
    //           const info = await MediaLibrary.getAssetInfoAsync(asset.id);
    //           const imageUri =
    //             Platform.OS === "ios" ? info.localUri ?? info.uri : info.uri;
    //           return { ...info, imageUri: imageUri };
    //         } catch (err) {
    //           console.error("Error getting asset info:", err);
    //           return asset;
    //         }
    //       })
    //     );
    //     const imagesWithLocations = await imagesWithLocation(assetInfos);
    //     setImages(imagesWithLocations);
    //   } catch (err) {
    //     console.error("Error loading images:", err);
    //   } finally {
    //     setLoading(false);
    //   }
    // };



    /* const loadImages = async () => {
      try {
        //setLoading(true);
        setIsScanning(true);
    
        // 권한: 올바른 시그니처로 수정
        let perm = await MediaLibrary.getPermissionsAsync();
        if (perm.status !== "granted" && perm.canAskAgain) {
          const perm = await (MediaLibrary.requestPermissionsAsync as any)({ writeOnly: false });
        }
        if (perm.status !== "granted") {
          setError("Permission denied to access media library");
          Alert.alert("Permission Required", "Please grant permission to access photos");
          return;
        }
    
        if (Platform.OS === "android") {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status !== "granted") {
            console.warn("Android location permission denied");
            setError("Android location permission denied");
          }
        }
    
        const assets = await getAllImages();
        if (assets.assets.length === 0) {
          setError("No images found in media library");
          return;
        }
    
        // 진행률 계산 대상 총 개수
        const total = assets.assets.length;
        setProgress({ loaded: 0, total });
    
        // 상세 메타(URI 등) 순차 처리 + 진행률 반영
        const assetInfos: any[] = [];
        for (let i = 0; i < total; i++) {
          const asset = assets.assets[i];
          try {
            const info = await MediaLibrary.getAssetInfoAsync(asset.id);
            const imageUri = Platform.OS === "ios" ? info.localUri ?? info.uri : info.uri;
            assetInfos.push({ ...info, imageUri });
          } catch (err) {
            console.error("Error getting asset info:", err);
            assetInfos.push(asset);
          }
          setProgress({ loaded: i + 1, total });
    
          // 초기 표시 가속: 24개 단위로 한 번씩 화면에 반영 (원치 않으면 제거)
          if ((i + 1) % 24 === 0 && i + 1 < total) {
            setImages(assetInfos.slice());
          }
        }
    
        //const imagesWithLocations = await imagesWithLocation(assetInfos);
        const imagesWithLocations = await imagesWithLocation(assetInfos, { maxLookups: 60, precision: 2, delayMs: 150 });

        setImages(imagesWithLocations);
      } catch (err) {
        console.error("Error loading images:", err);
        setError("Failed to load photos");
      } finally {
        setIsScanning(false);
        //setLoading(false);
      }
    }; */
    
    //loadImages();

    // 필터 바뀌면 페이지네이션 리셋 후 처음부터 다시 로드
    setEndCursor(null);
    setHasNextPage(true);
    loadPhotos({ reset: true });

  }, [filter]); //, loadPhotos]);

  // async function imagesWithLocation(images: any[]) {
  //   const updated = await Promise.all(
  //     images.map(async (img) => {
  //       if (!img.location) {
  //         return { ...img, country: null, city: null };
  //       }

  //       const [place] = await Location.reverseGeocodeAsync({
  //         latitude: Number(img.location?.latitude),
  //         longitude: Number(img.location?.longitude),
  //       });
  //       return {
  //         ...img,
  //         country: place?.country ?? null,
  //         city: place?.city ?? place?.subregion ?? null,
  //       };
  //     })
  //   );
  //   return updated;
  // }

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
        style={styles.imageContainer}
        activeOpacity={0.9}
        onPress={() => { setViewerIndex(index); setViewerVisible(true); }}
      >
        {/* <Image source={{ uri: item.uri }} style={styles.thumb} /> */}
        <Image 
          source={{ uri: item.uri }} 
          style={styles.image} 
          resizeMode="cover"
        />
      </TouchableOpacity>
    )
  };


  /* async function getAllImagesFromUser(): Promise<MediaLibrary.Asset[]> {

    let allAssets: MediaLibrary.Asset[] = [];
    let hasNextPage = true;
    let after: string | undefined = undefined;

    try {
      while (hasNextPage) {
        const result = await MediaLibrary.getAssetsAsync({
          first: 100,
          mediaType: MediaLibrary.MediaType.photo,
          after,
        });
  
        allAssets = allAssets.concat(result.assets);
        hasNextPage = result.hasNextPage;
        after = result.endCursor;
      }
    } catch (error) {
      console.error("Error fetching media library assets:", error);
      return [];
    }
  
    return allAssets;
  } */

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



  /* const loadPhotos = useCallback(async ({ reset = false } = {}) => {

    const hasPerm = await requestPermission();
    if (!hasPerm) {
      Alert.alert('권한 필요', '사진 접근 권한이 필요합니다.');
      return;
    }

    if (loading) return;
    setLoading(true);

    try {
      // 1) 최초 로딩 시 한달전 데이타부터 표출
      const params = {
        first: 60,
        assetType: 'Photos',
        fromTime: dayStartMs(dateStart), // 기본: 한달전
        toTime:   dayEndNextMs(dateEnd), // 기본: 오늘
        after: endCursor ?? undefined,  // ← 이전에 받은 cursor (string | null)
      };
      if (!reset && endCursor) params.after = endCursor;

      //const result = await CameraRoll.getPhotos(params);
      //const nextEdges = result.edges ?? [];
      const assets = await getAllImagesFromUser();
      const nextEdges = assets ?? [];

      const filtered = nextEdges.filter((e) => {
        // 카메라롤 라이브러리 사용시 e.node로 접근
        const tsMs = e.creationTime ? Math.round(e.creationTime * 1000) : null;
        if (!tsMs) return false;
        // 
        if (tsMs < dayStartMs(dateStart) || tsMs >= dayEndNextMs(dateEnd)) return false;
        return inTimeWindow(tsMs, timeStart, timeEnd);
      });

      const mapped = filtered.map((e) => ({
        uri: e.uri,
        takenAt: e?.creationTime ? Math.round(e.creationTime * 1000) : null,
      }));

      setPhotos((prev) => (reset ? mapped : [...prev, ...mapped]));
      setEndCursor(assets);
      setHasNextPage(Boolean(result.page_info?.has_next_page));
      
    } catch (err) {
      console.log('CameraRoll 오류:', err);
      Alert.alert('오류', '사진을 불러오는 중 문제가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }, [requestPermission, loading, endCursor, dateStart, dateEnd, timeStart, timeEnd]); */

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

  return (

    <SafeAreaView style={{ flex: 1, paddingTop: 48 }}>

      {/* 지도에서 보기 */}
      <View style={styles.mapContainer}>
        {/* <ShowOnMap images={images} /> */}
        <ShowOnMap images={photos} />
      </View>

      {/* 날짜/시간으로 필터링 모듈 Start 
          - 유저가 조작한 값을 모듈에서 받은 후 Prop으로 메인 소스에 넘겨 갱신한다.
      */}
        <DateTimeFilter onChange={setFilter} />
      {/* 날짜/시간으로 필터링 모듈 End */}

      {/* 썸네일 그리드 */}
      <FlatList<Photo>
        style={{ flex: 1 }} // 리스트가 남은 세로 공간을 다 차지
        data={photos}
        numColumns={numColumns}
        keyExtractor={(_, i) => i.toString()}
        renderItem={renderItem}
        contentContainerStyle={{ 
          paddingHorizontal: horizontalPadding,
          paddingTop: 4,
          paddingBottom: 16,
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
          //loading ? <ActivityIndicator style={{ marginVertical: 12 }} /> : null
          // 사용자가 스크롤해서 로딩하는 경우에만 표시(초기 자동 로딩 표시 억제)
          //userScrolled && loading ? <ActivityIndicator style={{ marginVertical: 12 }} /> : null
          (isPaginatingRef.current && loading) ? <ActivityIndicator style={{ marginVertical: 12 }} /> : null
        }

        onLayout={({nativeEvent:{layout:{height: lh}}}) => {
          // 높이는 onContentSizeChange에서 비교
        }}
        
        onContentSizeChange={(_, ch) => {
          // ch: contentHeight
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

      {/* {loading ? (
        <View style={styles.centerContainer}>
          <Text>June: Loading images......,,,</Text>
        </View> */}
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
    height: imageWidth,
    borderRadius: 6,
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
});
