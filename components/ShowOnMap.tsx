import { useLanguage } from "@/components/context/LanguageContext";
import { TRANSLATIONS } from "@/constants/Translations";
import * as amplitude from "@amplitude/analytics-react-native";
import { useEffect, useState } from "react";
import {
  Dimensions,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { WebView } from "react-native-webview";
// 2026-03-18 get proper coordinates by yen
import * as FileSystem from "expo-file-system/legacy";

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
  // 2026-03-18 get proper coordinates by yen
  const [coordinates, setCoordinates] = useState<any[]>([]); // store base64 coords
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadCoordinates = async () => {
      try {
        const coords = await Promise.all(
          images
            .filter((img) => img.location)
            .map(async (img) => {
              const base64 = await FileSystem.readAsStringAsync(img.uri, {
                encoding: "base64",
              });

              return {
                uri: `data:image/jpeg;base64,${base64}`,
                latitude: Number(img.location!.latitude),
                longitude: Number(img.location!.longitude),
                city: img.city,
                country: img.country,
              };
            }),
        );

        setCoordinates(coords.filter(Boolean));
      } catch (e) {
        console.error("Failed to load images as base64", e);
      } finally {
        setLoading(false);
      }
    };

    loadCoordinates();
  }, [images]);
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

          // OSM tiles
          L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          }).addTo(map);

          // Add markers
          coordinates.forEach((c, i) => {
          // 2026-03-18 custom marker HTML by yen
            const iconHtml = '<div class="custom-marker">' +
              '<div class="photo-frame">' +
                '<img src="' + c.uri + '">' +
              '</div>' +
              '<div class="connector-line"></div>' +
              // '<div class="target-circle"></div>' +
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
              html: iconHtml, // This passes the concatenated string
              className: 'my-custom-marker',
              iconSize: [80, 120],
              iconAnchor: [40, 120]
            });
            L.marker([c.latitude, c.longitude], { icon: customIcon })
              .addTo(map);
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
          uri: data.uri,
          city: data.city,
          country: data.country,
        });
      }
    } catch (e) {
      console.error("WebView message parse error", e);
    }
  };

  return (
    <View>
      <TouchableOpacity onPress={() => setVisible(true)} activeOpacity={0.8}>
        <Text style={styles.buttonText}>{TRANSLATIONS[language].map}</Text>
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
});
