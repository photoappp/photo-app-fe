# PicQly

PicQly is an Expo SDK 54 and React Native app for searching the device photo library by date, time, country, city, and media type. It indexes photo metadata on the device in SQLite, uses bundled geographic data to resolve locations, and supports viewing matching photos on a map.

## Local development

1. Install the locked dependencies with `npm ci`. The postinstall script applies the patches in `patches/`.
2. Copy `.env.example` to `.env` and supply values for the services you need. `EXPO_PUBLIC_AMPLITUDE_API_KEY` configures analytics and `EXPO_PUBLIC_CARTO_API_KEY` configures map tiles. Expo embeds `EXPO_PUBLIC_*` values into the client bundle, so use only client-safe values.
3. Install a native development build and start Metro.

   ```bash
   npm run android
   # Or, on macOS with Xcode:
   npm run ios
   ```

   For an already installed development build, use `npm start -- --dev-client`. PicQly requires a development build for its native photo-sync module and Google Mobile Ads. The iOS project is checked in under `ios/`. Android project files are generated locally, with the app-owned Android module source under `modules/photo-sync/android/`. Use `npm run web` for a browser preview. Verify photo permissions, native sync, and ads on a device.

## Configuration

- Android package ID is `com.photoapp.fe`. The iOS bundle ID is `com.sunnyinnolab.phoview`.
- Country and city filter options are built from indexed places or available photos. They do not require a Google Sheets download. Map tiles use CARTO.

## Advertising and Android QA

Location, map, and extended photo search share a two-hour grant issued when the ads SDK confirms that the user earned the reward. UMP checks consent at startup. When Google requires a privacy-options entry, it is shown in Settings.

- The `development`, `preview`, and `production` profiles use Google test ad units.
- The `android-qa-apk` profile is for signed Android APKs with official test units and a separate, 60-second earned grant. It keeps the standard popup copy and uses normal UMP behavior. Building it requires access to the configured EAS project and its existing Android signing credentials. Check actual ad playback and reward expiry on the device.
- The `store` profile requires live ads. Set the real AdMob app ID in `app.json` and match it in `ios/PicQly/Info.plist` for iOS. For Android, set `EXPO_PUBLIC_ADMOB_ANDROID_BANNER_ID` and `EXPO_PUBLIC_ADMOB_ANDROID_REWARDED_ID`. For iOS, set `EXPO_PUBLIC_ADMOB_IOS_BANNER_ID` and `EXPO_PUBLIC_ADMOB_IOS_REWARDED_ID`. The build preflight rejects missing or sample live values.

## Checks

- `npm run lint` runs Expo ESLint.
- `npm test` runs the Node.js advertising configuration tests. They check profile isolation, reward duration and storage, and live-ad preflight rejection. They do not exercise the native ad SDK or UMP.

## Project layout

- `app/` contains Expo Router screens and layouts.
- `components/` contains shared UI and app providers.
- `lib/db/`, `lib/services/`, and `lib/geo/` contain the photo index, sync, and offline location lookup.
- `modules/photo-sync/` contains the Android and iOS native photo-sync implementation.
