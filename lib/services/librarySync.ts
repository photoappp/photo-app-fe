import { requireOptionalNativeModule } from "expo";

/* 2026.10.18 사진 라이브러리 증분 동기화 네이티브 모듈(modules/photo-sync) 래퍼 by Claude.
   모듈이 포함되지 않은 빌드(기존 바이너리/Expo Go)에서는 null이 되고, 호출부는 기존 JS 전수 패스로 폴백한다. */

export type LibrarySyncMode = "full" | "delta" | "audit" | "reconcile";

export type LibrarySyncPlan = {
  handle: string;
  mode: LibrarySyncMode;
  total: number | null;
  /* 읽기 이전에 캡처된 체크포인트 — JS가 자체 전체 패스를 끝낸 경우에도 저장해 다음 세션부터 증분 전환 */
  checkpoint: string | null;
};

export type LibrarySyncAsset = {
  id: string;
  uri: string;
  creationTime: number;
  modificationTime: number;
  revision: string;
  /* iOS는 bulk 조회 시점에 좌표를 함께 내려줌(Android는 없음) */
  latitude?: number;
  longitude?: number;
};

export type LibrarySyncPage = {
  assets: LibrarySyncAsset[];
  ids: string[];
  deleted: string[];
  done: boolean;
};

type LibrarySyncModule = {
  begin(checkpoint: string | null, limited: boolean): Promise<LibrarySyncPlan>;
  read(handle: string, limit: number): Promise<LibrarySyncPage>;
  finish(handle: string): Promise<string>;
  close(handle: string): Promise<void>;
};

export const librarySync =
  requireOptionalNativeModule<LibrarySyncModule>("PicQlyPhotoSync");

export const hasNativeLibrarySync = () => !!librarySync;
