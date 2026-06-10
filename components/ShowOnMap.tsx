import { useLanguage } from "@/components/context/LanguageContext";
import { TRANSLATIONS } from "@/constants/Translations";
import PhotoDetailViewer from "@/components/PhotoDetailViewer";
import * as amplitude from "@amplitude/analytics-react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import IconMapPin from "@/assets/icons/ic_map_pin.svg";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import * as MediaLibrary from "expo-media-library";
/* 2026.05.26 마커 썸네일을 WebView에 임베드하기 위해 사진을 작은 크기로 리사이즈 + base64 인코딩하는 모듈 by yen */
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import Share from "react-native-share";

type Photo = {
  uri: string;
  assetId?: string;
  takenAt?: number | null; // 있으면 쓰고, 아니면 빼도 됨

  //localUri: string;
  city?: string;
  country?: string;
  location?: {
    latitude: string | number;
    longitude: string | number;
  } | null; // 데이터 없는 경우를 위해 null 추가
};
type Props = {
  //images: Image[];
  images: Photo[];
  onOpenRequest?: () => void | Promise<void>;
  preparingLocations?: boolean;
  preparingMessage?: string;
  onOpenPhotoFromMap?: (payload: {
    sourceUri: string;
    city?: string;
    country?: string;
  }) => void;
};

/* 2026.05.12 이미지 로드 실패 시에도 좌표 마커는 유지하기 위해 공통 placeholder 이미지를 정의 by June
   2026.05.26 컴포넌트 외부로 이동해 useEffect 의존성 경고를 제거 by yen */
const FALLBACK_MARKER_URI =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' width='80' height='80'><rect width='100%' height='100%' rx='16' ry='16' fill='#EEF2FF'/><circle cx='40' cy='40' r='14' fill='#6366F1'/></svg>"
  );

/* 2026.05.27 ph:// URI 변형(/L0/001, query)을 안전하게 정규화해 마커/상세 로딩에서 동일 assetId를 쓰도록 보강 by June */
const getAssetIdFromPhUri = (uri: string): string | null => {
  if (!uri?.startsWith("ph://")) return null;
  const raw = uri.slice("ph://".length);
  const withoutQuery = raw.split("?")[0];
  const normalized = withoutQuery.split("/")[0];
  return normalized || null;
};

