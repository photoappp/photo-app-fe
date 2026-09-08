import type { Photo } from "@/types/Photo";
import type { ImageStyle, StyleProp } from "react-native";

export type PhotoThumbnailProps = {
  hidden?: boolean;
  onError: () => void;
  onLoad: () => void;
  photo: Pick<Photo, "assetId" | "uri">;
  style?: StyleProp<ImageStyle>;
};
