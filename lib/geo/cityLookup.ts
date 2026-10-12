/* 2026.10.12 좌표→근사 도시(영문) 오프라인 룩업 — PicQly-T POC에서 이식.
   데이터: Natural Earth 5.1.2 populated places (public domain, 7,341개 도시, 372KB) — lib/geo/cities/.
   폴리곤으로 판별된 국가 안에서 50km 이내 가장 가까운 등재 도시를 찾고, 없으면 null(근사 대체 금지).
   용도: CLGeocoder 정밀 도시명이 캐시되기 전까지의 '즉시 표시용 플레이스홀더' 티어 —
   표시/필터는 city(정밀) ?? cityApprox(근사) 순으로 사용 by Claude */

import catalogJson from "./cities/catalog.json";
import { lookupCountryCode } from "./countryLookup";

type CityRow = [key: string, name: string, latitude: number, longitude: number];
const catalog = catalogJson as unknown as Record<string, CityRow[]>;

const MAX_DISTANCE_KM = 50;
const EARTH_RADIUS_KM = 6371.0088;
const LATITUDE_KM_PER_DEGREE = 110.574;
const LONGITUDE_KM_PER_DEGREE_AT_EQUATOR = 111.32;

/* 1도 셀 그리드 인덱스 — 앱 시작 비용을 피하기 위해 첫 호출 시 지연 구축 */
let grids: Map<string, Map<string, CityRow[]>> | null = null;

function ensureGrids(): Map<string, Map<string, CityRow[]>> {
  if (grids) return grids;
  grids = new Map();
  for (const [country, rows] of Object.entries(catalog)) {
    const grid = new Map<string, CityRow[]>();
    for (const city of rows) {
      const latitudeCell = Math.min(179, Math.max(0, Math.floor(city[2] + 90)));
      const longitudeCell = ((Math.floor(city[3] + 180) % 360) + 360) % 360;
      const key = `${latitudeCell}:${longitudeCell}`;
      const bucket = grid.get(key);
      if (bucket) bucket.push(city);
      else grid.set(key, [city]);
    }
    grids.set(country, grid);
  }
  return grids;
}

function distanceKm(
  latitude: number,
  longitude: number,
  cityLatitude: number,
  cityLongitude: number,
): number {
  const radians = Math.PI / 180;
  const dLat = (cityLatitude - latitude) * radians;
  const dLon = (cityLongitude - longitude) * radians;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(latitude * radians) *
      Math.cos(cityLatitude * radians) *
      Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** 좌표의 근사 도시명(영문)을 반환. countryCode(A3)를 알고 있으면 넘겨 폴리곤 재계산을 생략.
 *  50km 이내 등재 도시가 없거나 국가 미판별이면 null. */
export function approxCityForCoords(
  latitude: number,
  longitude: number,
  countryCode?: string | null,
): string | null {
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  ) {
    return null;
  }
  const code = countryCode ?? lookupCountryCode(latitude, longitude);
  if (!code) return null;
  const grid = ensureGrids().get(code);
  if (!grid) return null;

  let nearest: CityRow | undefined;
  let nearestDistance = MAX_DISTANCE_KM;
  const latitudeSpan = MAX_DISTANCE_KM / LATITUDE_KM_PER_DEGREE;
  const longitudeSpan = Math.min(
    180,
    MAX_DISTANCE_KM /
      (LONGITUDE_KM_PER_DEGREE_AT_EQUATOR *
        Math.max(0.01, Math.abs(Math.cos((latitude * Math.PI) / 180)))),
  );

  const cells = new Set<string>();
  for (
    let latCell = Math.max(0, Math.floor(latitude - latitudeSpan + 90));
    latCell <= Math.min(179, Math.floor(latitude + latitudeSpan + 90));
    latCell++
  ) {
    const centerLonCell = Math.floor(longitude + 180);
    const cellSpan = Math.ceil(longitudeSpan) + 1;
    for (let offset = -cellSpan; offset <= cellSpan; offset++) {
      const lonCell = ((((centerLonCell + offset) % 360) + 360) % 360);
      cells.add(`${latCell}:${lonCell}`);
    }
  }

  for (const cell of cells) {
    for (const city of grid.get(cell) ?? []) {
      const distance = distanceKm(latitude, longitude, city[2], city[3]);
      if (distance <= nearestDistance) {
        nearest = city;
        nearestDistance = distance;
      }
    }
  }

  return nearest ? nearest[1] : null;
}
