import { Animated } from "react-native";

import type { PhotoDetailImageProps } from "./PhotoDetailImage.types";

export default function PhotoDetailImage({
  imageSrc,
  onLoad,
  style,
}: PhotoDetailImageProps) {
  return (
    <Animated.Image
      source={imageSrc}
      style={style}
      resizeMode="contain"
      onLoad={onLoad}
    />
  );
}
