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
  // POINT TO CHANGE: app version
  { id: "appVersion", translKey: "appVersion", type: "text", value: "1.0.0" },
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
    multiline: true,
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

export const OPEN_SOURCE_ITEMS = [
  { id: "1", title: "@amplitude/analytics-react-native", value: "1.5.16" },
  { id: "2", title: "@expo/vector-icons", value: "15.0.2" },
  { id: "3", title: "@react-native-camera-roll/camera-roll", value: "7.10.2" },
  { id: "4", title: "@react-native-community/datetimepicker", value: "8.5.0" },
  { id: "5", title: "@react-navigation/bottom-tabs", value: "7.3.10" },
  { id: "6", title: "@react-navigation/elements", value: "2.3.8" },
  { id: "7", title: "@react-navigation/native", value: "7.1.6" },
  { id: "8", title: "expo", value: "54.0.19" },
  { id: "9", title: "expo-blur", value: "15.0.7" },
  { id: "10", title: "expo-constants", value: "18.0.9" },
  { id: "11", title: "expo-dev-client", value: "6.0.17" },
  { id: "12", title: "expo-font", value: "14.0.9" },
  { id: "13", title: "expo-haptics", value: "15.0.7" },
  { id: "14", title: "expo-image", value: "3.0.9" },
  { id: "15", title: "expo-linking", value: "8.0.8" },
  { id: "16", title: "expo-location", value: "19.0.7" },
  { id: "17", title: "expo-media-library", value: "18.2.0" },
  { id: "18", title: "expo-router", value: "6.0.12" },
  { id: "19", title: "expo-splash-screen", value: "31.0.10" },
  { id: "20", title: "expo-status-bar", value: "3.0.8" },
  { id: "21", title: "expo-symbols", value: "1.0.7" },
  { id: "22", title: "expo-system-ui", value: "6.0.7" },
  { id: "23", title: "expo-web-browser", value: "15.0.8" },
  { id: "24", title: "react", value: "19.1.0" },
  { id: "25", title: "react-dom", value: "19.1.0" },
  { id: "26", title: "react-native", value: "0.81.4" },
  { id: "27", title: "react-native-gesture-handler", value: "2.28.0" },
  { id: "28", title: "react-native-image-viewing", value: "0.2.2" },
  { id: "29", title: "react-native-reanimated", value: "4.1.1" },
  { id: "30", title: "react-native-safe-area-context", value: "5.6.0" },
  { id: "31", title: "react-native-screens", value: "4.16.0" },
  { id: "32", title: "react-native-uuid", value: "2.0.3" },
  { id: "33", title: "react-native-web", value: "0.21.0" },
  { id: "34", title: "react-native-webview", value: "13.15.0" },
  { id: "35", title: "react-native-worklets", value: "0.5.1" },
];

export const APPS_LIST = [
  {
    name: "Sky Peacemaker - Finger Force",
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
    name: "Wisdom Qclock",
    image: require("@/assets/images/wisdom_qclock.png"),
    url: "https://wisdomqclock.onelink.me/SVr2/b7gs4og1",
  },
  {
    name: "Find Four",
    image: require("@/assets/images/find_four.png"),
    url: "https://findfour.onelink.me/vurA/0tfteiuf",
  },
  {
    name: "Dual Flashlight",
    image: require("@/assets/images/dual_flashlight.png"),
    url: "https://dualflashlight.onelink.me/7gkq/qpbc8y65",
  },
  {
    name: "decibella",
    image: require("@/assets/images/decibella.png"),
    url: "https://decibella.onelink.me/Ve6i/vydwhkh4",
  },
];
