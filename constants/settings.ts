import Constants from "expo-constants";

const appVersion = Constants.expoConfig?.version ?? "1.0.0";
const buildVersion =
  Constants.nativeBuildVersion ??
  Constants.expoConfig?.ios?.buildNumber;
const appVersionLabel = buildVersion
  ? `${appVersion} (${buildVersion})`
  : appVersion;

export const SETTINGS_CONFIG = [
  { id: "userData", translKey: "userData", type: "nav", screen: "userData" },
  { id: "language", translKey: "language", type: "lang" },
  { id: "slideshow", translKey: "slideshowInterval", type: "slideshow" },
  { id: "theme", translKey: "theme", type: "theme" },
  { id: "sunnyApps", translKey: "sunnyApps", type: "nav", screen: "sunnyApps" },
  {
    id: "instagram",
    translKey: "instagram",
    type: "link",
    link: "https://www.instagram.com/sunnyinnolab",
  },
  {
    id: "twitter",
    translKey: "twitter",
    type: "link",
    link: "https://x.com/sunnyinnolab",
  },
  { id: "credits", translKey: "credits", type: "nav", screen: "credits" },
  {
    id: "openSource",
    translKey: "openSource",
    type: "nav",
    screen: "openSource",
  },
  // TestFlight 빌드마다 자동 표시되도록 앱/빌드 버전 조합을 노출 2026.06.24 June
  { id: "appVersion", translKey: "appVersion", type: "text", value: appVersionLabel },
];

export const LANGUAGES = [
  { label: "English", value: "en" },
  { label: "한국어", value: "ko" },
  { label: "日本語", value: "ja" },
  { label: "繁體中文", value: "zh-Hant" },
  { label: "简体中文", value: "zh-Hans" },
  { label: "Français", value: "fr" },
  { label: "Spanish", value: "es" },
];

export const USER_DATA_ITEMS = [
  { id: "startDate", translKey: "startDate" },
  { id: "dateSearchCount", translKey: "dateSearchCount" },
  { id: "timeSearchCount", translKey: "timeSearchCount" },
  { id: "locationSearchCount", translKey: "locationSearchCount" },
  { id: "totalPhotos", translKey: "totalPhotos" },
];

export const CREDITS_ITEMS = [
  { id: "producer", title: "Producer", value: "R.S.", align: "right" },
  {
    id: "programmers",
    title: "Programmers",
    value: "Yen Han, June Chun",
    align: "right",
  },
  {
    id: "designer",
    title: "UI/UX Designer",
    value: "Jenny Kim",
    align: "right",
  },
  { id: "qaTesters", title: "QA Testers", value: "YC, SJ", align: "right" },
  {
    id: "localizationManagers",
    title: "Localization Managers",
    value: "Mary, Carol, Ann, Edward",
    align: "right",
    multiline: true,
  },
  {
    id: "specialThanks",
    title: "Special Thanks",
    value: "Toronto Korean Developers, Minji Kim",
    align: "left",
    multiline: true,
  },
];

/* 2026.10.25 package.json의 dependencies와 node_modules에 실제로 설치된 버전으로 생성.
   의존성을 추가/제거하면 이 목록도 함께 갱신해야 한다 by Claude */
export const OPEN_SOURCE_ITEMS = [
  { id: "1", title: "@amplitude/analytics-react-native", value: "1.5.36" },
  { id: "2", title: "@expo/vector-icons", value: "15.0.3" },
  { id: "3", title: "@react-native-async-storage/async-storage", value: "2.2.0" },
  { id: "4", title: "@react-native-community/datetimepicker", value: "8.6.0" },
  { id: "5", title: "@react-navigation/bottom-tabs", value: "7.10.1" },
  { id: "6", title: "@react-navigation/elements", value: "2.9.5" },
  { id: "7", title: "@react-navigation/native", value: "7.1.28" },
  { id: "8", title: "date-fns", value: "4.1.0" },
  { id: "9", title: "expo", value: "54.0.32" },
  { id: "10", title: "expo-blur", value: "15.0.8" },
  { id: "11", title: "expo-constants", value: "18.0.13" },
  { id: "12", title: "expo-dev-client", value: "6.0.20" },
  { id: "13", title: "expo-file-system", value: "19.0.21" },
  { id: "14", title: "expo-font", value: "14.0.11" },
  { id: "15", title: "expo-haptics", value: "15.0.8" },
  { id: "16", title: "expo-image", value: "3.0.11" },
  { id: "17", title: "expo-image-manipulator", value: "14.0.8" },
  { id: "18", title: "expo-linear-gradient", value: "15.0.8" },
  { id: "19", title: "expo-linking", value: "8.0.11" },
  { id: "20", title: "expo-location", value: "19.0.8" },
  { id: "21", title: "expo-media-library", value: "18.2.1" },
  { id: "22", title: "expo-navigation-bar", value: "5.0.10" },
  { id: "23", title: "expo-router", value: "6.0.22" },
  { id: "24", title: "expo-splash-screen", value: "31.0.13" },
  { id: "25", title: "expo-sqlite", value: "16.0.10" },
  { id: "26", title: "expo-status-bar", value: "3.0.9" },
  { id: "27", title: "expo-symbols", value: "1.0.8" },
  { id: "28", title: "expo-system-ui", value: "6.0.9" },
  { id: "29", title: "expo-web-browser", value: "15.0.10" },
  { id: "30", title: "react", value: "19.1.0" },
  { id: "31", title: "react-dom", value: "19.1.0" },
  { id: "32", title: "react-native", value: "0.81.4" },
  { id: "33", title: "react-native-date-picker", value: "5.0.13" },
  { id: "34", title: "react-native-dropdown-picker", value: "5.4.6" },
  { id: "35", title: "react-native-gesture-handler", value: "2.28.0" },
  { id: "36", title: "react-native-google-mobile-ads", value: "16.3.3" },
  { id: "37", title: "react-native-image-viewing", value: "0.2.2" },
  { id: "38", title: "react-native-localize", value: "3.6.1" },
  { id: "39", title: "react-native-reanimated", value: "4.1.6" },
  { id: "40", title: "react-native-safe-area-context", value: "5.6.2" },
  { id: "41", title: "react-native-screens", value: "4.16.0" },
  { id: "42", title: "react-native-share", value: "12.2.4" },
  { id: "43", title: "react-native-svg", value: "15.12.1" },
  { id: "44", title: "react-native-uuid", value: "2.0.3" },
  { id: "45", title: "react-native-web", value: "0.21.2" },
  { id: "46", title: "react-native-webview", value: "13.15.0" },
  { id: "47", title: "react-native-worklets", value: "0.5.1" },
];

