import type { ImageStyle, ImageURISource, StyleProp } from "react-native";

export type PhotoDetailImageSource = ImageURISource & {
  assetId?: string;
};

export type PhotoDetailImageProps = {
  imageSrc: PhotoDetailImageSource;
  onLoad: () => void;
  style?: StyleProp<ImageStyle>;
};
