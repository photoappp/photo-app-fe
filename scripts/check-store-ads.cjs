const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const config = require("../app.json");
const eas = require("../eas.json");

const testAds = process.env.EXPO_PUBLIC_USE_TEST_ADS;
const platform = process.env.EAS_BUILD_PLATFORM;
const qaProfile = process.env.EAS_BUILD_PROFILE === "android-qa-apk";
const qaOverride = process.env.EXPO_PUBLIC_PICQLY_QA_APK === "true";
const qaAndroid = eas.build["android-qa-apk"].android;
if (qaOverride !== qaProfile ||
    (qaProfile && (platform !== "android" || testAds !== "true" ||
      qaAndroid.buildType !== "apk" || qaAndroid.gradleCommand))) {
  throw new Error("One-minute rewards require the Android QA APK profile with test ads.");
}
if (process.env.EAS_BUILD_PROFILE === "store" && testAds !== "false") {
  throw new Error("The EAS store profile must explicitly enable live ads.");
}
if (testAds !== "false") return;

if (platform !== "android" && platform !== "ios") {
  throw new Error("EAS_BUILD_PLATFORM must be android or ios for live ads.");
}

const samplePublisher = "ca-app-pub-3940256099942544";
const validAppId = (value) => typeof value === "string" &&
  /^ca-app-pub-\d{16}~\d{10}$/.test(value) && !value.startsWith(samplePublisher);
const validUnitId = (value) => typeof value === "string" &&
  /^ca-app-pub-\d{16}\/\d{10}$/.test(value) && !value.startsWith(samplePublisher);

const plugin = config.expo.plugins.find((entry) =>
  Array.isArray(entry) && entry[0] === "react-native-google-mobile-ads");
const appId = plugin?.[1]?.[platform === "android" ? "androidAppId" : "iosAppId"];
if (!validAppId(appId)) {
  throw new Error("Set the real AdMob app ID for " + platform + " in app.json.");
}
if (platform === "ios") {
  const plist = readFileSync(join(__dirname, "../ios/PicQly/Info.plist"), "utf8");
  const nativeAppId = plist.match(/<key>GADApplicationIdentifier<\/key>\s*<string>([^<]+)<\/string>/)?.[1];
  if (nativeAppId !== appId) {
    throw new Error("The checked-in iOS GADApplicationIdentifier must match app.json.");
  }
}
for (const placement of ["BANNER", "REWARDED"]) {
  const name = "EXPO_PUBLIC_ADMOB_" + platform.toUpperCase() + "_" + placement + "_ID";
  if (!validUnitId(process.env[name])) throw new Error("Missing or invalid live ad unit: " + name);
}