// 2026-05-12 add more apps by yen
/* 2026.10.25 Sunny 앱 목록을 제공받은 순서 그대로 재구성 (총 15개).
   Subway Master / Watermelon Checker / LED POP / decibella2 추가.
   watermelon_checker만 jpg인데, png로 바꾸면 596KB로 거의 두 배가 되어 그대로 둔다
   (아이콘은 borderRadius 없이 contain으로 그려서 알파가 필요 없음) by Claude */
export const APPS_LIST = [
  {
    name: "Subway Master",
    image: require("@/assets/images/subway_master.png"),
    url: "https://subwaymaster.onelink.me/UbwX/nvm85ss4",
  },
  {
    name: "Sky Peacemaker",
    image: require("@/assets/images/sky_peacemaker.png"),
    url: "https://skypeacemaker.onelink.me/YQxG/8s9sx66i",
  },
  {
    name: "World Movie Trailer",
    image: require("@/assets/images/world_movie_trailer.png"),
    url: "https://wmt.onelink.me/YPN9/m428wgpq",
  },
  {
    name: "World Book Ranking",
    image: require("@/assets/images/world_book_ranking.png"),
    url: "https://worldbookranking.onelink.me/so3H/gftf32rq",
  },
  {
    name: "Simply Multi Timer",
    image: require("@/assets/images/simply_multi_timer.png"),
    url: "https://simplymultitimer.onelink.me/6kU2/v7i9ke1m",
  },
  {
    name: "Watermelon Checker",
    image: require("@/assets/images/watermelon_checker.jpg"),
    url: "https://watermelonchecker.onelink.me/zF1F/obulncrt",
  },
  {
    name: "LED POP",
    image: require("@/assets/images/led_pop.png"),
    url: "https://ledpop.onelink.me/ZM1Z/2myfwcif",
  },
  {
    name: "Wisdom Qclock",
    image: require("@/assets/images/wisdom_qclock.png"),
    url: "https://wisdomqclock.onelink.me/SVr2/b7gs4og1",
  },
  {
    name: "Dual Flashlight",
    image: require("@/assets/images/dual_flashlight.png"),
    url: "https://dualflashlight.onelink.me/7gkq/qpbc8y65",
  },
  {
    name: "Histree",
    image: require("@/assets/images/histree.png"),
    url: "https://histree.onelink.me/c9TM/bfbeczqo",
  },
  {
    name: "Scanatory",
    image: require("@/assets/images/scanatory.png"),
    url: "https://scanatory.onelink.me/zzpK/2tr21jtp",
  },
  {
    name: "Play Memo",
    image: require("@/assets/images/play_memo.png"),
    url: "https://playmemo.onelink.me/LdOZ/6bbfoohf",
  },
  {
    name: "Find Four",
    image: require("@/assets/images/find_four.png"),
    url: "https://findfour.onelink.me/vurA/0tfteiuf",
  },
  {
    name: "decibella2",
    image: require("@/assets/images/decibella2.png"),
    url: "https://decibella2.onelink.me/T5UV/x5q1f7vs",
  },
  {
    name: "decibella",
    image: require("@/assets/images/decibella.png"),
    url: "https://decibella.onelink.me/Ve6i/vydwhkh4",
  },
];
