import * as MediaLibrary from "expo-media-library";
/* 2026.04.15 MediaLibrary 자산을 SQLite 메타데이터로 동기화하는 서비스 레이어를 신규 추가 by June */

import {
  PhotoMetadataRow,
  getPhotoSyncState,
  initPhotoMetadataDb,
  updatePhotoSyncState,
  upsertPhotoMetadataRows,
} from "@/lib/db/photoMetadataDb";
import { recordPerfMetric } from "@/lib/services/perfMetrics";

/* 2026.04.15 동기화 페이지 크기를 상수화해 앱 성능 이슈 시 운영값을 안전하게 조정하기 위해 추가 by June */
const SYNC_PAGE_SIZE = 300;

/* 2026.04.15 동기화 중복 실행을 막아 같은 시점 다중 동기화로 인한 성능 저하를 방지하기 위해 추가 by June */
let inFlightSync: Promise<void> | null = null;

/* 2026.04.15 Asset timestamp 우선순위를 통일해 DB 저장 시 일관된 정렬 기준을 확보하기 위해 추가 by June */
const getAssetTakenAt = (asset: MediaLibrary.Asset) => {
  if (asset.creationTime && asset.creationTime > 0) return asset.creationTime;
  if (asset.modificationTime && asset.modificationTime > 0)
    return asset.modificationTime;
  return null;
};

/* 2026.04.15 시간 필터를 SQL 인덱스로 처리하기 위해 동기화 시점에 minute-of-day를 함께 계산해 저장하기 위해 추가 by June */
const getTakenMinute = (takenAt: number | null) => {
  if (typeof takenAt !== "number") return null;
  const local = new Date(takenAt);
  return local.getHours() * 60 + local.getMinutes();
};

/* 2026.04.15 Asset 기본 메타를 DB row로 정규화해 동기화/업서트 입력 구조를 고정하기 위해 추가 by June */
const toMetadataRow = (asset: MediaLibrary.Asset): PhotoMetadataRow => {
  const now = Date.now();
  const takenAt = getAssetTakenAt(asset);

  return {
    assetId: asset.id,
    uri: asset.uri,
    takenAt,
    takenMinute: getTakenMinute(takenAt),
    latitude: null,
    longitude: null,
    createdAt: now,
    updatedAt: now,
    isDeleted: 0,
  };
};

/* 2026.04.15 이미 가져온 Asset 목록을 즉시 DB에 반영해 다음 조회에서 재사용 가능하게 만들기 위해 추가 by June */
export const upsertPhotoMetadataFromAssets = async (
  assets: MediaLibrary.Asset[]
) => {
  if (!assets.length) return;

  /* 2026.04.22 실시간 업서트 지연을 계측해 메타데이터 누적 처리의 병목 구간을 p50/p95로 확인하기 위해 타이머를 추가 by June */
  const startedAt = Date.now();
  await initPhotoMetadataDb();
  const rows = assets.map(toMetadataRow);
  await upsertPhotoMetadataRows(rows);
  /* 2026.04.22 업서트 배치 크기별 처리 시간을 추적해 동기화 페이지 크기 조정 근거를 확보하기 위해 계측 로그를 추가 by June */
  recordPerfMetric(
    "metadata.upsert_from_assets.ms",
    Date.now() - startedAt,
    {
      context: { assetCount: assets.length },
      logEvery: 3,
    }
  );
};

/* 2026.04.15 증분 동기화를 백그라운드에서 일정 페이지씩 진행해 UI 블로킹 없이 인덱싱을 누적하기 위해 추가 by June */
export const syncPhotoMetadataInBackground = async (params?: {
  maxPages?: number;
}) => {
  if (inFlightSync) {
    return inFlightSync;
  }

  inFlightSync = (async () => {
    await initPhotoMetadataDb();

    const maxPages = params?.maxPages ?? 3;
    let { nextCursor, hasNextPage } = await getPhotoSyncState();

    /* 2026.04.15 이전 동기화가 끝났다면 다음 실행은 첫 페이지부터 재검증하도록 커서를 초기화하기 위해 추가 by June */
    if (!hasNextPage) {
      nextCursor = null;
      hasNextPage = true;
    }

    let pages = 0;
    let cursor = nextCursor;
    /* 2026.04.15 제어흐름 상 true 리터럴로 좁혀지는 타입 문제를 방지해 페이지네이션 상태를 boolean으로 유지하기 위해 수정 by June */
    let keepPaging: boolean = hasNextPage;

    while (keepPaging && pages < maxPages) {
      /* 2026.04.22 페이지 단위 동기화 지연을 측정해 증분 인덱싱 튜닝 지표를 확보하기 위해 루프 타이머를 추가 by June */
      const pageStartedAt = Date.now();
      pages += 1;

      const result = await MediaLibrary.getAssetsAsync({
        first: SYNC_PAGE_SIZE,
        mediaType: MediaLibrary.MediaType.photo,
        after: cursor ?? undefined,
        sortBy: [MediaLibrary.SortBy.creationTime],
      });

      const assets = result.assets ?? [];

      if (assets.length > 0) {
        await upsertPhotoMetadataRows(assets.map(toMetadataRow));
      }

      cursor = result.endCursor ?? null;
      keepPaging = result.hasNextPage;

      await updatePhotoSyncState({
        nextCursor: cursor,
        hasNextPage: keepPaging,
        lastSyncedAt: Date.now(),
      });

      /* 2026.04.22 동기화 페이지 처리 시간을 기록해 사진 수/계속여부와 함께 p50/p95를 분석할 수 있도록 계측을 추가 by June */
      recordPerfMetric("metadata.sync_page.ms", Date.now() - pageStartedAt, {
        context: {
          page: pages,
          assetCount: assets.length,
          keepPaging,
        },
        logEvery: 2,
      });
    }
  })().finally(() => {
    inFlightSync = null;
  });

  return inFlightSync;
};
