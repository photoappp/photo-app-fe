//import ParallaxScrollView from "@/components/ParallaxScrollView";
import ShowOnMap from "@/components/ShowOnMap";
import { ThemedText } from "@/components/ThemedText";
import { Colors } from "@/constants/Colors";
import * as Location from "expo-location";
import * as MediaLibrary from "expo-media-library";
import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Dimensions,
  Image,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  useColorScheme,
  View,
} from "react-native";

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
    return { assets: [] };
  }

  return { assets: allAssets };
}

export default function HomeScreen() {
  const [images, setImages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const colorScheme = useColorScheme();

  useEffect(() => {
    const loadImages = async () => {
      try {
        const { status } = await (MediaLibrary.requestPermissionsAsync as any)(
          false,
          ["photo"]
        );

        if (status !== "granted") {
          setError("Permission denied to access media library");
          Alert.alert(
            "Permission Required",
            "Please grant permission to access photos"
          );
          setLoading(false);
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
          setLoading(false);
          return;
        }

        // Get detailed info for each asset
        const assetInfos = await Promise.all(
          assets.assets.map(async (asset) => {
            try {
              const info = await MediaLibrary.getAssetInfoAsync(asset.id);
              const imageUri =
                Platform.OS === "ios" ? info.localUri ?? info.uri : info.uri;
              return { ...info, imageUri: imageUri };
            } catch (err) {
              console.error("Error getting asset info:", err);
              return asset;
            }
          })
        );
        const imagesWithLocations = await imagesWithLocation(assetInfos);
        setImages(imagesWithLocations);
      } catch (err) {
        console.error("Error loading images:", err);
      } finally {
        setLoading(false);
      }
    };

    loadImages();
  }, []);
  async function imagesWithLocation(images: any[]) {
    const updated = await Promise.all(
      images.map(async (img) => {
        if (!img.location) {
          return { ...img, country: null, city: null };
        }

        const [place] = await Location.reverseGeocodeAsync({
          latitude: Number(img.location?.latitude),
          longitude: Number(img.location?.longitude),
        });
        return {
          ...img,
          country: place?.country ?? null,
          city: place?.city ?? place?.subregion ?? null,
        };
      })
    );
    return updated;
  }

  return (
    <ParallaxScrollView
      headerBackgroundColor={{
        light: Colors.light.background,
        dark: Colors.dark.background,
      }}
      headerTitle={
        <ThemedText
          type="title"
          style={{ color: Colors[colorScheme ?? "light"].text }}
        >
          PhoView
        </ThemedText>
      }
    >
      {loading ? (
        <View style={styles.centerContainer}>
          <Text>Loading images...</Text>
        </View>
      ) : error ? (
        <View style={styles.centerContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : (
        <>
          <View style={styles.mapContainer}>
            <ShowOnMap images={images} />
          </View>
          <View style={styles.container}>
            {images.map((img, index) => (
              <TouchableOpacity
                key={img.id || index}
                style={styles.imageContainer}
                onPress={() => setSelectedImage(img.imageUri)}
              >
                <Image
                  source={{ uri: img.imageUri }}
                  style={styles.image}
                  onError={(error) => {
                    console.error("Image load error:", error);
                  }}
                  onLoad={() => {
                    console.log("Image loaded successfully:", img.uri);
                  }}
                />
              </TouchableOpacity>
            ))}
          </View>
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
  mapContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 20,
  },
});
