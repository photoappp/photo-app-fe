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
- The development, preview, and production EAS profiles currently select Google test ad units. UMP is integrated at startup. The app currently includes banner and rewarded ad placements.
- Country and city filter options are built from indexed places or available photos. They do not require a Google Sheets download. Map tiles use CARTO.

## Checks

`npm run lint` runs the Expo ESLint checks. The repository does not currently register an `npm test` script or ship an automated test target.

## Project layout

- `app/` contains Expo Router screens and layouts.
- `components/` contains shared UI and app providers.
- `lib/db/`, `lib/services/`, and `lib/geo/` contain the photo index, sync, and offline location lookup.
- `modules/photo-sync/` contains the Android and iOS native photo-sync implementation.
