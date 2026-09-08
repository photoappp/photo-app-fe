import { IOSPhotoAssetView } from "@/modules/ios-photo-kit";
import { Image, StyleSheet } from "react-native";

import type { PhotoThumbnailProps } from "./PhotoThumbnail.types";

export default function PhotoThumbnail({
  hidden = false,
  onError,
  onLoad,
  photo,
  style,
}: PhotoThumbnailProps) {
  const assetId = photo.assetId?.trim() || getAssetIdFromPhUri(photo.uri);

  if (assetId) {
    return (
      <IOSPhotoAssetView
        assetId={assetId}
        style={[style, hidden && styles.hidden]}
        onLoad={onLoad}
        onError={onError}
      />
    );
  }

  if (photo.uri.startsWith("ph://")) return null;

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

function getAssetIdFromPhUri(uri: string): string | undefined {
  if (!uri.startsWith("ph://")) return undefined;
  const raw = uri.slice("ph://".length).split("?")[0].split("/")[0];
  return raw || undefined;
}

const styles = StyleSheet.create({
  hidden: {
    opacity: 0,
  },
});
