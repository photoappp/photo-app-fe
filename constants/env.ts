export const AMPLITUDE_API_KEY = process.env.EXPO_PUBLIC_AMPLITUDE_API_KEY;
/* 2026.10.25 CARTO 베이스맵 API 키 — 2025년부터 키 없는 타일 요청은 'API KEY REQUIRED'
   플레이스홀더 이미지로 응답한다(HTTP 200이라 지도에 그대로 그려짐).
   .env의 EXPO_PUBLIC_CARTO_API_KEY로 주입하며, .env는 git에 올리지 않는다 by Claude */
export const CARTO_API_KEY = process.env.EXPO_PUBLIC_CARTO_API_KEY;
