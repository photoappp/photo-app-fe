import ParallaxScrollView from "@/components/ParallaxScrollView";
import * as MediaLibrary from "expo-media-library";
import { useEffect, useState } from "react";
import { Alert, Dimensions, Image, StyleSheet, Text, View } from "react-native";

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

export default function HomeScreen() {
  const [images, setImages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadImages = async () => {
      try {
        console.log("Requesting permissions...");
        const { status } = await MediaLibrary.requestPermissionsAsync();

        if (status !== "granted") {
          setError("Permission denied to access media library");
          Alert.alert(
            "Permission Required",
            "Please grant permission to access photos"
          );
          setLoading(false);
          return;
        }

        console.log("Permission granted, fetching assets...");

        // Get first 10 photos
        const assets = await MediaLibrary.getAssetsAsync({
          first: 10,
          mediaType: "photo",
          sortBy: "creationTime",
        });

        // console.log(`Found ${assets.assets.length} assets`);

        if (assets.assets.length === 0) {
          setError("No images found in media library");
          setLoading(false);
          return;
        }

        // Get detailed info for each asset
        const assetInfos = await Promise.all(
          assets.assets.map(async (asset) => {
            try {
              const info = await MediaLibrary.getAssetInfoAsync(asset.id);
              //   console.log("Asset info:", info);
              return info;
            } catch (err) {
              console.error("Error getting asset info:", err);
              return asset; // fallback to basic asset info
            }
          })
        );

        setImages(assetInfos);
      } catch (err) {
        console.error("Error loading images:", err);
      } finally {
        setLoading(false);
      }
    };

    loadImages();
  }, []);

  if (loading) {
    return (
      <ParallaxScrollView
        headerBackgroundColor={{ light: "#A1CEDC", dark: "#1D3D47" }}
        headerImage={
          <Image
            source={require("@/assets/images/partial-react-logo.png")}
            style={styles.reactLogo}
          />
        }
      >
        <View style={styles.centerContainer}>
          <Text>Loading images...</Text>
        </View>
      </ParallaxScrollView>
    );
  }

  if (error) {
    return (
      <ParallaxScrollView
        headerBackgroundColor={{ light: "#A1CEDC", dark: "#1D3D47" }}
        headerImage={
          <Image
            source={require("@/assets/images/partial-react-logo.png")}
            style={styles.reactLogo}
          />
        }
      >
        <View style={styles.centerContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      </ParallaxScrollView>
    );
  }

  return (
    <ParallaxScrollView
      headerBackgroundColor={{ light: "#A1CEDC", dark: "#1D3D47" }}
      headerTitle="PhoSearch"
    >
      <View style={styles.container}>
        {images.map((img, index) => (
          <View key={img.id || index} style={styles.imageContainer}>
            <Image
              source={{ uri: img.localUri }}
              style={styles.image}
              onError={(error) => {
                console.error("Image load error:", error);
              }}
              onLoad={() => {
                console.log("Image loaded successfully:", img.uri);
              }}
            />
          </View>
        ))}
      </View>
    </ParallaxScrollView>
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
  reactLogo: {
    height: 178,
    width: 290,
    bottom: 0,
    left: 0,
    position: "absolute",
  },
});
