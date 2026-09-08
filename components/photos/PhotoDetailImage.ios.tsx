import { IOSPhotoAssetView } from "@/modules/ios-photo-kit";
import { Animated } from "react-native";

import type { PhotoDetailImageProps } from "./PhotoDetailImage.types";

export default function PhotoDetailImage({
  imageSrc,
  onLoad,
  style,
}: PhotoDetailImageProps) {
  const assetId = imageSrc.assetId?.trim();

  if (assetId) {
    return (
      <IOSPhotoAssetView
        assetId={assetId}
        contentMode="contain"
        style={style}
        onLoad={onLoad}
      />
    );
  }

  if (!imageSrc.uri || imageSrc.uri.startsWith("ph://")) {
    return null;
  }

  return (
    <Animated.Image
      source={imageSrc}
      style={style}
      resizeMode="contain"
      onLoad={onLoad}
    />
  );
}
