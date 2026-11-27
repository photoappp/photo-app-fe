import { useSyncExternalStore } from "react";
import { Platform } from "react-native";
import mobileAds, {
  AdsConsent,
  AdsConsentPrivacyOptionsRequirementStatus,
  type AdsConsentInfo,
} from "react-native-google-mobile-ads";
import { hasAdUnitConfiguration } from "@/lib/ads/adUnitIds";

type ConsentState = {
  allowed: boolean | null;
  privacyOptionsRequired: boolean;
  privacyOptionsOpen: boolean;
  initializationFailed: boolean;
};

let state: ConsentState = {
  allowed: null,
  privacyOptionsRequired: false,
  privacyOptionsOpen: false,
  initializationFailed: false,
};
let startup: Promise<boolean> | null = null;
let initialized = false;
let lastConsent: AdsConsentInfo | null = null;
const listeners = new Set<() => void>();

function publish(next: Partial<ConsentState>) {
  state = { ...state, ...next };
  listeners.forEach((listener) => listener());
}

export function subscribeToAdsConsent(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export const getAdsConsentState = () => state;

async function readConsentInfo() {
  try {
    return await AdsConsent.getConsentInfo();
  } catch (error) {
    console.warn("[AdsConsent] status unavailable", error);
    return null;
  }
}

async function applyConsent(info: AdsConsentInfo | null) {
  lastConsent = info;
  let allowed = info?.canRequestAds === true && hasAdUnitConfiguration;
  let initializationFailed = false;
  if (allowed && !initialized) {
    try {
      await mobileAds().initialize();
      initialized = true;
    } catch (error) {
      console.warn("[AdsConsent] initialization failed", error);
      allowed = false;
      initializationFailed = true;
    }
  }
  publish({
    allowed,
    initializationFailed,
    privacyOptionsOpen: false,
    privacyOptionsRequired: info?.privacyOptionsRequirementStatus ===
      AdsConsentPrivacyOptionsRequirementStatus.REQUIRED,
  });
  return allowed;
}

export function initializeAdsWithConsent() {
  startup ??= (async () => {
    if (Platform.OS !== "android" && Platform.OS !== "ios") return applyConsent(null);
    if (!hasAdUnitConfiguration) {
      console.warn("[AdsConsent] live ad unit configuration is missing or invalid");
    }
    try {
      return await applyConsent(await AdsConsent.gatherConsent());
    } catch (error) {
      console.warn("[AdsConsent] update failed", error);
      return applyConsent(await readConsentInfo());
    }
  })();
  return startup;
}

export async function whenAdsReady() {
  await initializeAdsWithConsent();
  return state.allowed === true && !state.privacyOptionsOpen;
}

export async function retryAdsInitialization() {
  if (!state.initializationFailed || state.privacyOptionsOpen) return false;
  publish({ allowed: null, initializationFailed: false });
  return applyConsent(lastConsent);
}

export async function showAdPrivacyOptions() {
  if (!state.privacyOptionsRequired || state.privacyOptionsOpen ||
      state.allowed === null) return;
  publish({ allowed: null, privacyOptionsOpen: true });
  try {
    await AdsConsent.showPrivacyOptionsForm();
  } catch (error) {
    console.warn("[AdsConsent] privacy options form failed", error);
  }
  await applyConsent(await readConsentInfo());
}

export function useAdsConsentState() {
  return useSyncExternalStore(subscribeToAdsConsent, getAdsConsentState, getAdsConsentState);
}

export function useAdsAllowed() {
  return useAdsConsentState().allowed;
}
