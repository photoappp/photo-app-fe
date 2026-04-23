import * as SQLite from "expo-sqlite";
/* 2026.04.15 사진 메타데이터를 앱 내부 SQLite로 관리하기 위한 DB 레이어 파일을 신규 추가 by June */

/* 2026.04.15 메타데이터 전용 DB 파일명/버전을 고정해 추후 마이그레이션 기준점을 만들기 위해 추가 by June */
const DB_NAME = "picqly_metadata.db";
/* 2026.04.15 스키마 변경 시 버전 증가를 통해 구조 변경을 안전하게 적용하기 위해 추가 by June */
const DB_SCHEMA_VERSION = 3;

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
  uri: string;
  takenAt: number | null;
  latitude: number | null;
  longitude: number | null;
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
        is_deleted INTEGER NOT NULL DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_photo_metadata_taken_at
        ON photo_metadata (taken_at ASC);
      
      CREATE INDEX IF NOT EXISTS idx_photo_metadata_taken_at_minute
        ON photo_metadata (taken_at ASC, taken_minute ASC);

      CREATE INDEX IF NOT EXISTS idx_photo_metadata_uri
        ON photo_metadata (uri);

      CREATE TABLE IF NOT EXISTS photo_sync_state (
        id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
        next_cursor TEXT,
        has_next_page INTEGER NOT NULL DEFAULT 1,
        last_synced_at INTEGER,
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
    `);

    /* 2026.04.15 기존 설치본에도 taken_minute 컬럼을 추가해 장기 범위 시간 필터를 SQL 인덱스로 처리하기 위해 마이그레이션 추가 by June */
    const tableInfo = await db.getAllAsync<{ name: string }>(
      `PRAGMA table_info(photo_metadata)`
    );
    const hasTakenMinute = tableInfo.some((c) => c.name === "taken_minute");
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
  await enqueueWrite(async () => {
    for (const row of rows) {
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
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(asset_id) DO UPDATE SET
          uri = excluded.uri,
          taken_at = excluded.taken_at,
          taken_minute = excluded.taken_minute,
          latitude = excluded.latitude,
          longitude = excluded.longitude,
          updated_at = excluded.updated_at,
          is_deleted = excluded.is_deleted
        `,
        row.assetId,
        row.uri,
        row.takenAt,
        row.takenMinute,
        row.latitude,
        row.longitude,
        row.createdAt,
        row.updatedAt,
        row.isDeleted
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
  }>(
    `
    SELECT next_cursor, has_next_page, last_synced_at
    FROM photo_sync_state
    WHERE id = 1
    `
  );

  return {
    nextCursor: row?.next_cursor ?? null,
    hasNextPage: (row?.has_next_page ?? 1) === 1,
    lastSyncedAt: row?.last_synced_at ?? null,
  };
};

/* 2026.04.15 동기화 진행 상태를 원자적으로 갱신해 앱 재시작 후에도 이어서 동기화하기 위해 추가 by June */
export const updatePhotoSyncState = async (params: {
  nextCursor: string | null;
  hasNextPage: boolean;
  lastSyncedAt: number;
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
          updated_at = ?
      WHERE id = 1
      `,
      params.nextCursor,
      params.hasNextPage ? 1 : 0,
      params.lastSyncedAt,
      Date.now()
    );
  });
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

    return rows.map((row) => ({
      geoKey: row.geo_key,
      latitude: row.latitude,
      longitude: row.longitude,
      status: "running" as const,
      retryCount: row.retry_count,
      lastError: row.last_error,
      updatedAt: row.updated_at,
    }));
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

/* 2026.04.15 날짜/시간 필터에 대응하는 DB 조회 경로를 준비해 이후 MediaLibrary 전수탐색 제거 기반을 만들기 위해 추가 by June */
export const queryPhotoMetadataByDateTime = async (params: {
  dateStartMs: number;
  dateEndNextMs: number;
  timeStart: number;
  timeEnd: number;
  limit: number;
  /* 2026.04.22 날짜/시간 DB 결과를 스크롤 append로 이어붙이기 위해 OFFSET 기반 페이지네이션 파라미터를 추가 by June */
  offset?: number;
}) => {
  /* 2026.04.15 taken_minute 컬럼 추가 전 쿼리 실행으로 no such column 에러가 나는 문제를 막기 위해 조회 전 초기화를 강제 by June */
  await initPhotoMetadataDb();
  const db = await getDb();

  const rows = await db.getAllAsync<PhotoSummaryRow>(
    `
    SELECT uri, taken_at as takenAt, latitude, longitude
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
    ORDER BY
      taken_at ASC
    LIMIT ?
    OFFSET ?
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
    params.limit,
    /* 2026.04.22 호출부에서 offset 미지정 시 기존 동작과 동일하게 0부터 조회되도록 기본값을 적용 by June */
    params.offset ?? 0
  );

  /* 2026.04.15 시간 필터를 SQL로 완전 이관해 긴 기간 검색 시 JS 후처리 비용을 제거하기 위해 반환 필터를 제거 by June */
  return rows;
};

/* 2026.04.22 날짜/시간 필터 범위의 전체 대상 건수를 즉시 계산해 로딩 프로그레스(표출/전체)를 정확히 표시하기 위해 COUNT 쿼리 함수를 추가 by June */
export const countPhotoMetadataByDateTime = async (params: {
  dateStartMs: number;
  dateEndNextMs: number;
  timeStart: number;
  timeEnd: number;
}) => {
  /* 2026.04.22 카운트 조회도 스키마 초기화 이후에 실행되도록 보장해 구버전 DB에서 컬럼 누락 오류를 방지하기 위해 초기화 선행 by June */
  await initPhotoMetadataDb();
  const db = await getDb();

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
