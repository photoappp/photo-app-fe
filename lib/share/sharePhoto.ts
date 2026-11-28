/* 2026.11.27 사진 공유 공용 함수 — 사진 상세/지도 상세의 공유 버튼이 함께 사용 by yen
   - Android: 사진 주소가 content://media/... 인데 앞에 file://을 붙여 file://content://...가 되어 공유가 항상 실패했음.
     또 react-native-share는 앱 캐시/Download 폴더 파일만 다른 앱에 넘길 수 있어 갤러리 주소를 그대로 넘겨도 실패함
   - iOS: ph:// (사진 보관함 참조)를 그대로 넘겨 이미지가 아닌 링크로 공유됐음
   → 실제 파일을 찾아 앱 캐시 폴더에 복사한 뒤 그 복사본을 공유(두 플랫폼 동일) */
import * as FileSystem from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library";
import { Platform } from "react-native";
import Share from "react-native-share";

const SHARE_DIR = `${FileSystem.cacheDirectory ?? ""}share/`;

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  heic: "image/heic",
  heif: "image/heif",
  gif: "image/gif",
  webp: "image/webp",
};

const extensionOf = (name?: string | null) => {
  const match = /\.([a-z0-9]+)(?:\?.*)?$/i.exec(name ?? "");
  return match ? match[1].toLowerCase() : null;
};

/* 사진 주소에서 MediaLibrary 자산 id 추출 — iOS ph://<id>, Android content://media/.../<id> */
const assetIdFromUri = (uri: string) => {
  if (uri.startsWith("ph://")) return uri.slice("ph://".length) || null;
  if (uri.startsWith("content://")) return /\/(\d+)$/.exec(uri)?.[1] ?? null;
  return null;
};

/* 복사할 원본 파일 주소와 파일명(확장자 판단용)을 결정 */
const resolveShareSource = async (uri: string, assetId?: string | null) => {
  const id = assetId || assetIdFromUri(uri);
  let localUri: string | null = null;
  let filename: string | null = null;
  if (id) {
    try {
      const info = await MediaLibrary.getAssetInfoAsync(id);
      localUri = info?.localUri ?? null;
      filename = info?.filename ?? null;
    } catch {
      // 자산 정보를 못 읽으면 원래 주소로 시도
    }
  }
  /* Android는 content:// 원본을 그대로 복사(권한상 가장 안전), iOS는 실제 파일 경로(localUri) 필요 */
  const source =
    Platform.OS === "android"
      ? uri.startsWith("content://") || uri.startsWith("file://")
        ? uri
        : (localUri ?? uri)
      : (localUri ?? uri);
  return { source, filename };
};

export type SharePhotoParams = {
  uri: string;
  assetId?: string | null;
  message?: string;
};

/* 공유 시트를 연다. 사용자가 취소하면 react-native-share의 "User did not share" 오류가 그대로 던져진다 */
export const sharePhoto = async ({ uri, assetId, message }: SharePhotoParams) => {
  const { source, filename } = await resolveShareSource(uri, assetId);
  if (source.startsWith("ph://")) {
    throw new Error("Could not resolve the photo file to share");
  }

  const extension = extensionOf(filename) ?? extensionOf(source) ?? "jpg";
  const mimeType = MIME_BY_EXTENSION[extension] ?? "image/jpeg";

  /* 이전 공유 복사본을 지워 캐시가 쌓이지 않도록 함 */
  await FileSystem.deleteAsync(SHARE_DIR, { idempotent: true });
  await FileSystem.makeDirectoryAsync(SHARE_DIR, { intermediates: true });
  const target = `${SHARE_DIR}photo-${Date.now()}.${extension}`;
  await FileSystem.copyAsync({ from: source, to: target });

  await Share.open({
    message,
    url: target,
    type: mimeType,
  });
};
