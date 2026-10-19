import * as SQLite from "expo-sqlite";
/* 2026.04.15 사진 메타데이터를 앱 내부 SQLite로 관리하기 위한 DB 레이어 파일을 신규 추가 by June */

/* 2026.04.15 메타데이터 전용 DB 파일명/버전을 고정해 추후 마이그레이션 기준점을 만들기 위해 추가 by June */
const DB_NAME = "picqly_metadata.db";
/* 2026.04.15 스키마 변경 시 버전 증가를 통해 구조 변경을 안전하게 적용하기 위해 추가 by June */
const DB_SCHEMA_VERSION = 8;

/* 2026.04.15 DB 핸들을 싱글톤으로 재사용해 중복 open 비용과 상태 불일치를 줄이기 위해 추가 by June */
let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;
/* 2026.04.15 초기화가 중복 실행되며 쓰기 충돌이 발생하지 않도록 init Promise를 재사용하기 위해 추가 by June */
let initPromise: Promise<void> | null = null;
/* 2026.04.15 동시 SQLite write 요청을 직렬화해 트랜잭션 충돌(cannot start transaction within a transaction)을 방지하기 위해 추가 by June */
let writeQueue: Promise<void> = Promise.resolve();

export type PhotoMetadataRow = {
  assetId: string;
  uri: string;
  takenAt: number | null;
  takenMinute: number | null;
  latitude: number | null;
  longitude: number | null;
  createdAt: number;
  updatedAt: number;
  isDeleted: number;
};

/* 2026.04.15 쿼리 결과를 화면용 최소 Photo 형태로 변환하기 위한 타입을 명확히 분리하기 위해 추가 by June */
export type PhotoSummaryRow = {
  assetId: string;
  uri: string;
  takenAt: number | null;
  latitude: number | null;
  longitude: number | null;
  /* 2026.10.18 SQL에서 필터링/표시에 쓰는 장소 컬럼 (국가는 A3 코드) by Claude */
  countryCode: string | null;
  city: string | null;
  cityApprox: string | null;
};

/* 2026.10.18 위치 필터를 SQL WHERE로 내리기 위한 선택 조건 by Claude */
export type PlaceFilter = {
  /* A3 국가 코드 목록 (표시명 아님) */
  countryCodes?: string[];
  cities?: string[];
};

/* 2026.09.02 OFFSET 드리프트 없이 DB 페이지네이션을 이어가기 위한 keyset 커서 타입 추가 by Claude */
export type PhotoPageCursor = {
  takenAt: number;
  assetId: string;
};

/* 2026.04.22 reverse geocode 캐시 입출력 구조를 고정해 위치 성능 개선 로직을 타입 안정적으로 연결하기 위해 추가 by June */
export type GeocodeCacheRow = {
  geoKey: string;
  latitude: number;
  longitude: number;
  country: string | null;
  city: string | null;
  updatedAt: number;
};

/* 2026.04.22 geocode 작업 큐 처리 흐름에서 공통으로 쓰는 작업 row 타입을 명확히 정의하기 위해 추가 by June */
export type GeocodeJobRow = {
  geoKey: string;
  latitude: number;
  longitude: number;
  status: "pending" | "running" | "failed" | "done";
  retryCount: number;
  lastError: string | null;
  updatedAt: number;
};

export type DisplayUriCacheRow = {
  sourceUri: string;
  assetId: string | null;
  displayUri: string;
  updatedAt: number;
};

/* 2026.04.15 DB open 과 초기화 순서를 한 함수로 고정해 호출부에서 안전하게 재사용하기 위해 추가 by June */
const getDb = async () => {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync(DB_NAME);
  }
  return dbPromise;
};

/* 2026.04.15 쓰기 작업을 순차 실행해 rollback/start transaction 충돌 로그를 제거하기 위해 write queue 헬퍼를 추가 by June */
const enqueueWrite = async <T>(task: () => Promise<T>) => {
  const run = writeQueue.then(task, task);
  writeQueue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
};

