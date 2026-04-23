import { useMemo, useState } from "react";

import {
  FlatList,
  Image,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { router } from "expo-router";
import DropDownPicker from "react-native-dropdown-picker";
import { Edges, SafeAreaView } from "react-native-safe-area-context";

import TextRow from "@/components/TextRow";

// Context (state management)
import { useLanguage } from "@/components/context/LanguageContext";
import { useSlideshowTime } from "@/components/context/SlideshowTimeContext";
import { useTheme } from "@/components/context/ThemeContext";
import { useUserData } from "@/components/context/UserDataContext";

// Import meta data
import { TRANSLATIONS } from "@/constants/Translations";
import {
  APPS_LIST,
  CREDITS_ITEMS,
  LANGUAGES,
  OPEN_SOURCE_ITEMS,
  SETTINGS_CONFIG,
  USER_DATA_ITEMS,
} from "@/constants/settings";

// 화면 타입: 메인 설정, 사용자 데이터, 크레딧, 만든 앱, 오픈소스
type ScreenType = "main" | "userData" | "credits" | "sunnyApps" | "openSource";

interface CreditsItem {
  id: string;
  title: string;
  value: string;
  align?: "left" | "right";
  multiline?: boolean;
}

// ===== Main Component =====

export default function SimplifiedSettings() {
  // ===== Context Hooks =====
  // 테마 상태 (다크모드 여부, 색상 테마)
  const { isDarkTheme, setIsDarkTheme, colors } = useTheme();

  // 언어 상태
  const { language, setLanguage } = useLanguage();

  // 슬라이드쇼 시간 설정
  const { slideshowTime, setSlideshowTime } = useSlideshowTime();

  // 사용자 데이터
  const { userData } = useUserData();

  // ===== Local State =====
  // 현재 화면 상태 (어떤 설정 화면을 보고 있는지)
  const [screen, setScreen] = useState<ScreenType>("main");

  // 슬라이드쇼 시간 입력값 (초 단위)
  const [inputValue, setInputValue] = useState(
    (slideshowTime / 1000).toString(),
  );

  // 언어 드롭다운 열림/닫힘 상태
  const [langOpen, setLangOpen] = useState(false);

  // ===== Translations =====
  const t = TRANSLATIONS[language];

  // ===== Memoized Data =====
  // 설정 메뉴 데이터 (번역 적용)
  const data = useMemo(
    () =>
      SETTINGS_CONFIG.map((opt) => ({
        ...opt,
        title: t[opt.translKey as keyof typeof t],
      })),
    [t],
  );

  // ===== Helper Functions =====

  /**
   * ISO 날짜 문자열을 YYYY/MM/DD 형식으로 변환
   * @param isoString - ISO 형식 날짜 문자열
   */
  const formatDateOnly = (isoString?: string) => {
    if (!isoString || isoString === "-") return "-";
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return "-";
    return `${d.getFullYear()}/${(d.getMonth() + 1).toString().padStart(2, "0")}/${d.getDate().toString().padStart(2, "0")}`;
  };

  // 사용자 데이터 아이템 생성
  const userDataItems = USER_DATA_ITEMS.map((item) => ({
    id: item.id,
    title: t[item.translKey as keyof typeof t],
    value:
      item.translKey === "startDate"
        ? formatDateOnly(userData.startDate)
        : (userData[item.translKey as keyof typeof userData] ?? 0),
  }));

  // 크레딧 아이템 생성
  const creditsItems: CreditsItem[] = CREDITS_ITEMS.map((item) => ({
    id: item.id,
    title: item.title,
    value: item.value,
    align: item.align as "left" | "right" | undefined,
    multiline: item.multiline,
  }));

  // 오픈소스 라이선스 아이템 생성
  const openSourceItems = OPEN_SOURCE_ITEMS.map((item) => ({
    id: item.id,
    title: item.title,
    value: item.value,
  }));

  // ===== Render Functions =====

  /**
   * 메인 설정 화면의 각 행(row) 렌더링
   * 설정 타입에 따라 다른 UI를 렌더링
   */
  const renderMainItem = ({ item }: { item: (typeof data)[0] }) => {
    switch (item.type) {
      case "nav":
        // 네비게이션 행 (화면 이동)
        return (
          <TouchableOpacity
            style={styles.row}
            onPress={() => item.screen && setScreen(item.screen as ScreenType)}
          >
            <Text style={[styles.label, { color: colors.text }]}>
              {item.title}
            </Text>
            <Text style={[styles.arrow, { color: colors.secondary }]}>›</Text>
          </TouchableOpacity>
        );
      case "lang":
        // 언어 선택 드롭다운
        return (
          <View style={[styles.row, { zIndex: langOpen ? 1000 : 1 }]}>
            <Text style={[styles.label, { color: colors.text }]}>
              {item.title}
            </Text>
            <View style={{ width: 160 }}>
              <DropDownPicker
                listMode="SCROLLVIEW"
                dropDownDirection="BOTTOM"
                maxHeight={300}
                open={langOpen}
                value={language}
                items={LANGUAGES.map((l) => ({
                  label: l.label,
                  value: l.value,
                }))}
                setOpen={setLangOpen}
                setValue={(callback) => {
                  const next = callback(language);
                  setLanguage(next);
                }}
                setItems={() => {}}
                style={{
                  backgroundColor: isDarkTheme ? "#1c1c1e" : "#fff",
                  borderColor: isDarkTheme ? "#333" : "#ccc",
                  minHeight: 36,
                }}
                textStyle={{
                  color: isDarkTheme ? "#fff" : "#000",
                  fontSize: 14,
                }}
                dropDownContainerStyle={{
                  backgroundColor: isDarkTheme ? "#1c1c1e" : "#fff",
                  borderColor: isDarkTheme ? "#333" : "#ccc",
                }}
              />
            </View>
          </View>
        );
      case "slideshow":
        // 슬라이드쇼 시간 입력
        return (
          <View style={styles.row}>
            <Text style={[styles.label, { color: colors.text }]}>
              {item.title}
            </Text>
            <View style={styles.inputWrapper}>
              <TextInput
                style={[
                  styles.input,
                  {
                    color: isDarkTheme ? "#fff" : "#000",
                    backgroundColor: isDarkTheme ? "#333" : "#fff",
                    borderColor: isDarkTheme ? "#555" : "#ccc",
                  },
                ]}
                keyboardType="numeric"
                value={inputValue}
                onChangeText={(text) => {
                  if (/^([1-9][0-9]{0,1})?$/.test(text)) {
                    setInputValue(text);
                    const num = parseInt(text, 10);
                    if (!isNaN(num) && num > 0 && num <= 60) {
                      setSlideshowTime(num * 1000);
                    }
                  }
                }}
              />
              <Text style={[styles.unit, { color: colors.text }]}>sec</Text>
            </View>
          </View>
        );
      case "theme":
        // 테마 토글 (Dark/Light)
        return (
          <View style={styles.row}>
            <Text style={[styles.label, { color: colors.text }]}>
              {item.title}
            </Text>
            <View style={styles.toggleGroup}>
              <TouchableOpacity
                style={[
                  styles.toggleBtn,
                  isDarkTheme && styles.toggleBtnActive,
                ]}
                onPress={() => setIsDarkTheme(true)}
              >
                <Text
                  style={[
                    styles.toggleText,
                    isDarkTheme && styles.toggleTextActive,
                  ]}
                >
                  Dark
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.toggleBtn,
                  !isDarkTheme && styles.toggleBtnActive,
                ]}
                onPress={() => setIsDarkTheme(false)}
              >
                <Text
                  style={[
                    styles.toggleText,
                    !isDarkTheme && styles.toggleTextActive,
                  ]}
                >
                  Light
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        );
      case "link":
        // 외부 링크 행
        return (
          <TouchableOpacity
            style={styles.row}
            onPress={() => item.link && Linking.openURL(item.link)}
          >
            <Text style={[styles.label, { color: colors.text }]}>
              {item.title}
            </Text>
            <Text style={styles.link}>Link</Text>
          </TouchableOpacity>
        );
      case "text":
        // 텍스트 행 (값만 표시)
        return <TextRow title={item.title} value={item.value!} />;
      default:
        return null;
    }
  };

  /**
   * 서브 리스트 아이템 렌더링 (사용자 데이터, 오픈소스 등)
   */
  const renderSubList = ({
    item,
  }: {
    item: { id: string; title: string; value: string | number };
  }) => (
    <View style={styles.row}>
      <Text style={[styles.label, { color: colors.text }]}>{item.title}</Text>
      <Text style={[styles.value, { color: colors.secondary }]}>
        {item.value}
      </Text>
    </View>
  );

  /**
   * 만든 앱 리스트 아이템 렌더링
   */
  const sunnyAppsItem = ({
    item,
  }: {
    item: { name: string; url: string; image: number };
  }) => (
    <TouchableOpacity
      style={styles.appItem}
      onPress={() => Linking.openURL(item.url)}
    >
      <Image source={item.image} style={styles.appImage} resizeMode="contain" />
      <Text style={[styles.appName, { color: colors.text }]}>{item.name}</Text>
    </TouchableOpacity>
  );

  /**
   * 화면 타입에 따른 콘텐츠 렌더링
   * 각 화면은 FlatList로 아이템들을 표시
   */
  const renderContent = () => {
    switch (screen) {
      case "userData":
        // 사용자 데이터 화면
        return (
          <FlatList
            data={userDataItems}
            keyExtractor={(item) => item.id}
            renderItem={renderSubList}
            ItemSeparatorComponent={() => (
              <View
                style={[
                  styles.separator,
                  { backgroundColor: isDarkTheme ? "#333" : "#ddd" },
                ]}
              />
            )}
          />
        );
      case "credits":
        // 크레딧 화면
        return (
          <FlatList
            data={creditsItems}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TextRow
                title={item.title}
                value={item.value}
                align={item.align}
                multiline={item.multiline}
              />
            )}
            ItemSeparatorComponent={() => (
              <View
                style={[
                  styles.separator,
                  { backgroundColor: isDarkTheme ? "#333" : "#ddd" },
                ]}
              />
            )}
          />
        );
      case "openSource":
        // 오픈소스 라이선스 화면
        return (
          <FlatList
            data={openSourceItems}
            keyExtractor={(item) => item.id}
            renderItem={renderSubList}
            ItemSeparatorComponent={() => (
              <View
                style={[
                  styles.separator,
                  { backgroundColor: isDarkTheme ? "#333" : "#ddd" },
                ]}
              />
            )}
          />
        );
      case "sunnyApps":
        // 만든 앱 화면
        return (
          <FlatList
            data={APPS_LIST}
            keyExtractor={(item) => item.name}
            renderItem={sunnyAppsItem}
            ItemSeparatorComponent={() => (
              <View
                style={{
                  height: 1,
                  backgroundColor: isDarkTheme ? "#333" : "#ddd",
                  marginVertical: 8,
                }}
              />
            )}
            contentContainerStyle={{ padding: 16 }}
          />
        );
      default:
        // 메인 설정 화면
        return (
          <FlatList
            data={data}
            keyExtractor={(item) => item.id}
            renderItem={renderMainItem}
            ItemSeparatorComponent={() => (
              <View
                style={[
                  styles.separator,
                  { backgroundColor: isDarkTheme ? "#333" : "#ddd" },
                ]}
              />
            )}
          />
        );
    }
  };

  // ===== Navigation =====

  // 현재 화면에 따른 제목 반환
  const getTitle = () => {
    switch (screen) {
      case "userData":
        return t.userData;
      case "credits":
        return t.credits;
      case "sunnyApps":
        return t.sunnyApps;
      case "openSource":
        return t.openSource;
      default:
        return t.settings;
    }
  };

  // 뒤로 가기 버튼 표시 여부 (메인이 아니면 표시)
  const showBack = screen !== "main";

  // SafeAreaView에 적용할 엣지 (ios 상태바 영역 제외)
  const edges: Edges = ["top", "left", "right"];

  // ===== Render =====
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* 헤더 영역 (제목, 뒤로 가기 버튼) */}
      <SafeAreaView style={{ backgroundColor: "#fff" }} edges={edges}>
        <View style={[styles.header, { backgroundColor: "#fff" }]}>
          {/* 뒤로 가기 버튼 */}
          {showBack ? (
            <Pressable onPress={() => setScreen("main")} style={styles.backBtn}>
              <Text style={{ fontSize: 16, color: "#000" }}>‹ Back</Text>
            </Pressable>
          ) : (
            <Pressable onPress={() => router.back()} style={styles.backBtn}>
              <Text style={{ fontSize: 16, color: "#000" }}>‹ Back</Text>
            </Pressable>
          )}

          {/* 화면 제목 */}
          <Text style={[styles.headerTitle, { color: colors.text }]}>
            {getTitle()}
          </Text>

          {/* 뒤로 가기 버튼 영역 (가운데 정렬용) */}
          <View style={styles.backBtn} />
        </View>
      </SafeAreaView>

      {/* 메인 콘텐츠 영역 */}
      <View style={{ flex: 1 }}>{renderContent()}</View>

      {/* 푸터 영역 (로고, 약관/개인정보 링크) */}
      <View style={[styles.footer]}>
        <Image
          source={require("../../assets/SIL_logo_setting_mini_xxhdpi.png")}
          style={styles.logo}
          resizeMode="contain"
        />
        <View style={styles.links}>
          <TouchableOpacity
            onPress={() =>
              Linking.openURL(
                "https://marmalade-neptune-dbe.notion.site/Terms-Conditions-c18656ce6c6045e590f652bf8291f28b?pvs=74",
              )
            }
          >
            <Text style={[styles.linkText, { color: colors.secondary }]}>
              Terms
            </Text>
          </TouchableOpacity>
          <Text style={[styles.linkText, { color: colors.secondary }]}>|</Text>
          <TouchableOpacity
            onPress={() =>
              Linking.openURL(
                "https://marmalade-neptune-dbe.notion.site/Privacy-Policy-ced8ead72ced4d8791ca4a71a289dd6b",
              )
            }
          >
            <Text style={[styles.linkText, { color: colors.secondary }]}>
              Privacy
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// ===== Styles =====

