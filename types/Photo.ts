export type Photo = {
  uri: string;
  assetId?: string;
  takenAt?: number | null; // optional
  city?: string;
  /* 2026.10.12 오프라인 근사 도시(영문, Natural Earth 7,341개) — 정밀 city가 캐시되기 전 표시/필터 폴백 by Claude */
  cityApprox?: string;
  country?: string;
  location?: {
    latitude: string | number;
    longitude: string | number;
  } | null;
};
