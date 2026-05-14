import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useMemo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import ImageViewing from "react-native-image-viewing";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import IconPlay from "@/assets/icons/ic_play.svg";

type Props = {
  visible: boolean;
  images: Array<{ uri: string }>;
  imageIndex: number;
  onImageIndexChange?: (index: number) => void;
  onRequestClose: () => void;
  onPressPlay?: () => void;
  showPlayButton?: boolean;
  dateText?: string;
  locationText?: string;
  onPressShare?: () => void;
  onPressDelete?: () => void;
};

export default function PhotoDetailViewer({
  visible,
  images,
  imageIndex,
  onImageIndexChange,
  onRequestClose,
  onPressPlay,
  showPlayButton = false,
  dateText,
  locationText,
  onPressShare,
  onPressDelete,
}: Props) {
  const insets = useSafeAreaInsets();

  const Header = useMemo(
    () => () =>
      (
        <View
          style={[
            styles.header,
            { paddingTop: Math.max(insets.top, 12) },
          ]}
        >
          {showPlayButton ? (
            <TouchableOpacity
              onPress={onPressPlay}
              style={styles.playSlot}
              activeOpacity={0.9}
            >
              <LinearGradient
                colors={["#2B7FFF", "#AD46FF"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.playBg}
              >
                <IconPlay width={18} height={18} />
              </LinearGradient>
            </TouchableOpacity>
          ) : (
            <View style={styles.playSlot} />
          )}
          <TouchableOpacity onPress={onRequestClose} style={styles.closeBtn}>
            <Text style={styles.closeTxt}>✕</Text>
          </TouchableOpacity>
        </View>
      ),
    [insets.top, onPressPlay, onRequestClose, showPlayButton]
  );

  const Footer = useMemo(
    () => () =>
      (
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <TouchableOpacity onPress={onPressShare}>
            <Ionicons name="share-outline" size={24} color="#fff" />
          </TouchableOpacity>
          <View style={styles.metaWrap}>
            {!!dateText ? <Text style={styles.metaTxt}>{dateText}</Text> : null}
            {!!locationText ? <Text style={styles.locationTxt}>{locationText}</Text> : null}
          </View>
          <TouchableOpacity onPress={onPressDelete}>
            <Ionicons name="trash-outline" size={24} color="#fff" />
          </TouchableOpacity>
        </View>
      ),
    [dateText, insets.bottom, locationText, onPressDelete, onPressShare]
  );

  return (
    <ImageViewing
      images={images}
      imageIndex={imageIndex}
      visible={visible}
      onRequestClose={onRequestClose}
      onImageIndexChange={onImageIndexChange}
      HeaderComponent={Header}
      FooterComponent={Footer}
      backgroundColor="rgba(0,0,0,0.98)"
      swipeToCloseEnabled={false}
      doubleTapToZoomEnabled
    />
  );
}

const styles = StyleSheet.create({
  header: {
    position: "absolute",
    top: 0,
    left: 16,
    right: 16,
    zIndex: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  playSlot: {
    width: 108,
    height: 52,
    borderRadius: 16,
  },
  playBg: {
    width: "100%",
    height: "100%",
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  closeBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: "rgba(173,70,255,0.5)",
    backgroundColor: "rgba(16,16,18,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  closeTxt: {
    color: "#D9D9FF",
    fontSize: 24,
    fontWeight: "300",
  },
  footer: {
    width: "100%",
    paddingHorizontal: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  metaWrap: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 12,
  },
  metaTxt: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
  },
  locationTxt: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
  },
});
