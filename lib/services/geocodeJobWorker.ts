import * as Location from "expo-location";
/* 2026.04.22 geocode_jobs 큐를 백그라운드에서 처리해 위치 캐시를 점진 보강하기 위한 워커 서비스 신규 추가 by June */

import {
  claimPendingGeocodeJobs,
  markGeocodeJobDone,
  markGeocodeJobFailed,
  upsertGeocodeCacheRows,
} from "@/lib/db/photoMetadataDb";
import { recordPerfMetric } from "@/lib/services/perfMetrics";

/* 2026.04.22 작업 실패 시 무한 재시도를 막고 상태를 failed로 전환하기 위한 최대 재시도 횟수 상수 추가 by June */
const MAX_RETRY = 3;

/* 2026.04.22 중복 워커 실행을 방지해 같은 작업을 여러 루프에서 동시에 처리하지 않도록 in-flight 가드 추가 by June */
let inFlightWorker: Promise<void> | null = null;

/* 2026.04.22 지오코딩 작업 큐를 배치 단위로 소모하며 캐시를 갱신하기 위한 백그라운드 처리 함수 추가 by June */
export const processGeocodeJobsInBackground = async (params?: {
  batchSize?: number;
  delayMs?: number;
}) => {
  if (inFlightWorker) {
    return inFlightWorker;
  }

  inFlightWorker = (async () => {
    /* 2026.04.22 큐 워커 한 사이클의 총 처리 시간을 계측해 백그라운드 보강 속도를 정량화하기 위해 타이머를 추가 by June */
    const workerStartedAt = Date.now();
    const batchSize = params?.batchSize ?? 10;
    const delayMs = params?.delayMs ?? 80;

    const jobs = await claimPendingGeocodeJobs(batchSize);
    if (jobs.length === 0) {
      /* 2026.04.22 큐가 비어있는 주기도 기록해 워커 루프 오버헤드 점검 근거를 남기기 위해 계측을 추가 by June */
      recordPerfMetric("geocode.worker_cycle.ms", Date.now() - workerStartedAt, {
        context: { claimedJobs: 0 },
        logEvery: 10,
      });
      return;
    }

    for (const job of jobs) {
      /* 2026.04.22 단건 geocode 처리 시간을 측정해 실패/성공별 체감 지연 원인을 분리하기 위해 작업 타이머를 추가 by June */
      const jobStartedAt = Date.now();
      try {
        const [res] = await Location.reverseGeocodeAsync({
          latitude: job.latitude,
          longitude: job.longitude,
        });

        const country = res?.country ?? null;
        const city = res?.city ?? res?.subregion ?? null;

        await upsertGeocodeCacheRows([
          {
            geoKey: job.geoKey,
            latitude: job.latitude,
            longitude: job.longitude,
            country,
            city,
            updatedAt: Date.now(),
          },
        ]);

        await markGeocodeJobDone(job.geoKey);
        /* 2026.04.22 성공 작업 시간을 기록해 큐 처리량 예측 정확도를 높이기 위해 계측을 추가 by June */
        recordPerfMetric("geocode.job_success.ms", Date.now() - jobStartedAt, {
          context: { geoKey: job.geoKey },
          logEvery: 4,
        });

        if (delayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      } catch (err: any) {
        const errorMessage =
          typeof err?.message === "string" ? err.message : "geocode failed";

        await markGeocodeJobFailed({
          geoKey: job.geoKey,
          errorMessage,
          maxRetry: MAX_RETRY,
        });
        /* 2026.04.22 실패 작업 시간도 별도 기록해 재시도 정책 튜닝 시 근거로 활용하기 위해 계측을 추가 by June */
        recordPerfMetric("geocode.job_failed.ms", Date.now() - jobStartedAt, {
          context: { geoKey: job.geoKey, errorMessage },
          logEvery: 2,
        });

        if (delayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, delayMs * 2));
        }
      }
    }

    /* 2026.04.22 워커 사이클 총 시간을 기록해 배치 크기/지연시간 조정의 기준 지표를 확보하기 위해 계측을 추가 by June */
    recordPerfMetric("geocode.worker_cycle.ms", Date.now() - workerStartedAt, {
      context: { claimedJobs: jobs.length },
      logEvery: 3,
    });
  })().finally(() => {
    inFlightWorker = null;
  });

  return inFlightWorker;
};
