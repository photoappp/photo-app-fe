import { requireNativeViewManager } from "expo-modules-core";
import type { ComponentType } from "react";

import type { IOSPhotoAssetViewProps } from "./IOSPhotoAssetView.types";

const NativeIOSPhotoAssetView: ComponentType<IOSPhotoAssetViewProps> =
  requireNativeViewManager<IOSPhotoAssetViewProps>("IOSPhotoKit");

export default function IOSPhotoAssetView(props: IOSPhotoAssetViewProps) {
  return <NativeIOSPhotoAssetView {...props} />;
}
