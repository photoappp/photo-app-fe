import React, { useEffect, useRef, useState } from "react";
import {
  Dimensions,
  FlatList,
  Image,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

const { width, height } = Dimensions.get("window");

type SlideshowProps = {
  images: string[];
  interval?: number;
  visible: boolean;
  onClose: () => void;
};

const Slideshow: React.FC<SlideshowProps> = ({
  images,
  interval = 3000,
  visible,
  onClose,
}) => {
  const flatListRef = useRef<FlatList>(null);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!visible) return;

    const timer = setInterval(() => {
      const nextIndex = (index + 1) % images.length;
      setIndex(nextIndex);
      flatListRef.current?.scrollToIndex({ index: nextIndex, animated: true });
    }, interval);

    return () => clearInterval(timer);
  }, [index, visible, images.length, interval]);

  return (
    <Modal visible={visible} transparent={false}>
      <View style={styles.container}>
        <FlatList
          ref={flatListRef}
          data={images}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          keyExtractor={(_, idx) => idx.toString()}
          renderItem={({ item }) => (
            <Image
              source={{ uri: item.localUri }}
              style={{ width, height, resizeMode: "cover" }}
            />
          )}
        />
        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
          <Text style={styles.closeText}>✕</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
};

export default Slideshow;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "black" },
  closeButton: {
    position: "absolute",
    top: 50,
    right: 20,
    backgroundColor: "rgba(0,0,0,0.5)",
    padding: 10,
    borderRadius: 25,
  },
  closeText: { color: "white", fontSize: 18, fontWeight: "bold" },
});
