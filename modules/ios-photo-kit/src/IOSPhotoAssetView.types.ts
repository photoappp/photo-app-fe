import type { NativeSyntheticEvent, ViewProps } from "react-native";

export type IOSPhotoAssetLoadEvent = {
  assetId: string;
  height: number;
  isDegraded: boolean;
  width: number;
};

export type IOSPhotoAssetErrorEvent = {
  assetId: string;
  code: "asset-not-found" | "image-request-failed";
  message: string;
};

export type IOSPhotoAssetViewProps = ViewProps & {
  assetId: string;
  contentMode?: "contain" | "cover";
  onError?: (
    event: NativeSyntheticEvent<IOSPhotoAssetErrorEvent>,
  ) => void;
  onLoad?: (
    event: NativeSyntheticEvent<IOSPhotoAssetLoadEvent>,
  ) => void;
};
