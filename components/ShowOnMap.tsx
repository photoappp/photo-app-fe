import { useState } from "react";
import { Button, Dimensions, Modal, StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";
import * as amplitude from '@amplitude/analytics-react-native';

/* 타입 일치를 위해 Photo로 병합
type Image = {
  localUri: string;
  city?: string;
  country?: string;
  location?: {
    latitude: string | number;
    longitude: string | number;
  };
};*/
type Photo = {
  uri: string;
  takenAt?: number | null;  // 있으면 쓰고, 아니면 빼도 됨

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
  const [visible, setVisible] = useState(false);
  // Collect coordinates from images
  const coordinates = images
    .filter((image) => image.location)
    .map((image) => ({
      latitude: Number(image.location!.latitude),
      longitude: Number(image.location!.longitude),
      city: image.city,
      country: image.country,
    }));

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
            L.marker([c.latitude, c.longitude])
              .addTo(map)
              .bindPopup(c.city + ', ' +c.country || i);
		
							// 마커 클릭 시 React Native로 메시지 전달
							marker.on('click', () => {
								window.ReactNativeWebView.postMessage(JSON.stringify({
									type: 'marker_click',
									uri: c.uri,
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
			if (data.type === 'marker_click') {
				amplitude.track('Location_Clicked', {
					uri: data.uri,
					city: data.city,
					country: data.country,
				});
			}
		} catch (e) {
			console.error('WebView message parse error', e);
		}
	};
	
  return (
    <View>
			<Button 
					title="Show on Map"
					onPress={() => {
							setVisible(true)
							// Amplitude 이벤트
							amplitude.track('Show on the map');
					}}
			/>

      <Modal visible={visible} animationType="slide">
        <View style={styles.container}>
          <WebView
            originWhitelist={["*"]}
            source={{ html }}
            style={styles.webview}
						onMessage={handleMessage}
          />
          <View style={styles.closeButton}>
            <Button title="X" onPress={() => setVisible(false)} />
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
  closeButton: {
    position: "absolute",
    top: "5%",
    right: "4%",
    zIndex: 10,
  },
});