/* 2026.04.15 메타데이터 테이블/인덱스를 앱 시작 시 1회 보장해 조회/동기화 기준을 통일하기 위해 추가 by June */
export const initPhotoMetadataDb = async () => {
  if (initPromise) return initPromise;

  /* 2026.04.15 스키마 초기화도 write queue에 포함해 앱 시작 직후 동시 업서트와의 충돌을 방지하기 위해 수정 by June */
  initPromise = enqueueWrite(async () => {
    const db = await getDb();

    await db.execAsync(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS photo_metadata (
        asset_id TEXT PRIMARY KEY NOT NULL,
        uri TEXT NOT NULL,
        taken_at INTEGER,
        taken_minute INTEGER,
        latitude REAL,
        longitude REAL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        is_deleted INTEGER NOT NULL DEFAULT 0,
        /* 2026.10.18 위치 필터를 JS가 아닌 SQL에서 처리하기 위해 판별된 장소를 사진 행에 저장.
           국가는 언어가 바뀌어도 유효하도록 A3 코드로 저장하고 표시명은 읽을 때 변환 by Claude */
        country_code TEXT,
        city TEXT,
        city_approx TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_photo_metadata_taken_at
        ON photo_metadata (taken_at ASC);
      
      CREATE INDEX IF NOT EXISTS idx_photo_metadata_taken_at_minute
        ON photo_metadata (taken_at ASC, taken_minute ASC);

      CREATE INDEX IF NOT EXISTS idx_photo_metadata_uri
        ON photo_metadata (uri);

      /* 2026.10.18 국가/도시 + 날짜 복합 필터를 인덱스로 처리하기 위해 추가 by Claude */
      CREATE INDEX IF NOT EXISTS idx_photo_metadata_country_taken
        ON photo_metadata (is_deleted, country_code, taken_at DESC);
      CREATE INDEX IF NOT EXISTS idx_photo_metadata_place_backlog
        ON photo_metadata (is_deleted, country_code, latitude);

      CREATE TABLE IF NOT EXISTS photo_sync_state (
        id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
        next_cursor TEXT,
        has_next_page INTEGER NOT NULL DEFAULT 1,
        last_synced_at INTEGER,
        /* 2026.09.02 재검증 패스 시작 시각을 보존해 완주 시 삭제된 사진 row를 판별하기 위해 추가 by Claude */
        pass_started_at INTEGER,
        /* 2026.10.04 taken_minute 계산 기준 시간대를 보존해 기기 시간대 변경 시 일괄 재계산 트리거로 사용 by Claude */
        time_zone TEXT,
        /* 2026.10.18 네이티브 증분 동기화(변경 토큰/generation) 체크포인트 by Claude */
        native_checkpoint TEXT,
        updated_at INTEGER NOT NULL
      );

      INSERT OR IGNORE INTO photo_sync_state (id, next_cursor, has_next_page, last_synced_at, updated_at)
      VALUES (1, NULL, 1, NULL, strftime('%s','now') * 1000);

      /* 2026.04.22 위치 검색 병목 제거를 위해 lat/lng 정규화 키 기반 geocode 결과 캐시 테이블을 추가 by June */
      CREATE TABLE IF NOT EXISTS geocode_cache (
        geo_key TEXT PRIMARY KEY NOT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        country TEXT,
        city TEXT,
        updated_at INTEGER NOT NULL
      );

      /* 2026.04.22 미처리 위치 데이터에 대한 점진 보강을 위해 geocode 작업 큐 테이블을 추가 by June */
      CREATE TABLE IF NOT EXISTS geocode_jobs (
        geo_key TEXT PRIMARY KEY NOT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        retry_count INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_geocode_jobs_status_updated
        ON geocode_jobs (status ASC, updated_at ASC);

      /* 2026.05.28 앱 재기동 후에도 이미 변환한 iOS ph:// 썸네일 URI를 즉시 재사용하기 위한 display URI 캐시 테이블 추가 by June */
      CREATE TABLE IF NOT EXISTS display_uri_cache (
        source_uri TEXT PRIMARY KEY NOT NULL,
        asset_id TEXT,
        display_uri TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);

    /* 2026.04.15 기존 설치본에도 taken_minute 컬럼을 추가해 장기 범위 시간 필터를 SQL 인덱스로 처리하기 위해 마이그레이션 추가 by June */
    const tableInfo = await db.getAllAsync<{ name: string }>(
      `PRAGMA table_info(photo_metadata)`
    );
    /* 2026.04.15 sqlite 타입 해석이 흔들려도 strict 모드에서 암시적 any 오류를 방지하기 위해 table_info row 타입을 명시 by June */
    const hasTakenMinute = tableInfo.some(
      (c: { name: string }) => c.name === "taken_minute"
    );
    if (!hasTakenMinute) {
      await db.execAsync(`
        ALTER TABLE photo_metadata ADD COLUMN taken_minute INTEGER;
      `);
    }

    /* 2026.04.15 기존 row의 taken_minute를 일괄 계산해 마이그레이션 직후부터 SQL 시간 필터 성능을 확보하기 위해 추가 by June */
    await db.execAsync(`
      UPDATE photo_metadata
      SET taken_minute = CAST(strftime('%H', taken_at / 1000, 'unixepoch', 'localtime') AS INTEGER) * 60
                     + CAST(strftime('%M', taken_at / 1000, 'unixepoch', 'localtime') AS INTEGER)
      WHERE taken_at IS NOT NULL
        AND taken_minute IS NULL;
    `);

    await db.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_photo_metadata_taken_at_minute
        ON photo_metadata (taken_at ASC, taken_minute ASC);
    `);

    await db.execAsync(`
      /* 2026.04.22 기존 설치본에서 geocode_cache/geocode_jobs 누락을 보완하기 위해 마이그레이션 시점에도 테이블/인덱스를 재보장 by June */
      CREATE TABLE IF NOT EXISTS geocode_cache (
        geo_key TEXT PRIMARY KEY NOT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        country TEXT,
        city TEXT,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS geocode_jobs (
        geo_key TEXT PRIMARY KEY NOT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        retry_count INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_geocode_jobs_status_updated
        ON geocode_jobs (status ASC, updated_at ASC);

      /* 2026.05.28 기존 설치본에서도 display URI 캐시 테이블을 보장해 앱 재시작 후 썸네일 재변환을 줄이기 위해 추가 by June */
      CREATE TABLE IF NOT EXISTS display_uri_cache (
        source_uri TEXT PRIMARY KEY NOT NULL,
        asset_id TEXT,
        display_uri TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);

    /* 2026.09.02 기존 설치본에 pass_started_at 컬럼을 추가해 삭제 사진 정리(패스 완주 diff) 기준 시각을 보존하기 위해 마이그레이션 추가 by Claude */
    const syncStateInfo = await db.getAllAsync<{ name: string }>(
      `PRAGMA table_info(photo_sync_state)`
    );
    const hasPassStartedAt = syncStateInfo.some(
      (c: { name: string }) => c.name === "pass_started_at"
    );
    if (!hasPassStartedAt) {
      await db.execAsync(`
        ALTER TABLE photo_sync_state ADD COLUMN pass_started_at INTEGER;
      `);
    }

    /* 2026.10.04 기존 설치본에 time_zone 컬럼 추가 — 시간대 변경 감지용 by Claude */
    const hasTimeZone = syncStateInfo.some(
      (c: { name: string }) => c.name === "time_zone"
    );
    if (!hasTimeZone) {
      await db.execAsync(`
        ALTER TABLE photo_sync_state ADD COLUMN time_zone TEXT;
      `);
    }

    /* 2026.10.18 기존 설치본에 네이티브 동기화 체크포인트 컬럼 추가 by Claude */
    const syncStateColumns = await db.getAllAsync<{ name: string }>(
      `PRAGMA table_info(photo_sync_state)`
    );
    if (
      !syncStateColumns.some(
        (c: { name: string }) => c.name === "native_checkpoint"
      )
    ) {
      await db.execAsync(
        `ALTER TABLE photo_sync_state ADD COLUMN native_checkpoint TEXT;`
      );
    }

    /* 2026.10.18 기존 설치본에 장소 컬럼/인덱스를 추가 (SQL 위치 필터용) by Claude */
    const metaInfo = await db.getAllAsync<{ name: string }>(
      `PRAGMA table_info(photo_metadata)`
    );
    const hasColumn = (name: string) =>
      metaInfo.some((c: { name: string }) => c.name === name);
    if (!hasColumn("country_code")) {
      await db.execAsync(
        `ALTER TABLE photo_metadata ADD COLUMN country_code TEXT;`
      );
    }
    if (!hasColumn("city")) {
      await db.execAsync(`ALTER TABLE photo_metadata ADD COLUMN city TEXT;`);
    }
    if (!hasColumn("city_approx")) {
      await db.execAsync(
        `ALTER TABLE photo_metadata ADD COLUMN city_approx TEXT;`
      );
    }
    await db.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_photo_metadata_country_taken
        ON photo_metadata (is_deleted, country_code, taken_at DESC);
      CREATE INDEX IF NOT EXISTS idx_photo_metadata_place_backlog
        ON photo_metadata (is_deleted, country_code, latitude);
    `);

    await db.execAsync(`PRAGMA user_version = ${DB_SCHEMA_VERSION};`);
  }).catch((err) => {
    /* 2026.04.15 초기화 실패 시 다음 호출에서 재시도 가능하도록 initPromise를 해제하기 위해 추가 by June */
    initPromise = null;
    throw err;
  });

  return initPromise;
};

/* 2026.04.15 대량 upsert를 트랜잭션으로 묶어 동기화 성능 저하와 부분 저장 리스크를 줄이기 위해 추가 by June */
export const upsertPhotoMetadataRows = async (rows: PhotoMetadataRow[]) => {
  if (rows.length === 0) return;

  const db = await getDb();
  /* 2026.04.15 withTransactionAsync 동시 진입 충돌을 피하기 위해 업서트 쓰기를 queue 기반 순차 실행으로 변경 by June */
  /* 2026.10.04 row당 개별 runAsync(페이지당 300회)를 json_each 기반 단일 구문으로 교체해 write queue 점유 시간을 단축 by Claude.
     주의: 변경 없는 row도 updated_at은 항상 갱신해야 함 — 삭제 정리(패스 완주 시
     updated_at < pass_started_at 판정)가 updated_at을 '이번 패스 방문' 마커로 사용하기 때문. */
  await enqueueWrite(async () => {
    await db.runAsync(
      `
      INSERT INTO photo_metadata (
        asset_id,
        uri,
        taken_at,
        taken_minute,
        latitude,
        longitude,
        created_at,
        updated_at,
        is_deleted
      )
      SELECT
        json_extract(value, '$.assetId'),
        json_extract(value, '$.uri'),
        json_extract(value, '$.takenAt'),
        json_extract(value, '$.takenMinute'),
        json_extract(value, '$.latitude'),
        json_extract(value, '$.longitude'),
        json_extract(value, '$.createdAt'),
        json_extract(value, '$.updatedAt'),
        json_extract(value, '$.isDeleted')
      FROM json_each(?)
      WHERE true
      ON CONFLICT(asset_id) DO UPDATE SET
        uri = excluded.uri,
        taken_at = excluded.taken_at,
        taken_minute = excluded.taken_minute,
        /* 2026.05.06 sync 경로에서 위치값이 null일 때 기존 위치 메타를 보존해 회귀 덮어쓰기를 방지하기 위해 COALESCE 적용 by June */
        latitude = COALESCE(excluded.latitude, photo_metadata.latitude),
        longitude = COALESCE(excluded.longitude, photo_metadata.longitude),
        updated_at = excluded.updated_at,
        is_deleted = excluded.is_deleted
      `,
      JSON.stringify(rows)
    );
  });
};

export const getDisplayUriCacheBySourceUris = async (sourceUris: string[]) => {
  await initPhotoMetadataDb();
  const uniqueUris = [...new Set(sourceUris)].filter(Boolean);
  if (uniqueUris.length === 0) return [] as DisplayUriCacheRow[];

  const db = await getDb();
  const placeholders = uniqueUris.map(() => "?").join(",");
  const rows = await db.getAllAsync<{
    source_uri: string;
    asset_id: string | null;
    display_uri: string;
    updated_at: number;
  }>(
    `
    SELECT source_uri, asset_id, display_uri, updated_at
    FROM display_uri_cache
    WHERE source_uri IN (${placeholders})
    `,
    ...uniqueUris
  );

  return rows.map((row) => ({
    sourceUri: row.source_uri,
    assetId: row.asset_id,
    displayUri: row.display_uri,
    updatedAt: row.updated_at,
  }));
};

export const upsertDisplayUriCacheRows = async (
  rows: DisplayUriCacheRow[]
) => {
  if (rows.length === 0) return;
  await initPhotoMetadataDb();
  const db = await getDb();

  await enqueueWrite(async () => {
    for (const row of rows) {
      await db.runAsync(
        `
        INSERT INTO display_uri_cache (
          source_uri,
          asset_id,
          display_uri,
          updated_at
        )
        VALUES (?, ?, ?, ?)
        ON CONFLICT(source_uri) DO UPDATE SET
          asset_id = excluded.asset_id,
          display_uri = excluded.display_uri,
          updated_at = excluded.updated_at
        `,
        row.sourceUri,
        row.assetId,
        row.displayUri,
        row.updatedAt
      );
    }
  });
};

/* 2026.04.15 증분 동기화 재개 지점을 저장/복원해 전체 재탐색 빈도를 줄이기 위해 상태 조회 함수를 추가 by June */
export const getPhotoSyncState = async () => {
  /* 2026.04.15 구버전 스키마에서 조회가 먼저 실행되는 경쟁 상태를 막기 위해 상태 조회 전 초기화를 강제하기 위해 추가 by June */
  await initPhotoMetadataDb();
  const db = await getDb();
  const row = await db.getFirstAsync<{
    next_cursor: string | null;
    has_next_page: number;
    last_synced_at: number | null;
    pass_started_at: number | null;
  }>(
    `
    SELECT next_cursor, has_next_page, last_synced_at, pass_started_at
    FROM photo_sync_state
    WHERE id = 1
    `
  );

  return {
    nextCursor: row?.next_cursor ?? null,
    hasNextPage: (row?.has_next_page ?? 1) === 1,
    lastSyncedAt: row?.last_synced_at ?? null,
    passStartedAt: row?.pass_started_at ?? null,
  };
};

/* 2026.04.15 동기화 진행 상태를 원자적으로 갱신해 앱 재시작 후에도 이어서 동기화하기 위해 추가 by June */
export const updatePhotoSyncState = async (params: {
  nextCursor: string | null;
  hasNextPage: boolean;
  lastSyncedAt: number;
  /* 2026.09.02 패스 시작 시각을 상태와 함께 원자적으로 갱신해 앱 킬 후에도 삭제 판별 기준을 유지하기 위해 추가 by Claude */
  passStartedAt: number | null;
}) => {
  const db = await getDb();

  /* 2026.04.15 sync_state 업데이트도 다른 쓰기와 직렬화해 트랜잭션 경합을 방지하기 위해 수정 by June */
  await enqueueWrite(async () => {
    await db.runAsync(
      `
      UPDATE photo_sync_state
      SET next_cursor = ?,
          has_next_page = ?,
          last_synced_at = ?,
          pass_started_at = ?,
          updated_at = ?
      WHERE id = 1
      `,
      params.nextCursor,
      params.hasNextPage ? 1 : 0,
      params.lastSyncedAt,
      params.passStartedAt,
      Date.now()
    );
  });
};

/* 2026.10.04 기기 시간대 변경(여행/DST) 시 taken_minute를 캐시된 타임스탬프에서 일괄 재계산 — 라이브러리/네트워크 재조회 없음.
   photo_metadata.updated_at은 갱신하지 않음(삭제 정리의 '패스 방문' 마커이므로) by Claude */
export const ensureTakenMinutesMatchTimeZone = async (
  currentTimeZone: string
) => {
  await initPhotoMetadataDb();
  const db = await getDb();

  const row = await db.getFirstAsync<{ time_zone: string | null }>(
    `SELECT time_zone FROM photo_sync_state WHERE id = 1`
  );
  const storedTimeZone = row?.time_zone ?? null;
  if (storedTimeZone === currentTimeZone) {
    return { updated: false, changedRows: 0 };
  }

  let changedRows = 0;
  await enqueueWrite(async () => {
    /* SQLite 'localtime'은 현재 기기 시간대로 계산되므로 전체 재계산을 단일 구문으로 수행 (기존 taken_minute 마이그레이션과 동일 방식) */
    const result = await db.runAsync(
      `
      UPDATE photo_metadata
      SET taken_minute = CAST(strftime('%H', taken_at / 1000, 'unixepoch', 'localtime') AS INTEGER) * 60
                       + CAST(strftime('%M', taken_at / 1000, 'unixepoch', 'localtime') AS INTEGER)
      WHERE taken_at IS NOT NULL
      `
    );
    changedRows = result.changes ?? 0;
    await db.runAsync(
      `UPDATE photo_sync_state SET time_zone = ?, updated_at = ? WHERE id = 1`,
      currentTimeZone,
      Date.now()
    );
  });

  return { updated: true, changedRows };
};

/* 2026.09.02 재검증 패스 완주 시 방문되지 않은(=라이브러리에서 삭제된) row를 일괄 soft-delete 처리하기 위해 추가 by Claude */
export const markPhotoMetadataDeletedBefore = async (cutoffMs: number) => {
  await initPhotoMetadataDb();
  const db = await getDb();

  let changes = 0;
  await enqueueWrite(async () => {
    const result = await db.runAsync(
      `
      UPDATE photo_metadata
      SET is_deleted = 1,
          updated_at = ?
      WHERE is_deleted = 0
        AND updated_at < ?
      `,
      Date.now(),
      cutoffMs
    );
    changes = result.changes ?? 0;
  });

  return changes;
};

/* 2026.04.15 DB 적재량을 확인해 초기 인덱싱 진행률/완료 여부 판단에 쓰기 위해 카운트 함수를 추가 by June */
export const getPhotoMetadataCount = async () => {
  /* 2026.04.15 앱 시작 직후 카운트 조회가 마이그레이션보다 먼저 실행되는 문제를 막기 위해 초기화를 선행하도록 추가 by June */
  await initPhotoMetadataDb();
  const db = await getDb();
  const row = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM photo_metadata WHERE is_deleted = 0`
  );
  return row?.count ?? 0;
};

/* 2026.04.22 All Dates 프리셋 시작일을 1970 고정값이 아닌 실제 보유 사진의 최저 촬영일로 계산하기 위해 최소 taken_at 조회 함수를 추가 by June */
export const getOldestPhotoTakenAt = async () => {
  /* 2026.04.22 최소 날짜 조회가 마이그레이션 이전에 실행되며 컬럼 누락 오류가 나는 상황을 방지하기 위해 초기화 선행을 보장 by June */
  await initPhotoMetadataDb();
  const db = await getDb();
  const row = await db.getFirstAsync<{ oldestTakenAt: number | null }>(
    `
    SELECT MIN(taken_at) as oldestTakenAt
    FROM photo_metadata
    WHERE is_deleted = 0
      AND taken_at IS NOT NULL
    `
  );
  return row?.oldestTakenAt ?? null;
};

/* 2026.04.22 geocode 캐시 조회를 key 단위로 제공해 reverse geocode 호출 전 캐시 hit 여부를 빠르게 판단하기 위해 추가 by June */
export const getGeocodeCacheByKey = async (geoKey: string) => {
  await initPhotoMetadataDb();
  const db = await getDb();

  const row = await db.getFirstAsync<{
    geo_key: string;
    latitude: number;
    longitude: number;
    country: string | null;
    city: string | null;
    updated_at: number;
  }>(
    `
    SELECT geo_key, latitude, longitude, country, city, updated_at
    FROM geocode_cache
    WHERE geo_key = ?
    `,
    geoKey
  );

  if (!row) return null;

  return {
    geoKey: row.geo_key,
    latitude: row.latitude,
    longitude: row.longitude,
    country: row.country,
    city: row.city,
    updatedAt: row.updated_at,
  } as GeocodeCacheRow;
};

/* 2026.04.22 geocode 결과를 영속 캐시에 저장해 동일 좌표 재탐색 시 reverse geocode를 재호출하지 않기 위해 추가 by June */
export const upsertGeocodeCacheRows = async (rows: GeocodeCacheRow[]) => {
  if (rows.length === 0) return;
  await initPhotoMetadataDb();
  const db = await getDb();

  await enqueueWrite(async () => {
    for (const row of rows) {
      await db.runAsync(
        `
        INSERT INTO geocode_cache (
          geo_key,
          latitude,
          longitude,
          country,
          city,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(geo_key) DO UPDATE SET
          latitude = excluded.latitude,
          longitude = excluded.longitude,
          country = excluded.country,
          city = excluded.city,
          updated_at = excluded.updated_at
        `,
        row.geoKey,
        row.latitude,
        row.longitude,
        row.country,
        row.city,
        row.updatedAt
      );
    }
  });
};

/* 2026.04.22 캐시 miss 좌표를 geocode 작업 큐에 누적해 추후 백그라운드 보강 처리 대상으로 관리하기 위해 추가 by June */
export const enqueueGeocodeJobs = async (
  rows: Array<{ geoKey: string; latitude: number; longitude: number }>
) => {
  if (rows.length === 0) return;
  await initPhotoMetadataDb();
  const db = await getDb();

  await enqueueWrite(async () => {
    for (const row of rows) {
      await db.runAsync(
        `
        INSERT INTO geocode_jobs (
          geo_key,
          latitude,
          longitude,
          status,
          retry_count,
          updated_at
        )
        VALUES (?, ?, ?, 'pending', 0, ?)
        ON CONFLICT(geo_key) DO NOTHING
        `,
        row.geoKey,
        row.latitude,
        row.longitude,
        Date.now()
      );
    }
  });
};

/* 2026.09.02 위치 보강을 사진 단위가 아닌 geo-key 단위로 처리하기 위한 배치 캐시 조회 추가 — 수백 건 직렬 조회를 1회 쿼리로 대체 by Claude */
export const getGeocodeCacheByKeys = async (geoKeys: string[]) => {
  const result = new Map<string, { country: string | null; city: string | null }>();
  const uniqueKeys = [...new Set(geoKeys)].filter(Boolean);
  if (uniqueKeys.length === 0) return result;

  await initPhotoMetadataDb();
  const db = await getDb();

  /* 2026.09.02 IN 파라미터 상한을 피하기 위해 500개 단위로 나눠 조회 by Claude */
  for (let i = 0; i < uniqueKeys.length; i += 500) {
    const chunk = uniqueKeys.slice(i, i + 500);
    const placeholders = chunk.map(() => "?").join(",");
    const rows = await db.getAllAsync<{
      geo_key: string;
      country: string | null;
      city: string | null;
    }>(
      `
      SELECT geo_key, country, city
      FROM geocode_cache
      WHERE geo_key IN (${placeholders})
      `,
      ...chunk
    );
    for (const row of rows) {
      result.set(row.geo_key, { country: row.country, city: row.city });
    }
  }

  return result;
};

/* 2026.09.02 라이브러리 전체 위치를 한 번에 시딩하기 위해 인덱싱된 사진의 고유 좌표를 조회 — 라운딩/키 생성은 JS(toFixed)와 일치시키기 위해 호출부에서 수행 by Claude */
export const getDistinctPhotoCoords = async () => {
  await initPhotoMetadataDb();
  const db = await getDb();
  const rows = await db.getAllAsync<{ latitude: number; longitude: number }>(
    `
    SELECT DISTINCT latitude, longitude
    FROM photo_metadata
    WHERE is_deleted = 0
      AND latitude IS NOT NULL
      AND longitude IS NOT NULL
      /* 2026.10.12 back-fill이 'GPS 없음'을 0/0으로 표시하므로 지오코딩 시딩 대상에서 제외 by Claude */
      AND NOT (latitude = 0 AND longitude = 0)
    `
  );
  return rows;
};

/* 2026.09.02 시딩 시 이미 캐시되었거나 큐에 있는 geo-key를 제외하기 위한 필터 조회 추가 by Claude */
export const filterUncachedGeoKeys = async (geoKeys: string[]) => {
  const uniqueKeys = [...new Set(geoKeys)].filter(Boolean);
  if (uniqueKeys.length === 0) return [] as string[];

  await initPhotoMetadataDb();
  const db = await getDb();

  const known = new Set<string>();
  for (let i = 0; i < uniqueKeys.length; i += 500) {
    const chunk = uniqueKeys.slice(i, i + 500);
    const placeholders = chunk.map(() => "?").join(",");
    const cachedRows = await db.getAllAsync<{ geo_key: string }>(
      `SELECT geo_key FROM geocode_cache WHERE geo_key IN (${placeholders})`,
      ...chunk
    );
    for (const row of cachedRows) known.add(row.geo_key);
    const jobRows = await db.getAllAsync<{ geo_key: string }>(
      `SELECT geo_key FROM geocode_jobs WHERE geo_key IN (${placeholders})`,
      ...chunk
    );
    for (const row of jobRows) known.add(row.geo_key);
  }

  return uniqueKeys.filter((key) => !known.has(key));
};

/* 2026.04.22 지오코딩 캐시 누적량을 UI 진행표시에 활용하기 위해 캐시 row 카운트 조회 함수를 추가 by June */
export const getGeocodeCacheCount = async () => {
  await initPhotoMetadataDb();
  const db = await getDb();
  const row = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM geocode_cache`
  );
  return row?.count ?? 0;
};

/* 2026.04.22 미처리 지오코딩 대기량을 UI에 표시하기 위해 pending/running 작업 카운트 조회 함수를 추가 by June */
export const getGeocodePendingJobCount = async () => {
  await initPhotoMetadataDb();
  const db = await getDb();
  const row = await db.getFirstAsync<{ count: number }>(
    `
    SELECT COUNT(*) as count
    FROM geocode_jobs
    WHERE status IN ('pending', 'running')
    `
  );
  return row?.count ?? 0;
};

/* 2026.09.02 앱 킬로 running에 고착된 작업(5분 초과)과 오래된 failed(7일 초과)를 pending으로 복귀시켜 큐가 영구히 막히지 않도록 추가 by Claude */
export const resetStuckGeocodeJobs = async () => {
  await initPhotoMetadataDb();
  const db = await getDb();

  const now = Date.now();
  const RUNNING_STALE_MS = 5 * 60 * 1000;
  const FAILED_RETRY_MS = 7 * 24 * 60 * 60 * 1000;

  let resetRunning = 0;
  let resetFailed = 0;
  await enqueueWrite(async () => {
    const runningResult = await db.runAsync(
      `
      UPDATE geocode_jobs
      SET status = 'pending',
          updated_at = ?
      WHERE status = 'running'
        AND updated_at < ?
      `,
      now,
      now - RUNNING_STALE_MS
    );
    resetRunning = runningResult.changes ?? 0;

    const failedResult = await db.runAsync(
      `
      UPDATE geocode_jobs
      SET status = 'pending',
          retry_count = 0,
          updated_at = ?
      WHERE status = 'failed'
        AND updated_at < ?
      `,
      now,
      now - FAILED_RETRY_MS
    );
    resetFailed = failedResult.changes ?? 0;
  });

  return { resetRunning, resetFailed };
};

/* 2026.10.11 보이는 사진의 geo-key를 큐 앞으로 당기기 위해 추가 — claim이 updated_at ASC 순서라 0으로 당기면 우선 처리됨 by Claude */
export const prioritizeGeocodeJobs = async (geoKeys: string[]) => {
  const uniqueKeys = [...new Set(geoKeys)].filter(Boolean);
  if (uniqueKeys.length === 0) return;

  await initPhotoMetadataDb();
  const db = await getDb();

  await enqueueWrite(async () => {
    for (let i = 0; i < uniqueKeys.length; i += 500) {
      const chunk = uniqueKeys.slice(i, i + 500);
      const placeholders = chunk.map(() => "?").join(",");
      await db.runAsync(
        `
        UPDATE geocode_jobs
        SET updated_at = 0
        WHERE status = 'pending'
          AND geo_key IN (${placeholders})
        `,
        ...chunk
      );
    }
  });
};

/* 2026.09.02 스로틀링 감지 시 재시도 카운트를 소모하지 않고 작업을 큐로 되돌리기 위해 추가 by Claude */
export const requeueGeocodeJob = async (geoKey: string) => {
  await initPhotoMetadataDb();
  const db = await getDb();

  await enqueueWrite(async () => {
    await db.runAsync(
      `
      UPDATE geocode_jobs
      SET status = 'pending',
          updated_at = ?
      WHERE geo_key = ?
      `,
      Date.now(),
      geoKey
    );
  });
};

/* 2026.04.22 백그라운드 워커가 처리할 geocode 작업을 선점(claim)해 중복 처리 경쟁을 방지하기 위해 추가 by June */
export const claimPendingGeocodeJobs = async (limit: number) => {
  if (limit <= 0) return [] as GeocodeJobRow[];
  await initPhotoMetadataDb();
  const db = await getDb();

  return enqueueWrite(async () => {
    const rows = await db.getAllAsync<{
      geo_key: string;
      latitude: number;
      longitude: number;
      status: string;
      retry_count: number;
      last_error: string | null;
      updated_at: number;
    }>(
      `
      SELECT geo_key, latitude, longitude, status, retry_count, last_error, updated_at
      FROM geocode_jobs
      WHERE status = 'pending'
      ORDER BY updated_at ASC
      LIMIT ?
      `,
      limit
    );

    if (rows.length === 0) return [] as GeocodeJobRow[];

    for (const row of rows) {
      await db.runAsync(
        `
        UPDATE geocode_jobs
        SET status = 'running',
            updated_at = ?
        WHERE geo_key = ?
          AND status = 'pending'
        `,
        Date.now(),
        row.geo_key
      );
    }

    /* 2026.04.22 sqlite 제네릭 추론 실패 시에도 strict 모드에서 암시적 any 오류를 방지하기 위해 map row 타입을 명시 by June */
    return rows.map(
      (row: {
        geo_key: string;
        latitude: number;
        longitude: number;
        status: string;
        retry_count: number;
        last_error: string | null;
        updated_at: number;
      }) => ({
        geoKey: row.geo_key,
        latitude: row.latitude,
        longitude: row.longitude,
        status: "running" as const,
        retryCount: row.retry_count,
        lastError: row.last_error,
        updatedAt: row.updated_at,
      })
    );
  });
};

/* 2026.04.22 geocode 성공 작업을 done 처리해 큐 잔량/재시도 흐름을 정확히 관리하기 위해 추가 by June */
export const markGeocodeJobDone = async (geoKey: string) => {
  await initPhotoMetadataDb();
  const db = await getDb();

  await enqueueWrite(async () => {
    await db.runAsync(
      `
      UPDATE geocode_jobs
      SET status = 'done',
          last_error = NULL,
          updated_at = ?
      WHERE geo_key = ?
      `,
      Date.now(),
      geoKey
    );
  });
};

/* 2026.04.22 geocode 실패 시 재시도 카운트를 증가시키고 임계치 초과 시 failed로 전환하기 위해 추가 by June */
export const markGeocodeJobFailed = async (params: {
  geoKey: string;
  errorMessage: string;
  maxRetry: number;
}) => {
  await initPhotoMetadataDb();
  const db = await getDb();

  await enqueueWrite(async () => {
    const row = await db.getFirstAsync<{ retry_count: number }>(
      `
      SELECT retry_count
      FROM geocode_jobs
      WHERE geo_key = ?
      `,
      params.geoKey
    );

    const retryCount = (row?.retry_count ?? 0) + 1;
    const nextStatus = retryCount >= params.maxRetry ? "failed" : "pending";

    await db.runAsync(
      `
      UPDATE geocode_jobs
      SET status = ?,
          retry_count = ?,
          last_error = ?,
          updated_at = ?
      WHERE geo_key = ?
      `,
      nextStatus,
      retryCount,
      params.errorMessage,
      Date.now(),
      params.geoKey
    );
  });
};

/* 2026.10.18 국가/도시 조건을 SQL로 내리는 공통 빌더 — 도시는 정밀(city)과 근사(city_approx) 양쪽 매칭 by Claude */
const buildPlaceClause = (place?: PlaceFilter) => {
  const clauses: string[] = [];
  const args: string[] = [];
  const countryCodes = (place?.countryCodes ?? []).filter(Boolean);
  const cities = (place?.cities ?? []).filter(Boolean);

  if (countryCodes.length > 0) {
    clauses.push(
      `AND country_code IN (${countryCodes.map(() => "?").join(",")})`
    );
    args.push(...countryCodes);
  }
  if (cities.length > 0) {
    const placeholders = cities.map(() => "?").join(",");
    clauses.push(
      `AND (city IN (${placeholders}) OR (city IS NULL AND city_approx IN (${placeholders})))`
    );
    args.push(...cities, ...cities);
  }

  return { sql: clauses.join("\n      "), args };
};

/* 2026.10.18 장소 판별이 아직 안 된(좌표는 있고 country가 비어있는) 사진을 백그라운드 보강 대상으로 조회 by Claude */
export const getPhotosMissingPlace = async (limit: number) => {
  await initPhotoMetadataDb();
  const db = await getDb();
  return db.getAllAsync<{
    assetId: string;
    latitude: number;
    longitude: number;
  }>(
    `
    SELECT asset_id as assetId, latitude, longitude
    FROM photo_metadata
    WHERE is_deleted = 0
      AND country_code IS NULL
      AND latitude IS NOT NULL
      AND longitude IS NOT NULL
      AND NOT (latitude = 0 AND longitude = 0)
    ORDER BY taken_at DESC
    LIMIT ?
    `,
    limit
  );
};

/* 2026.10.18 정밀 도시가 아직 비어 있는 사진을 taken_at 커서로 한 바퀴 순회 — 지오코드 캐시가
   채워진 뒤 그 결과를 사진 행에 영속화하기 위한 조회(세션 간 정밀 도시 유지) by Claude */
export const getPhotosMissingCityPage = async (params: {
  afterTakenAt: number | null;
  limit: number;
}) => {
  await initPhotoMetadataDb();
  const db = await getDb();
  const cursorClause = params.afterTakenAt !== null ? "AND taken_at < ?" : "";
  const args: number[] =
    params.afterTakenAt !== null
      ? [params.afterTakenAt, params.limit]
      : [params.limit];
  return db.getAllAsync<{
    assetId: string;
    latitude: number;
    longitude: number;
    takenAt: number;
  }>(
    `
    SELECT asset_id as assetId, latitude, longitude, taken_at as takenAt
    FROM photo_metadata
    WHERE is_deleted = 0
      AND city IS NULL
      AND taken_at IS NOT NULL
      AND latitude IS NOT NULL
      AND longitude IS NOT NULL
      AND NOT (latitude = 0 AND longitude = 0)
      ${cursorClause}
    ORDER BY taken_at DESC
    LIMIT ?
    `,
    ...args
  );
};

/* 2026.10.18 판별된 장소를 사진 행에 일괄 기록 — updated_at은 삭제 정리 마커이므로 건드리지 않음 by Claude */
export const updatePhotoPlacesByAssetIds = async (
  rows: {
    assetId: string;
    countryCode: string | null;
    city: string | null;
    cityApprox: string | null;
  }[]
) => {
  if (rows.length === 0) return;
  await initPhotoMetadataDb();
  const db = await getDb();

  await enqueueWrite(async () => {
    await db.runAsync(
      `
      UPDATE photo_metadata SET
        country_code = COALESCE(json_extract(r.value, '$.countryCode'), photo_metadata.country_code),
        city = COALESCE(json_extract(r.value, '$.city'), photo_metadata.city),
        city_approx = COALESCE(json_extract(r.value, '$.cityApprox'), photo_metadata.city_approx)
      FROM json_each(?) AS r
      WHERE photo_metadata.asset_id = json_extract(r.value, '$.assetId')
      `,
      JSON.stringify(rows)
    );
  });
};

/* 2026.10.18 장소 보강 잔여량 — 진행 표시/추정에 사용 by Claude */
export const countPhotosMissingPlace = async () => {
  await initPhotoMetadataDb();
  const db = await getDb();
  const row = await db.getFirstAsync<{ count: number }>(
    `
    SELECT COUNT(*) as count
    FROM photo_metadata
    WHERE is_deleted = 0
      AND country_code IS NULL
      AND latitude IS NOT NULL
      AND longitude IS NOT NULL
      AND NOT (latitude = 0 AND longitude = 0)
    `
  );
  return row?.count ?? 0;
};

/* 2026.10.18 현재 보유한 장소 목록을 SQL로 집계 — 선택기 목록을 메모리 사진 배열이 아닌 DB에서 구성 by Claude */
export const getDistinctPlaces = async () => {
  await initPhotoMetadataDb();
  const db = await getDb();
  return db.getAllAsync<{
    countryCode: string | null;
    city: string | null;
    cityApprox: string | null;
  }>(
    `
    SELECT DISTINCT country_code as countryCode, city, city_approx as cityApprox
    FROM photo_metadata
    WHERE is_deleted = 0
      AND country_code IS NOT NULL
    `
  );
};

/* 2026.04.15 날짜/시간 필터에 대응하는 DB 조회 경로를 준비해 이후 MediaLibrary 전수탐색 제거 기반을 만들기 위해 추가 by June */
export const queryPhotoMetadataByDateTime = async (params: {
  dateStartMs: number;
  dateEndNextMs: number;
  timeStart: number;
  timeEnd: number;
  limit: number;
  /* 2026.09.02 백그라운드 인덱싱 중 row 삽입으로 OFFSET이 밀리는 문제를 없애기 위해 keyset 커서 기반 페이지네이션으로 교체 by Claude */
  after?: PhotoPageCursor | null;
  /* 2026.10.18 국가/도시 조건을 SQL로 처리 by Claude */
  place?: PlaceFilter;
}) => {
  /* 2026.04.15 taken_minute 컬럼 추가 전 쿼리 실행으로 no such column 에러가 나는 문제를 막기 위해 조회 전 초기화를 강제 by June */
  await initPhotoMetadataDb();
  const db = await getDb();

  const after = params.after ?? null;
  /* 2026.09.02 커서가 있으면 (taken_at, asset_id)보다 과거인 row만 조회해 동시 삽입에도 페이지 경계가 흔들리지 않도록 함 by Claude */
  const keysetClause = after
    ? "AND (taken_at < ? OR (taken_at = ? AND asset_id < ?))"
    : "";
  const keysetArgs: (number | string)[] = after
    ? [after.takenAt, after.takenAt, after.assetId]
    : [];
  const placeFilter = buildPlaceClause(params.place);

  const rows = await db.getAllAsync<PhotoSummaryRow>(
    `
    SELECT asset_id as assetId, uri, taken_at as takenAt, latitude, longitude,
           country_code as countryCode, city, city_approx as cityApprox
    FROM photo_metadata
    WHERE is_deleted = 0
      /* 2026.04.22 날짜 검색 정확도 우선 정책으로 unknown timestamp row를 제외해 잘못된 연도 노출을 방지하기 위해 조건 수정 by June */
      AND taken_at IS NOT NULL
      AND taken_at >= ?
      AND taken_at < ?
      AND (
        (? = 1439 AND taken_minute >= ? AND taken_minute <= 1439)
        OR (? >= ? AND taken_minute >= ? AND taken_minute <= ?)
        OR (? < ? AND taken_minute >= ? AND taken_minute <= ?)
      )
      ${placeFilter.sql}
      ${keysetClause}
    ORDER BY
      /* 2026.05.28 홈 썸네일 정책과 동일하게 최신 사진이 먼저 나오도록 DB 조회 정렬을 최신순으로 변경 by June */
      taken_at DESC,
      /* 2026.09.02 같은 촬영 시각에서 페이지 경계가 흔들리지 않도록 asset_id를 2차 정렬 키로 고정 by Claude */
      asset_id DESC
    LIMIT ?
    `,
    params.dateStartMs,
    params.dateEndNextMs,
    params.timeEnd,
    params.timeStart,
    params.timeEnd,
    params.timeStart,
    params.timeStart,
    params.timeEnd,
    params.timeEnd,
    params.timeStart,
    params.timeStart,
    params.timeEnd,
    ...placeFilter.args,
    ...keysetArgs,
    params.limit
  );

  /* 2026.04.15 시간 필터를 SQL로 완전 이관해 긴 기간 검색 시 JS 후처리 비용을 제거하기 위해 반환 필터를 제거 by June */
  return rows;
};

/* 2026.10.04 검색 예상 시간을 '남은 실제 작업량'으로 계산하기 위해 범위 내 좌표 미보유 사진 수를 조회 by Claude */
/* 2026.10.18 네이티브 증분 동기화 체크포인트 읽기/쓰기 by Claude */
export const getNativeSyncCheckpoint = async () => {
  await initPhotoMetadataDb();
  const db = await getDb();
  const row = await db.getFirstAsync<{ native_checkpoint: string | null }>(
    `SELECT native_checkpoint FROM photo_sync_state WHERE id = 1`
  );
  return row?.native_checkpoint ?? null;
};

export const setNativeSyncCheckpoint = async (checkpoint: string | null) => {
  await initPhotoMetadataDb();
  const db = await getDb();
  await enqueueWrite(async () => {
    await db.runAsync(
      `UPDATE photo_sync_state SET native_checkpoint = ?, updated_at = ? WHERE id = 1`,
      checkpoint,
      Date.now()
    );
  });
};

/* 2026.10.18 네이티브 델타가 알려준 삭제 자산을 즉시 soft-delete 처리 by Claude */
export const markPhotoMetadataDeletedByAssetIds = async (assetIds: string[]) => {
  const unique = [...new Set(assetIds)].filter(Boolean);
  if (unique.length === 0) return 0;
  await initPhotoMetadataDb();
  const db = await getDb();
  let changes = 0;
  await enqueueWrite(async () => {
    for (let i = 0; i < unique.length; i += 500) {
      const chunk = unique.slice(i, i + 500);
      const placeholders = chunk.map(() => "?").join(",");
      const result = await db.runAsync(
        `
        UPDATE photo_metadata
        SET is_deleted = 1, updated_at = ?
        WHERE is_deleted = 0
          AND asset_id IN (${placeholders})
        `,
        Date.now(),
        ...chunk
      );
      changes += result.changes ?? 0;
    }
  });
  return changes;
};

/* 2026.10.12 좌표 미보유 사진을 백그라운드에서 일괄 back-fill 하기 위해 최신순으로 조회 by Claude */
export const getPhotosMissingCoords = async (limit: number) => {
  await initPhotoMetadataDb();
  const db = await getDb();
  const rows = await db.getAllAsync<{ assetId: string }>(
    `
    SELECT asset_id as assetId
    FROM photo_metadata
    WHERE is_deleted = 0
      AND latitude IS NULL
      AND taken_at IS NOT NULL
    ORDER BY taken_at DESC
    LIMIT ?
    `,
    limit
  );
  return rows.map((row) => row.assetId);
};

export const countPhotosMissingCoordsByDateTime = async (params: {
  dateStartMs: number;
  dateEndNextMs: number;
  timeStart: number;
  timeEnd: number;
}) => {
  await initPhotoMetadataDb();
  const db = await getDb();

  const row = await db.getFirstAsync<{ count: number }>(
    `
    SELECT COUNT(*) as count
    FROM photo_metadata
    WHERE is_deleted = 0
      AND latitude IS NULL
      AND taken_at IS NOT NULL
      AND taken_at >= ?
      AND taken_at < ?
      AND (
        (? = 1439 AND taken_minute >= ? AND taken_minute <= 1439)
        OR (? >= ? AND taken_minute >= ? AND taken_minute <= ?)
        OR (? < ? AND taken_minute >= ? AND taken_minute <= ?)
      )
    `,
    params.dateStartMs,
    params.dateEndNextMs,
    params.timeEnd,
    params.timeStart,
    params.timeEnd,
    params.timeStart,
    params.timeStart,
    params.timeEnd,
    params.timeEnd,
    params.timeStart,
    params.timeStart,
    params.timeEnd
  );

  return row?.count ?? 0;
};

/* 2026.10.04 검색 중 네이티브 조회로 복구한 좌표를 DB에 영속화 — 같은 사진의 좌표 복구 비용을 평생 1회로 제한 by Claude.
   updated_at은 갱신하지 않음(삭제 정리의 '패스 방문' 마커이므로) */
export const updatePhotoCoordinatesByAssetIds = async (
  rows: { assetId: string; latitude: number; longitude: number }[]
) => {
  const valid = rows.filter(
    (r) =>
      r.assetId &&
      Number.isFinite(r.latitude) &&
      Number.isFinite(r.longitude)
  );
  if (valid.length === 0) return;

  await initPhotoMetadataDb();
  const db = await getDb();

  await enqueueWrite(async () => {
    await db.runAsync(
      `
      UPDATE photo_metadata SET
        latitude = json_extract(r.value, '$.latitude'),
        longitude = json_extract(r.value, '$.longitude')
      FROM json_each(?) AS r
      WHERE photo_metadata.asset_id = json_extract(r.value, '$.id')
      `,
      JSON.stringify(
        valid.map((r) => ({
          id: r.assetId,
          latitude: r.latitude,
          longitude: r.longitude,
        }))
      )
    );
  });
};

/* 2026.04.22 날짜/시간 필터 범위의 전체 대상 건수를 즉시 계산해 로딩 프로그레스(표출/전체)를 정확히 표시하기 위해 COUNT 쿼리 함수를 추가 by June */
export const countPhotoMetadataByDateTime = async (params: {
  dateStartMs: number;
  dateEndNextMs: number;
  timeStart: number;
  timeEnd: number;
  /* 2026.10.18 위치 필터가 걸린 범위의 건수도 SQL로 계산 by Claude */
  place?: PlaceFilter;
}) => {
  /* 2026.04.22 카운트 조회도 스키마 초기화 이후에 실행되도록 보장해 구버전 DB에서 컬럼 누락 오류를 방지하기 위해 초기화 선행 by June */
  await initPhotoMetadataDb();
  const db = await getDb();
  const placeFilter = buildPlaceClause(params.place);

  const row = await db.getFirstAsync<{ count: number }>(
    `
    SELECT COUNT(*) as count
    FROM photo_metadata
    WHERE is_deleted = 0
      AND taken_at IS NOT NULL
      AND taken_at >= ?
      AND taken_at < ?
      AND (
        (? = 1439 AND taken_minute >= ? AND taken_minute <= 1439)
        OR (? >= ? AND taken_minute >= ? AND taken_minute <= ?)
        OR (? < ? AND taken_minute >= ? AND taken_minute <= ?)
      )
      ${placeFilter.sql}
    `,
    params.dateStartMs,
    params.dateEndNextMs,
    params.timeEnd,
    params.timeStart,
    params.timeEnd,
    params.timeStart,
    params.timeStart,
    params.timeEnd,
    params.timeEnd,
    params.timeStart,
    params.timeStart,
    params.timeEnd,
    ...placeFilter.args
  );

  return row?.count ?? 0;
};
