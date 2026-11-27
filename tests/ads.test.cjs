const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { runInNewContext } = require("node:vm");
const ts = require("typescript");

const qaProfile = require("../eas.json").build["android-qa-apk"];
const preflight = path.resolve(__dirname, "../scripts/check-store-ads.cjs");
const profileSource = path.resolve(__dirname, "../lib/ads/adBuildProfile.ts");
const profileJs = ts.transpileModule(readFileSync(profileSource, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
  fileName: profileSource,
}).outputText;

function getBuildSettings(platform, env) {
  const exports = {};
  runInNewContext(profileJs, {
    exports,
    require(name) {
      assert.equal(name, "react-native");
      return { Platform: { OS: platform } };
    },
    process: { env },
    __DEV__: false,
  });
  return exports;
}

function runPreflight(profile, platform, flags) {
  return execFileSync(process.execPath, [preflight], {
    env: {
      EAS_BUILD_PROFILE: profile,
      EAS_BUILD_PLATFORM: platform,
      ...flags,
    },
    encoding: "utf8",
    stdio: "pipe",
  });
}

test("Android QA uses the APK artifact, test ads, and a separate 60-second grant", () => {
  assert.equal(qaProfile.android.buildType, "apk");
  assert.doesNotThrow(() => runPreflight("android-qa-apk", "android", qaProfile.env));
  const qa = getBuildSettings("android", qaProfile.env);
  assert.equal(qa.useTestAdUnits, true);
  assert.equal(qa.earnedAccessDurationMs, 60_000);
  assert.notEqual(qa.earnedAccessStorageKey, getBuildSettings("android", {}).earnedAccessStorageKey);
});

test("regular builds retain two hours and the production grant key", () => {
  const store = getBuildSettings("android", { EXPO_PUBLIC_USE_TEST_ADS: "false" });
  const ios = getBuildSettings("ios", qaProfile.env);
  assert.equal(store.useTestAdUnits, false);
  for (const build of [store, ios, getBuildSettings("android", {})]) {
    assert.equal(build.earnedAccessDurationMs, 7_200_000);
    assert.equal(build.earnedAccessStorageKey, "earnedLocationUnlockedUntil");
  }
});

test("the reward override is rejected for iOS and non-QA profiles", () => {
  assert.throws(() => runPreflight("android-qa-apk", "ios", qaProfile.env), /One-minute rewards require/);
  assert.throws(() => runPreflight("production", "android", qaProfile.env), /One-minute rewards require/);
});

test("Android QA fails if the override is absent or test ads are disabled", () => {
  assert.throws(() => runPreflight("android-qa-apk", "android", {}), /One-minute rewards require/);
  assert.throws(() => runPreflight("android-qa-apk", "android", {
    ...qaProfile.env,
    EXPO_PUBLIC_USE_TEST_ADS: "false",
  }), /One-minute rewards require/);
});

test("the store profile requires live mode and rejects missing live configuration", () => {
  assert.throws(() => runPreflight("store", "android", {
    EXPO_PUBLIC_USE_TEST_ADS: "true",
  }), /explicitly enable live ads/);
  assert.throws(() => runPreflight("store", "android", {
    EXPO_PUBLIC_USE_TEST_ADS: "false",
  }), /real AdMob app ID|Missing or invalid live ad unit/);
});
