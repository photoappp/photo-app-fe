/* 2026.10.04 네트워크/CLGeocoder 없이 좌표→국가를 로컬에서 판별하는 오프라인 룩업 (picqly POC에서 이식).
   데이터: Natural Earth 5.1.2 admin_0 (public domain), 위도 5도 밴드 36개로 분할 — lib/geo/countries/.
   위도 밴드 내 원본 폴리곤 edge에 대한 ray casting, 구멍은 even/odd 패리티.
   복수 국가 매칭/경계선 위/극점·경계선 좌표는 null(미판별) 반환 — 근사 대체 없음 by Claude */

import countries from "./countries/catalog.json";
import { loaders } from "./countries/loaders";
import { countryDisplayName } from "./countryNames";

type Piece = { c: number; min: number; max: number; edges: number[] };

/** 좌표의 국가 A3 코드(예: "KOR")를 반환. 판별 불가 시 null. */
export function lookupCountryCode(
  latitude: number,
  longitude: number,
): string | null {
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  ) {
    return null;
  }
  // 경도 ±180 경계선과 극점은 평면 표현이 모호해 미판별 처리
  if (Math.abs(longitude) === 180 || Math.abs(latitude) === 90) return null;

  const index = Math.min(35, Math.floor((latitude + 90) / 5));
  const pieces = loaders[index]!() as Piece[];
  const hits = new Set<number>();

  for (const piece of pieces) {
    if (longitude < piece.min || longitude > piece.max) continue;
    let inside = false;
    const e = piece.edges;
    for (let i = 0; i < e.length; i += 4) {
      const x1 = e[i]!,
        y1 = e[i + 1]!,
        x2 = e[i + 2]!,
        y2 = e[i + 3]!;
      if (latitude < Math.min(y1, y2) || latitude > Math.max(y1, y2)) continue;
      const cross =
        (longitude - x1) * (y2 - y1) - (latitude - y1) * (x2 - x1);
      if (
        Math.abs(cross) < 1e-12 &&
        longitude >= Math.min(x1, x2) &&
        longitude <= Math.max(x1, x2)
      ) {
        return null;
      }
      if (
        (y1 > latitude) !== (y2 > latitude) &&
        longitude < ((x2 - x1) * (latitude - y1)) / (y2 - y1) + x1
      ) {
        inside = !inside;
      }
    }
    if (inside) hits.add(piece.c);
  }

  if (hits.size !== 1) return null;
  return (countries as string[])[[...hits][0]!] ?? null;
}

/** 좌표의 국가 표시명(현재 앱 언어 기준)을 반환. 판별 불가 시 null — 호출부에서 지오코더 값으로 폴백. */
export function resolveCountryForCoords(
  latitude: number,
  longitude: number,
): string | null {
  const code = lookupCountryCode(latitude, longitude);
  if (!code) return null;
  return countryDisplayName(code);
}
