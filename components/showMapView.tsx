import React, { Component } from "react";
import { Dimensions, View } from "react-native";
import { WebView } from "react-native-webview";
type Photo = {
  localUri: string;
  location?: {
    latitude: string | number;
    longitude: string | number;
  };
};
type Props = {
  photos: Photo[];
};

type State = {};

export default class PhotoMap extends Component<Props, State> {
  async render() {
    const { photos } = this.props;

    // Collect coordinates from photos
    const coordinates = photos
      .filter((photo) => photo.location)
      .map((photo) => ({
        latitude: Number(photo.location!.latitude),
        longitude: Number(photo.location!.longitude),
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
              .bindPopup('Photo ' + (i+1));
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

    return (
      <View style={{ flex: 1 }}>
        <WebView
          originWhitelist={["*"]}
          source={{ html }}
          style={{
            width: Dimensions.get("window").width,
            height: Dimensions.get("window").height,
          }}
        />
      </View>
    );
  }
}
