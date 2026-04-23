/* 2026.04.22 날짜/시간/위치 탐색 성능을 p50/p95 기준으로 추적하기 위한 공용 계측 모듈을 추가 by June */

type PerfSample = {
  durationMs: number;
  at: number;
};

type PerfSeries = {
  samples: PerfSample[];
  sum: number;
  min: number;
  max: number;
};

type PerfRecordOptions = {
  context?: Record<string, unknown>;
  sampleSize?: number;
  logEvery?: number;
};

/* 2026.04.22 메트릭별 최근 샘플을 메모리에 유지해 앱 실행 중 p50/p95를 즉시 계산하기 위해 저장소를 추가 by June */
const metricStore = new Map<string, PerfSeries>();

const DEFAULT_SAMPLE_SIZE = 200;
const DEFAULT_LOG_EVERY = 5;

/* 2026.04.22 분위수 계산 정확도를 위해 정렬 기반 선형보간 방식을 사용하도록 유틸 함수를 추가 by June */
const percentile = (values: number[], p: number) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (sorted.length - 1) * p;
  const low = Math.floor(idx);
  const high = Math.ceil(idx);
  if (low === high) return sorted[low];
  const weight = idx - low;
  return sorted[low] * (1 - weight) + sorted[high] * weight;
};

/* 2026.04.22 측정 결과를 누적하고 주기적으로 p50/p95 요약 로그를 출력하기 위해 기록 함수를 추가 by June */
export const recordPerfMetric = (
  metric: string,
  durationMs: number,
  options?: PerfRecordOptions
) => {
  const cappedDuration = Number.isFinite(durationMs)
    ? Math.max(0, durationMs)
    : 0;
  const sampleSize = Math.max(20, options?.sampleSize ?? DEFAULT_SAMPLE_SIZE);
  const logEvery = Math.max(1, options?.logEvery ?? DEFAULT_LOG_EVERY);

  const current =
    metricStore.get(metric) ??
    ({
      samples: [],
      sum: 0,
      min: Number.POSITIVE_INFINITY,
      max: 0,
    } satisfies PerfSeries);

  current.samples.push({ durationMs: cappedDuration, at: Date.now() });
  current.sum += cappedDuration;
  current.min = Math.min(current.min, cappedDuration);
  current.max = Math.max(current.max, cappedDuration);

  if (current.samples.length > sampleSize) {
    const removed = current.samples.shift();
    if (removed) {
      current.sum -= removed.durationMs;
    }
  }

  metricStore.set(metric, current);

  const count = current.samples.length;
  if (count % logEvery !== 0) return;

  const values = current.samples.map((s) => s.durationMs);
  const avg = current.sum / count;
  const p50 = percentile(values, 0.5);
  const p95 = percentile(values, 0.95);

  console.log("[PERF]", metric, {
    count,
    lastMs: Math.round(cappedDuration),
    avgMs: Math.round(avg),
    p50Ms: Math.round(p50),
    p95Ms: Math.round(p95),
    minMs: Math.round(current.min === Number.POSITIVE_INFINITY ? 0 : current.min),
    maxMs: Math.round(current.max),
    ...(options?.context ?? {}),
  });
};

