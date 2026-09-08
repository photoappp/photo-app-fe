import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useMemo } from "react";
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import ImageViewing from "react-native-image-viewing";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import IconPlay from "@/assets/icons/ic_play.svg";
import PhotoDetailImage from "@/components/photos/PhotoDetailImage";
import type { PhotoDetailImageSource } from "@/components/photos/PhotoDetailImage.types";

type Props = {
  visible: boolean;
  images: PhotoDetailImageSource[];
  imageIndex: number;
  onImageIndexChange?: (index: number) => void;
  onRequestClose: () => void;
  onPressPrimary?: () => void;
  primaryButtonMode?: "play" | "pause";
  showCloseButton?: boolean;
  backgroundColor?: string;
  animationType?: "none" | "slide" | "fade";
  presentationStyle?: "fullScreen" | "pageSheet" | "formSheet" | "overFullScreen";
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
  onPressPrimary,
  primaryButtonMode = "play",
  showCloseButton = true,
  backgroundColor = "rgba(0,0,0,0.98)",
  animationType = "fade",
  presentationStyle,
  dateText,
  locationText,
  onPressShare,
  onPressDelete,
}: Props) {
  const insets = useSafeAreaInsets();

  const Header = useMemo(
    () => {
      const PhotoDetailViewerHeader = () => (
        <View style={styles.header}>
          <View
            style={[
              styles.headerBar,
              { paddingTop: Math.max(insets.top, 12) },
            ]}
          >
            <TouchableOpacity
              onPress={onPressPrimary}
              style={styles.primarySlot}
              activeOpacity={0.9}
            >
              <LinearGradient
                colors={primaryButtonMode === "pause" ? ["#AD46FF", "#2B7FFF"] : ["#2B7FFF", "#AD46FF"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.primaryBg}
              >
                {primaryButtonMode === "pause" ? (
                  <Text style={styles.pauseTxt}>Ⅱ</Text>
                ) : (
                  <IconPlay width={18} height={18} />
                )}
              </LinearGradient>
            </TouchableOpacity>
            {showCloseButton ? (
              <TouchableOpacity onPress={onRequestClose} style={styles.closeBtn}>
                <Text style={styles.closeTxt}>✕</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.closeBtnPlaceholder} />
            )}
          </View>
        </View>
      );
      PhotoDetailViewerHeader.displayName = "PhotoDetailViewerHeader";
      return PhotoDetailViewerHeader;
    },
    [insets.top, onPressPrimary, onRequestClose, primaryButtonMode, showCloseButton]
  );

  const Footer = useMemo(
    () => {
      const PhotoDetailViewerFooter = () => (
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
      );
      PhotoDetailViewerFooter.displayName = "PhotoDetailViewerFooter";
      return PhotoDetailViewerFooter;
    },
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
      ImageComponent={PhotoDetailImage}
      backgroundColor={backgroundColor}
      animationType={animationType}
      presentationStyle={presentationStyle}
      swipeToCloseEnabled={false}
      doubleTapToZoomEnabled
    />
  );
}

const styles = StyleSheet.create({
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10,
  },
  headerBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  primarySlot: {
    width: 108,
    height: 52,
    borderRadius: 16,
  },
  primaryBg: {
    width: "100%",
    height: "100%",
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  pauseTxt: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "800",
    lineHeight: 22,
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
  closeBtnPlaceholder: {
    width: 52,
    height: 52,
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
