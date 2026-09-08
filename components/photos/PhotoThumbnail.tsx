import { Image, StyleSheet } from "react-native";

import type { PhotoThumbnailProps } from "./PhotoThumbnail.types";

export default function PhotoThumbnail({
  hidden = false,
  onError,
  onLoad,
  photo,
  style,
}: PhotoThumbnailProps) {
  return (
    <Image
      source={{ uri: photo.uri }}
      style={[style, hidden && styles.hidden]}
      resizeMode="cover"
      onLoad={onLoad}
      onError={onError}
    />
  );
}

const styles = StyleSheet.create({
  hidden: {
    opacity: 0,
  },
});
