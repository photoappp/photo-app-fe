import ParallaxScrollView from "@/components/ParallaxScrollView";
import SearchBar from "@/components/searchBar";
import MapView from "@/components/showMapView";
import Slideshow from "@/components/Slideshow";
import * as Location from "expo-location";
import * as MediaLibrary from "expo-media-library";
import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  FlatList,
  Image,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import countries from "i18n-iso-countries";
import enLocale from "i18n-iso-countries/langs/en.json";
import jaLocale from "i18n-iso-countries/langs/ja.json";
import koLocale from "i18n-iso-countries/langs/ko.json";
countries.registerLocale(enLocale);
countries.registerLocale(jaLocale);
countries.registerLocale(koLocale);

export default function HomeScreen() {
  const [images, setImages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [allImages, setAllImages] = useState<any[]>([]);
  const [searchText, setSearchText] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ city?: string; country?: string }[]>(
    []
  );
  const [showSlideshow, setShowSlideshow] = useState(false);
  const [selectedRegion, setSelectedRegion] = useState<string>("Anywhere");
  const [locationModalVisible, setLocationModalVisible] = useState(false);

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
          first: 12,
          mediaType: "photo",
          sortBy: "creationTime",
        });

        console.log(`Found ${assets.assets.length} assets`);

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
              console.log("Asset info:", info);
              return info;
            } catch (err) {
              console.error("Error getting asset info:", err);
              return asset; // fallback to basic asset info
            }
          })
        );
        const imageswithlocation = await enrichImagesWithLocation(assetInfos);
        setImages(imageswithlocation);
        setAllImages(imageswithlocation);
        // console.log("Enriched images:", enriched);
      } catch (err) {
        console.error("Error loading images:", err);
      } finally {
        setLoading(false);
      }
    };

    loadImages();
    // Get location
    async function enrichImagesWithLocation(images: any[]) {
      const updated = await Promise.all(
        images.map(async (img) => {
          if (!img.location) {
            return { ...img, country: null, city: null }; // skip invalid location
          }

          const [place] = await Location.reverseGeocodeAsync({
            latitude: Number(img.location?.latitude),
            longitude: Number(img.location?.longitude),
          });
          // console.log(place);
          return {
            ...img,
            country: place?.country ?? null,
            city: place?.city ?? place?.subregion ?? null,
          };
        })
      );
      return updated;
    }
  }, []);
  // const regions = Array.from(
  //   new Set(allImages.flatMap((f) => [f.country, f.city].filter(Boolean)))
  // );
  const extraCountries = [
    "France",
    "Germany",
    "Japan",
    "Brazil",
    "Australia",
    "India",
    "Italy",
    "Spain",
    "Mexico",
    "South Africa",
  ];

  const unsortedregions = Array.from(
    new Set([
      ...allImages.flatMap((f) => [f.country, f.city].filter(Boolean)),
      ...extraCountries,
    ])
  );
  const regions = unsortedregions.sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" })
  );

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
  const toggleModal = () => setModalVisible((prev) => !prev);
  const handleSearch = (text: string) => {
    setQuery(text);
    setImages(allImages);
    const input = text.trim();

    // try to get the country code from Korean input
    const countryCode = countries.getAlpha2Code(input, "ko");
    // const countryCode = countries.getAlpha2Code(input, "ja");
    // get English name if code exists, fallback to input
    const query = countryCode
      ? countries.getName(countryCode, "en", { select: "all" })
      : input;
    console.log("Searching for:", text, input, countryCode, query);
    const queryArray = Array.isArray(query) ? query : [query];
    if (query) {
      const filtered = allImages.filter((f) =>
        queryArray.some(
          (name) =>
            name &&
            (f.country?.toLowerCase().includes(name.toLowerCase()) ||
              f.city?.toLowerCase().includes(name.toLowerCase()))
        )
      );
      setResults(filtered);
      setImages(filtered);
    } else {
      setImages(allImages);
      setResults([]);
    }
    console.log("Results:", results);
  };
  const handleSelect = (region: string) => {
    setSelectedRegion(region);
    const regionSelected = allImages.filter(
      (f) =>
        f.country?.toLowerCase().includes(region.toLowerCase()) ||
        f.city?.toLowerCase().includes(region.toLowerCase())
    );
    setResults(regionSelected);
    setImages(regionSelected);
    setModalVisible(false);
  };
  // });
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
      <Text style={styles.title}>Found {images.length} images</Text>
      {/* <SearchBar
        value={searchText}
        onChangeText={setSearchText}
        placeholder="Search city..."
        onSubmitEditing={() => handleSearch(searchText, images, setImages)}
      /> */}
      <SearchBar
        value={query}
        onChangeText={handleSearch}
        suggestions={results}
        placeholder="Search city..."
        onSubmitEditing={() => handleSearch(query)}
        onSelectSuggestion={(item) => {
          setQuery(item);
          setResults([]);
        }}
      />
      <View style={styles.modalContainer}>
        {/* Main Button */}
        <TouchableOpacity
          style={styles.button}
          onPress={() => setModalVisible(true)}
        >
          <Text style={styles.buttonText}>{selectedRegion}</Text>
        </TouchableOpacity>

        {/* Modal */}
        <Modal
          transparent={true}
          animationType="slide"
          visible={modalVisible}
          onRequestClose={() => setModalVisible(false)}
        >
          <View style={styles.modalBackground}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Choose a Region</Text>

              <FlatList
                data={regions}
                keyExtractor={(item, index) => `${item}-${index}`}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.optionButton}
                    onPress={() => handleSelect(item)}
                  >
                    <Text style={styles.optionText}>{item}</Text>
                  </TouchableOpacity>
                )}
              />

              <TouchableOpacity
                style={[styles.optionButton, { backgroundColor: "#ddd" }]}
                onPress={() => setModalVisible(false)}
              >
                <Text style={{ fontSize: 16 }}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </View>
      <View
        style={{
          flex: 1,
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <View style={{ flexDirection: "row", gap: 20 }}>
          <Button title="Slideshow" onPress={() => setShowSlideshow(true)} />
          <Button title="Show on Map" onPress={toggleModal} />
        </View>

        <Slideshow
          images={images}
          visible={showSlideshow}
          onClose={() => setShowSlideshow(false)}
        />
      </View>
      <View style={styles.container}>
        {images.map((img, index) => (
          <TouchableOpacity
            key={img.id || index}
            style={styles.imageContainer}
            onPress={() => setSelectedImage(img.localUri)}
          >
            <Image
              source={{ uri: img.localUri }}
              style={styles.image}
              onError={(error) => console.error("Image load error:", error)}
              onLoad={() => console.log("Image loaded successfully:", img.uri)}
            />
          </TouchableOpacity>
        ))}
      </View>
      <Modal visible={modalVisible} animationType="slide">
        <View style={{ flex: 1 }}>
          <View
            style={{
              position: "absolute",
              top: 40,
              right: 20,
              zIndex: 10,
              backgroundColor: "rgba(128,128,128,0.8)",
            }}
          >
            <Button title="X" onPress={toggleModal} />
          </View>
          <MapView photos={images} />
        </View>
      </Modal>
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
    </ParallaxScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    // padding: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 16,
    textAlign: "center",
  },
  imageContainer: {
    width: "32%", // 3열: 100 / 3 - spacing
    // backgroundColor: "#f5f5f5",
    // padding: 10,
    // marginBottom: 10, // 행 사이 간격
  },
  image: {
    width: "100%",
    height: 100,
  },
  metadataContainer: {
    maxHeight: 200,
    marginTop: 10,
    backgroundColor: "#fff",
    borderRadius: 4,
    padding: 8,
    width: "100%",
  },
  metadata: {
    fontFamily: "monospace",
    fontSize: 12,
    color: "#333",
  },
  errorText: {
    color: "red",
    textAlign: "center",
    fontSize: 16,
  },
  titleContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  stepContainer: {
    gap: 8,
    marginBottom: 8,
  },
  reactLogo: {
    height: 178,
    width: 290,
    bottom: 0,
    left: 0,
    position: "absolute",
  },
  modalContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  button: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: "#007AFF",
    borderRadius: 8,
  },
  buttonText: {
    color: "white",
    fontSize: 18,
  },
  modalBackground: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    width: "80%",
    backgroundColor: "white",
    padding: 20,
    borderRadius: 10,
    maxHeight: "80%",
  },
  modalTitle: {
    fontSize: 20,
    marginBottom: 20,
    textAlign: "center",
    fontWeight: "bold",
  },
  optionButton: {
    padding: 12,
    borderBottomWidth: 1,
    borderColor: "#ddd",
  },
  optionText: {
    fontSize: 16,
    textAlign: "center",
  },
});