export default function MapView({
  images,
  onOpenRequest,
  preparingLocations = false,
  preparingMessage,
  onOpenPhotoFromMap,
}: Props) {
  const { language } = useLanguage();
  const [visible, setVisible] = useState(false);
  const [detailVisible, setDetailVisible] = useState(false);
  const [detailUri, setDetailUri] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailPlace, setDetailPlace] = useState<string>("");
  const [detailTakenAt, setDetailTakenAt] = useState<number | null>(null);
  const [detailSourceUri, setDetailSourceUri] = useState<string | null>(null);
  // 2026-03-18 get proper coordinates by yen
  const [coordinates, setCoordinates] = useState<any[]>([]); // store base64 coords
  const [loading, setLoading] = useState(false);
  /* 2026.05.28 지도 좌표 로딩과 마커 썸네일 변환 상태를 분리해 썸네일 준비 중 안내가 누락되지 않도록 추가 by June */
  const [thumbnailLoading, setThumbnailLoading] = useState(false);
  const [coordinatesReady, setCoordinatesReady] = useState(false);
  /* 2026.04.15 동일 이미지 입력에서 좌표 재계산/재설정 루프를 막기 위해 마지막 처리 시그니처를 저장 by June */
  const lastImagesSigRef = useRef<string>("");
  /* 2026.05.26 sourceUri별로 변환된 markerUri를 캐싱해 모달 재오픈/리렌더 시 재인코딩 비용을 제거 by yen */
  const markerCacheRef = useRef<Map<string, string>>(new Map());

  const isFallbackMarker = (markerUri: string | undefined) =>
    !markerUri || markerUri === FALLBACK_MARKER_URI;

  const updateCoordinatesIfChanged = (next: any[]) => {
    setCoordinates((prev) => {
      const prevByUri = new Map(prev.map((coord) => [coord.sourceUri, coord]));
      /* 2026.05.28 지도 재진입 시 placeholder 선표시가 이미 완성된 썸네일을 덮어쓰지 않도록 기존 markerUri를 보존 by June */
      const merged = next.map((coord) => {
        const prevCoord = prevByUri.get(coord.sourceUri);
        if (
          prevCoord &&
          !isFallbackMarker(prevCoord.markerUri) &&
          isFallbackMarker(coord.markerUri)
        ) {
          return { ...coord, markerUri: prevCoord.markerUri };
        }
        return coord;
      });
      const prevSig = JSON.stringify(prev);
      const nextSig = JSON.stringify(merged);
      if (prevSig === nextSig) return prev;
      return merged;
    });
  };

  /* 2026.04.15 이미지 값 기준 시그니처를 만들어 부모 리렌더 시 불필요한 좌표 로딩을 건너뛰기 위해 추가 by June */
  const imagesSignature = useMemo(() => {
    return images
      .map((img) => {
        const lat = img.location ? Number(img.location.latitude) : "";
        const lng = img.location ? Number(img.location.longitude) : "";
        return `${img.uri}|${lat}|${lng}`;
      })
      .join("||");
  }, [images]);

  useEffect(() => {
    /* 2026.05.26 모달이 열릴 때까지 비용이 큰 썸네일 인코딩을 지연시켜 초기 렌더 비용을 제거 by yen */
    if (!visible) return;
    const hasPendingThumbnails = coordinates.some(
      (coord) => coord?.markerUri === FALLBACK_MARKER_URI,
    );
    /* 2026.05.28 좌표만 있고 썸네일은 placeholder인 상태에서는 같은 signature라도 재시도해 마커 이미지 공백을 줄이기 위해 완화 by June */
    if (
      lastImagesSigRef.current === imagesSignature &&
      coordinates.length > 0 &&
      !hasPendingThumbnails
    ) {
      setCoordinatesReady(true);
      setLoading(false);
      setThumbnailLoading(false);
      return;
    }
    lastImagesSigRef.current = imagesSignature;

    let cancelled = false;

    const loadCoordinates = async () => {
      setLoading(true);
      setThumbnailLoading(false);
      setCoordinatesReady(false);
      try {
        /* 2026.05.28 좌표는 썸네일 변환을 기다리지 않고 placeholder로 먼저 세팅해 지도 마커를 안정적으로 선표시 by June */
        const baseCoordinates = images
          .filter((img) => img.location)
          .map((img) => {
            const latitude = Number(img.location!.latitude);
            const longitude = Number(img.location!.longitude);
            if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
              return null;
            }
            const sourceUri = String(img.uri ?? "");
            const existingMarkerUri = coordinates.find(
              (coord) => coord.sourceUri === sourceUri,
            )?.markerUri;

            return {
              markerUri:
                (!isFallbackMarker(existingMarkerUri) && existingMarkerUri) ||
                markerCacheRef.current.get(sourceUri) ||
                FALLBACK_MARKER_URI,
              sourceUri,
              latitude,
              longitude,
              city: img.city,
              country: img.country,
              takenAt: img.takenAt ?? null,
            };
          })
          .filter(Boolean);

        if (cancelled) return;

        updateCoordinatesIfChanged(baseCoordinates);
        setCoordinatesReady(true);
        setLoading(false);
        setThumbnailLoading(
          baseCoordinates.some((coord: any) => isFallbackMarker(coord?.markerUri)),
        );

        const settled = await Promise.allSettled(
          images
            .filter((img) => img.location)
            .map(async (img) => {
              const latitude = Number(img.location!.latitude);
              const longitude = Number(img.location!.longitude);
              if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
                return null;
              }

              const sourceUri = String(img.uri ?? "");
              let markerUri = FALLBACK_MARKER_URI;

              /* 2026.05.26 인라인 HTML WebView는 file:// 리소스를 직접 로드할 수 없으므로
                 마커용으로 사진을 썸네일 크기로 리사이즈한 뒤 base64 data URI로 변환 by yen */
              const cached = markerCacheRef.current.get(sourceUri);
              if (cached) {
                markerUri = cached;
              } else {
                let localFileUri = "";
                if (sourceUri.startsWith("file://")) {
                  localFileUri = sourceUri;
                } else if (sourceUri.startsWith("ph://")) {
                  try {
                    const assetId = img.assetId ?? getAssetIdFromPhUri(sourceUri);
                    if (assetId) {
                      const info = await MediaLibrary.getAssetInfoAsync(assetId);
                      const resolved = info?.localUri ?? info?.uri ?? "";
                      if (typeof resolved === "string" && resolved.startsWith("file://")) {
                        localFileUri = resolved;
                      }
                    }
                  } catch {
                    localFileUri = "";
                  }
                }

                if (localFileUri) {
                  try {
                    /* 마커 프레임은 80×80이므로 retina 대비 160으로만 리사이즈해 페이로드를 수십~수백배 축소 */
                    const result = await manipulateAsync(
                      localFileUri,
                      [{ resize: { width: 160 } }],
                      { compress: 0.6, format: SaveFormat.JPEG, base64: true }
                    );
                    if (result.base64) {
                      markerUri = `data:image/jpeg;base64,${result.base64}`;
                      markerCacheRef.current.set(sourceUri, markerUri);
                    }
                  } catch {
                    markerUri = FALLBACK_MARKER_URI;
                  }
                }
              }

              return {
                markerUri,
                sourceUri,
                latitude,
                longitude,
                city: img.city,
                country: img.country,
                takenAt: img.takenAt ?? null,
              };
            }),
        );

        if (cancelled) return;

        const coords = settled
          .filter(
            (r): r is PromiseFulfilledResult<any> =>
              r.status === "fulfilled" && !!r.value
          )
          .map((r) => r.value);
        updateCoordinatesIfChanged(coords.filter(Boolean));
      } catch (e) {
        console.error("Failed to load marker thumbnails", e);
      } finally {
        if (!cancelled) {
          setCoordinatesReady(true);
          setLoading(false);
          setThumbnailLoading(false);
        }
      }
    };

    loadCoordinates();

    return () => {
      cancelled = true;
    };
  }, [visible, imagesSignature, images]);
  // Pass coordinates to WebView as JSON
  const coordJSON = JSON.stringify(coordinates);
  const coordSignature = useMemo(
    () =>
      coordinates
        .map((c) => `${c.sourceUri}|${c.latitude}|${c.longitude}|${c.markerUri}`)
        .join("||"),
    [coordinates],
  );

  const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
        <style>
          html, body { margin:0; height:100%; }
          #map { height:100%; width:100%; }
          .leaflet-top.leaflet-left {
            top: 4%;
            left: 2%;
        }
            // 2026-03-18 custom marker style by yen
            .custom-marker {
              display: flex !important;
                  flex-direction: column !important;
                  align-items: center !important;
                  width: 80px !important;
                  height: 140px !important;
                  background: transparent !important;
              }
              .custom-marker .photo-frame {
              width: 80px !important;
                  height: 80px !important;
                  background: linear-gradient(135deg, #4facfe, #a855f7) !important;
                  padding: 6px !important;
                  border-radius: 20px !important;
                  box-sizing: border-box !important;
                  overflow: hidden !important;
              }
              .custom-marker .photo-frame img {
              width: 100% !important;
                  height: 100% !important;
                  object-fit: cover !important;
                  border-radius: 15px !important;
                  display: block !important;
              }
              .connector-line {
                width: 1px;
                height: 30px;
                background: #a855f7;
                margin: 0 auto !important;
              }
              .target-container {
                position: relative; /* CRITICAL: Creates positioning context */
                width: 40px;        /* Total width including white ring */
                height: 40px;       /* Total height */
                margin: 0 auto;    /* Centers it horizontally if needed */
                display: flex;
                align-items: center;
                justify-content: center;
                
                /* Slight drop shadow to pop from the background */
                box-shadow: 0 4px 10px rgba(0,0,0,0.1); 
                border-radius: 50%;
              }
              /* 2. The crosshair lines (transparent purple, overlapping) */
              .line {
                position: absolute;
                background-color: #8a2be2;
                opacity: 0.5; /* Transparent purple */
                z-index: 10;
              }
              .horizontal {
                width: 100%; /* Spans the container */
                height: 1px;  /* Thin lines */
              }
              .vertical {
                width: 1px;
                height: 100%; /* Spans the container */
              }
              /* 3. The nested circles (The Target) */
              .circle {
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
              }
              .outer {
                width: 32px; /* Inner circle size (white) */
                height: 32px;
                background-color: white;
                z-index: 1; /* Puts target above the lines */
              }
              .middle-gradient {
                width: 22px; /* Middle ring (main purple) */
                height: 22px;
                background: linear-gradient(135deg, #4facfe 0%, #8a2be2 100%);
              }
              .middle-white {
                width: 16px; /* Middle ring (white) */
                height: 16px;
                background-color: white;
              }
              .inner {
                width: 8px; /* Inner point (white) */
                height: 8px;
                background: linear-gradient(135deg, #4facfe 0%, #8a2be2 100%);
              }
        
        </style>
      </head>
      <body>
        <div id="map"></div>
        <script>
          const coordinates = ${coordJSON};

          // Initialize map centered at first photo or world
          const map = L.map('map').setView(
            coordinates[0] ? [coordinates[0].latitude, coordinates[0].longitude] : [0,0], 
            coordinates[0] ? 5 : 2
          );

          // 2026-03-18 CartoDB Voyager tiles (more colorful, works on both iOS and Android)
          L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
            maxZoom: 19,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
            subdomains: 'abcd'
          }).addTo(map);

          // Add markers
          coordinates.forEach((c, i) => {
          // 2026-03-18 custom marker HTML by yen
            const iconHtml = '<div class="custom-marker">' +
              '<div class="photo-frame">' +
                '<img src="' + c.markerUri + '">' +
              '</div>' +
              '<div class="connector-line"></div>' +
              '<div class="target-container">' +
                '<div class="line horizontal"></div>' +
                '<div class="line vertical"></div>' +
                '<div class="circle outer">' +
                  '<div class="circle middle-gradient">' +
                    '<div class="circle middle-white">' +
                    '<div class="circle inner"></div>' +
                  '</div>'+
                  '</div>'+
                '</div>'+
              '</div>'+
            '</div>';
            const customIcon = L.divIcon({
              html: iconHtml,
              className: 'custom-marker',
              iconSize: [80, 120],
              iconAnchor: [40, 120]
            });
          L.marker([c.latitude, c.longitude], { icon: customIcon })
              .addTo(map)
              .on('click', () => {
                // Send message to React Native
                window.ReactNativeWebView.postMessage(JSON.stringify({
                  type: 'marker_click',
                  sourceUri: c.sourceUri,
                  city: c.city,
                  country: c.country,
                  takenAt: c.takenAt ?? null
                }));
              });
          });

          // Fit all markers
          if (coordinates.length > 0) {
            const group = L.featureGroup(coordinates.map(c => L.marker([c.latitude, c.longitude])));
            map.fitBounds(group.getBounds().pad(0.2));
          }
        </script>
      </body>
      </html>
    `;

  // 웹뷰에서 메시지 받기, Amplitude 이벤트
  const handleMessage = (event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === "marker_click") {
        amplitude.track("Location_Clicked", {
          uri: data.sourceUri,
          city: data.city,
          country: data.country,
        });
        const sourceUri = String(data.sourceUri ?? "");
        setDetailPlace([data.city, data.country].filter(Boolean).join(", "));
        setDetailTakenAt(
          typeof data.takenAt === "number" && Number.isFinite(data.takenAt)
            ? data.takenAt
            : null
        );
        setDetailSourceUri(sourceUri);
        setDetailVisible(true);
        setDetailLoading(true);
        setDetailUri(null);

        void (async () => {
          try {
            if (sourceUri.startsWith("ph://")) {
              const assetId = getAssetIdFromPhUri(sourceUri);
              if (!assetId) throw new Error("invalid ph uri");
              const info = await MediaLibrary.getAssetInfoAsync(assetId);
              setDetailUri(info?.localUri ?? info?.uri ?? sourceUri);
            } else {
              setDetailUri(sourceUri);
            }
          } catch {
            setDetailUri(sourceUri);
          } finally {
            setDetailLoading(false);
          }
        })();

        /* 2026.05.12 지도 위 오버레이가 기본이므로 부모 위임 콜백은 보조 경로로만 유지 by June */
        if (!sourceUri) {
          onOpenPhotoFromMap?.({
            sourceUri,
            city: data.city,
            country: data.country,
          });
        }
      }
    } catch (e) {
      console.error("WebView message parse error", e);
    }
  };

  const fmtDateTime = (ms: number | null) => {
    if (!ms) return "";
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return "";
    const yyyy = d.getFullYear();
    const MM = `${d.getMonth() + 1}`.padStart(2, "0");
    const DD = `${d.getDate()}`.padStart(2, "0");
    const hh = `${d.getHours()}`.padStart(2, "0");
    const mm = `${d.getMinutes()}`.padStart(2, "0");
    return `${yyyy}/${MM}/${DD} ${hh}:${mm}`;
  };

  const onPressShare = async () => {
    if (!detailUri) return;
    try {
      await Share.open({
        message: detailPlace ? `Check out this photo! ${detailPlace}` : "Check out this photo!",
        url: Platform.OS === "android" ? `file://${detailUri}` : detailUri,
        type: "image/jpeg",
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      if (msg !== "User did not share") {
        Alert.alert("Error", "Failed to share the photo.");
      }
    }
  };

  const onPressDelete = () => {
    if (!detailSourceUri) return;
    Alert.alert("Delete Photo", "Are you sure you want to delete this photo?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          setCoordinates((prev) => prev.filter((c) => c.sourceUri !== detailSourceUri));
          setDetailVisible(false);
        },
      },
    ]);
  };

  const openMap = () => {
    setLoading(true);
    setThumbnailLoading(false);
    setCoordinatesReady(false);
    setVisible(true);
    void onOpenRequest?.();
  };

  return (
    <View>
      <TouchableOpacity onPress={openMap} activeOpacity={0.8}>
          {/* Map button 변경 2026.03.18 by June */}
          <View style={styles.mapButtonBg}>
            <IconMapPin width={18} height={18} />
          </View>
      </TouchableOpacity>
      <Modal visible={visible} animationType="slide">
        <View style={styles.container}>
          {preparingLocations ? (
            <View style={styles.mapStatusOverlay}>
              <ActivityIndicator size="large" color="#6366F1" />
              <Text style={styles.mapStatusText}>
                {preparingMessage ?? "Preparing locations..."}
              </Text>
            </View>
          ) : !coordinatesReady ? (
            <View style={styles.mapStatusOverlay}>
              <ActivityIndicator size="large" color="#6366F1" />
              <Text style={styles.mapStatusText}>Loading map locations...</Text>
            </View>
          ) : coordinates.length === 0 ? (
            <View style={styles.mapStatusOverlay}>
              <Text style={styles.mapStatusText}>No photos with location info</Text>
            </View>
          ) : (
            <WebView
              key={coordSignature}
              originWhitelist={["*"]}
              source={{ html }}
              style={styles.webview}
              onMessage={handleMessage}
            />
          )}
          {thumbnailLoading && coordinatesReady && coordinates.length > 0 ? (
            <View style={styles.mapThumbnailOverlay} pointerEvents="auto">
              <View style={styles.mapThumbnailBox}>
                <ActivityIndicator size="small" color="#6366F1" />
                <Text style={styles.mapThumbnailText}>Loading thumbnails...</Text>
              </View>
            </View>
          ) : null}
          <View style={styles.closeButton}>
            <TouchableOpacity
              onPress={() => setVisible(false)}
              style={{
                width: 44,
                height: 44,
                borderRadius: 14,
                backgroundColor: "#FFFFFF",
                alignItems: "center",
                justifyContent: "center",
                shadowColor: "#000",
                shadowOpacity: 0.12,
                shadowRadius: 16,
                shadowOffset: { width: 0, height: 8 },
                elevation: 6,
              }}
            >
              <Text
                style={{
                  color: "#374151",
                  fontSize: 16,
                  fontWeight: "bold",
                }}
              >
                X
              </Text>
            </TouchableOpacity>
          </View>

          {detailVisible && detailLoading ? (
            <View style={styles.detailLoadingOverlay}>
              <ActivityIndicator size="large" color="#fff" />
            </View>
          ) : null}
          <PhotoDetailViewer
            visible={detailVisible && !detailLoading && !!detailUri}
            images={detailUri ? [{ uri: detailUri }] : []}
            imageIndex={0}
            onRequestClose={() => setDetailVisible(false)}
            showPlayButton={false}
            dateText={fmtDateTime(detailTakenAt)}
            locationText={detailPlace}
            onPressShare={onPressShare}
            onPressDelete={onPressDelete}
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  webview: {
    width: Dimensions.get("window").width,
    height: Dimensions.get("window").height,
  },
  buttonText: {
    color: "#314158",
    fontSize: 14,
  },
  closeButton: {
    backgroundColor: "transparent",
    position: "absolute",
    top: "5%",
    right: "4%",
    zIndex: 10,
  },
  /* Map button 변경에 따른 CSS 추가 2026.03.18 by June */
  mapButtonBg: {
    width: '100%',
    height: '100%',
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: "#000",
    shadowOpacity: 0.10,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  detailLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.85)",
  },
  mapStatusOverlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F8FAFC",
    gap: 12,
  },
  mapStatusText: {
    color: "#374151",
    fontSize: 15,
    fontWeight: "600",
  },
  mapThumbnailOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15,23,42,0.18)",
  },
  mapThumbnailBox: {
    minWidth: 220,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.96)",
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  mapThumbnailText: {
    color: "#374151",
    fontSize: 13,
    fontWeight: "600",
  },
});
