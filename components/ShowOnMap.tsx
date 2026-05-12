import { useLanguage } from "@/components/context/LanguageContext";
import { TRANSLATIONS } from "@/constants/Translations";
import * as amplitude from "@amplitude/analytics-react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import IconMapPin from "@/assets/icons/ic_map_pin.svg";
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
// 2026-03-18 get proper coordinates by yen
import * as FileSystem from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library";

type Photo = {
  uri: string;
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
};

export default function MapView({ images }: Props) {
  const { language } = useLanguage();
  const [visible, setVisible] = useState(false);
  const [detailVisible, setDetailVisible] = useState(false);
  const [detailUri, setDetailUri] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailPlace, setDetailPlace] = useState<string>("");
  // 2026-03-18 get proper coordinates by yen
  const [coordinates, setCoordinates] = useState<any[]>([]); // store base64 coords
  const [loading, setLoading] = useState(true);
  /* 2026.05.12 이미지 로드 실패 시에도 좌표 마커는 유지하기 위해 공통 placeholder 이미지를 정의 by June */
  const FALLBACK_MARKER_URI =
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
      "<svg xmlns='http://www.w3.org/2000/svg' width='80' height='80'><rect width='100%' height='100%' rx='16' ry='16' fill='#EEF2FF'/><circle cx='40' cy='40' r='14' fill='#6366F1'/></svg>"
    );
  /* 2026.04.15 동일 이미지 입력에서 좌표 재계산/재설정 루프를 막기 위해 마지막 처리 시그니처를 저장 by June */
  const lastImagesSigRef = useRef<string>("");

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
    /* 2026.04.15 동일 시그니처에서는 setCoordinates를 생략해 Maximum update depth 재발 가능성을 낮추기 위해 가드 추가 by June */
    if (lastImagesSigRef.current === imagesSignature) return;
    lastImagesSigRef.current = imagesSignature;

    const loadCoordinates = async () => {
      try {
        const settled = await Promise.allSettled(
          images
            .filter((img) => img.location)
            .map(async (img) => {
              const latitude = Number(img.location!.latitude);
              const longitude = Number(img.location!.longitude);
              if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
                return null;
              }

              let markerUri = FALLBACK_MARKER_URI;
              if (typeof img.uri === "string" && img.uri.startsWith("file://")) {
                try {
                  const base64 = await FileSystem.readAsStringAsync(img.uri, {
                    encoding: "base64",
                  });
                  markerUri = `data:image/jpeg;base64,${base64}`;
                } catch {
                  markerUri = FALLBACK_MARKER_URI;
                }
              }

              return {
                markerUri,
                sourceUri: img.uri,
                latitude,
                longitude,
                city: img.city,
                country: img.country,
              };
            }),
        );

        const coords = settled
          .filter(
            (r): r is PromiseFulfilledResult<any> =>
              r.status === "fulfilled" && !!r.value
          )
          .map((r) => r.value);
        /* 2026.04.15 동일 좌표 배열을 반복 설정하지 않도록 이전 상태와 비교 후에만 setState 하도록 수정 by June */
        setCoordinates((prev) => {
          const next = coords.filter(Boolean);
          const prevSig = JSON.stringify(prev);
          const nextSig = JSON.stringify(next);
          if (prevSig === nextSig) return prev;
          return next;
        });
      } catch (e) {
        console.error("Failed to load images as base64", e);
      } finally {
        setLoading(false);
      }
    };

    loadCoordinates();
  }, [imagesSignature, images]);
  // Pass coordinates to WebView as JSON
  const coordJSON = JSON.stringify(coordinates);

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
                  country: c.country
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

        setDetailPlace([data.city, data.country].filter(Boolean).join(", "));
        setDetailVisible(true);
        setDetailLoading(true);
        setDetailUri(null);

        void (async () => {
          try {
            const sourceUri = String(data.sourceUri ?? "");
            if (sourceUri.startsWith("ph://")) {
              const assetId = sourceUri.replace("ph://", "");
              const info = await MediaLibrary.getAssetInfoAsync(assetId);
              setDetailUri(info.localUri ?? info.uri ?? sourceUri);
            } else {
              setDetailUri(sourceUri);
            }
          } catch {
            setDetailUri(String(data.sourceUri ?? ""));
          } finally {
            setDetailLoading(false);
          }
        })();
      }
    } catch (e) {
      console.error("WebView message parse error", e);
    }
  };

  return (
    <View>
      <TouchableOpacity onPress={() => setVisible(true)} activeOpacity={0.8}>
          {/* Map button 변경 2026.03.18 by June */}
          <View style={styles.mapButtonBg}>
            <IconMapPin width={18} height={18} />
          </View>
      </TouchableOpacity>
      <Modal visible={visible} animationType="slide">
        <View style={styles.container}>
          <WebView
            originWhitelist={["*"]}
            source={{ html }}
            style={styles.webview}
            onMessage={handleMessage}
          />
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

          {/* 2026.05.12 지도 모달 위에 상세를 같은 레이어로 오버레이해 즉시 표출/복귀 동작을 안정화 by June */}
          {detailVisible ? (
            <View style={styles.detailContainer}>
              <TouchableOpacity
                onPress={() => setDetailVisible(false)}
                style={styles.detailCloseButton}
              >
                <Text style={styles.detailCloseText}>X</Text>
              </TouchableOpacity>

              {detailLoading ? (
                <ActivityIndicator size="large" color="#fff" />
              ) : detailUri ? (
                <Image source={{ uri: detailUri }} style={styles.detailImage} resizeMode="contain" />
              ) : (
                <Text style={styles.detailFallbackText}>Unable to load image</Text>
              )}

              {detailPlace ? <Text style={styles.detailMetaText}>{detailPlace}</Text> : null}
            </View>
          ) : null}
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
  detailContainer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 20,
  },
  detailImage: {
    width: "100%",
    height: "100%",
  },
  detailCloseButton: {
    position: "absolute",
    top: "6%",
    right: "6%",
    zIndex: 10,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  detailCloseText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
  },
  detailFallbackText: {
    color: "#fff",
    fontSize: 16,
  },
  detailMetaText: {
    position: "absolute",
    bottom: "6%",
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});