const styles = StyleSheet.create({
  // 헤더 스타일
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: Platform.OS === "android" ? 8 : 12,
  },

  // 헤더 제목 스타일
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
  },

  // 뒤로 가기 버튼 스타일
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    minWidth: 60,
  },

  // 설정 행 공통 스타일
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    minHeight: 50,
  },

  // 라벨 텍스트 스타일
  label: { fontSize: 16 },

  // 값 텍스트 스타일
  value: { fontSize: 16 },

  // 링크 텍스트 스타일
  link: { fontSize: 14, color: "#007aff" },

  // 화살표(›) 스타일
  arrow: { fontSize: 20 },

  // 입력 래퍼 스타일
  inputWrapper: { flexDirection: "row", alignItems: "center", gap: 6 },

  // 입력 필드 스타일
  input: {
    width: 50,
    borderWidth: 1,
    borderRadius: 6,
    padding: 6,
    textAlign: "center",
    fontSize: 14,
  },

  // 단위 텍스트 스타일 (sec)
  unit: { fontSize: 14 },

  // 토글 버튼 그룹 스타일
  toggleGroup: { flexDirection: "row", gap: 8 },

  // 토글 버튼 스타일
  toggleBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 6,
  },

  // 활성화된 토글 버튼 스타일
  toggleBtnActive: {
    backgroundColor: "#007aff",
    borderColor: "#007aff",
  },

  // 토글 텍스트 스타일
  toggleText: { fontSize: 14, color: "#555" },

  // 활성화된 토글 텍스트 스타일
  toggleTextActive: { color: "#fff", fontWeight: "600" },

  // 구분선 스타일
  separator: { height: 1 },

  // 앱 아이템 스타일
  appItem: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
  },

  // 앱 이미지 스타일
  appImage: { width: 100, height: 100, marginBottom: 8 },

  // 앱 이름 스타일
  appName: { fontSize: 16, textAlign: "center" },

  // 푸터 스타일
  footer: {
    flexDirection: "row",
    justifyContent: "space-evenly",
    flexWrap: "nowrap",
    padding: 15,
    borderTopWidth: 1,
    borderColor: "#ccc",
    alignItems: "center",
    backgroundColor: "#2c2c2e",
  },

  // 로고 스타일
  logo: { width: 120, height: 24, marginBottom: 5 },

  // 링크 영역 스타일
  links: { flexDirection: "row", alignItems: "center" },

  // 링크 텍스트 스타일
  linkText: { marginHorizontal: 2 },
});
