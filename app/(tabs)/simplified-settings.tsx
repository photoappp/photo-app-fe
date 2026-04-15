import { useState, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  TextInput,
  Linking,
  StyleSheet,
  Pressable,
  Image,
  SafeAreaView,
} from 'react-native';
import { router } from 'expo-router';
import DropDownPicker from 'react-native-dropdown-picker';
import { useTheme } from '@/components/context/ThemeContext';
import { useLanguage } from '@/components/context/LanguageContext';
import { useSlideshowTime } from '@/components/context/SlideshowTimeContext';
import { useUserData } from '@/components/context/UserDataContext';
import { TRANSLATIONS } from '@/constants/Translations';
import { SETTINGS_CONFIG, LANGUAGES, USER_DATA_ITEMS, CREDITS_ITEMS, OPEN_SOURCE_ITEMS, APPS_LIST } from '@/constants/settings';
import TextRow from '@/components/TextRow';

type ScreenType = 'main' | 'userData' | 'credits' | 'sunnyApps' | 'openSource';

interface CreditsItem {
  id: string;
  title: string;
  value: string;
  align?: 'left' | 'right';
  multiline?: boolean;
}

export default function SimplifiedSettings() {
  const { isDarkTheme, setIsDarkTheme, colors } = useTheme();
  const { language, setLanguage } = useLanguage();
  const { slideshowTime, setSlideshowTime } = useSlideshowTime();
  const { userData } = useUserData();

  const [screen, setScreen] = useState<ScreenType>('main');
  const [inputValue, setInputValue] = useState((slideshowTime / 1000).toString());
  const [langOpen, setLangOpen] = useState(false);

  const t = TRANSLATIONS[language];

  const data = useMemo(
    () =>
      SETTINGS_CONFIG.map((opt) => ({
        ...opt,
        title: t[opt.translKey as keyof typeof t],
      })),
    [t]
  );

  const formatDateOnly = (isoString?: string) => {
    if (!isoString) return '-';
    const d = new Date(isoString);
    return `${d.getFullYear()}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')}`;
  };

  const userDataItems = USER_DATA_ITEMS.map((item) => ({
    id: item.id,
    title: t[item.translKey as keyof typeof t],
    value:
      item.translKey === 'startDate'
        ? formatDateOnly(userData.startDate)
        : (userData[item.translKey as keyof typeof userData] ?? 0),
  }));

  const creditsItems: CreditsItem[] = CREDITS_ITEMS.map((item) => ({
    id: item.id,
    title: item.title,
    value: item.value,
    align: item.align as 'left' | 'right' | undefined,
    multiline: item.multiline,
  }));

  const openSourceItems = OPEN_SOURCE_ITEMS.map((item) => ({
    id: item.id,
    title: item.title,
    value: item.value,
  }));

  const renderMainItem = ({ item }: { item: (typeof data)[0] }) => {
    switch (item.type) {
      case 'nav':
        return (
          <TouchableOpacity
            style={styles.row}
            onPress={() => item.screen && setScreen(item.screen as ScreenType)}
          >
            <Text style={[styles.label, { color: colors.text }]}>{item.title}</Text>
            <Text style={[styles.arrow, { color: colors.secondary }]}>›</Text>
          </TouchableOpacity>
        );
      case 'lang':
        return (
          <View style={[styles.row, { zIndex: langOpen ? 1000 : 1 }]}>
            <Text style={[styles.label, { color: colors.text }]}>{item.title}</Text>
            <View style={{ width: 160 }}>
              <DropDownPicker
                listMode="SCROLLVIEW"
                dropDownDirection="BOTTOM"
                maxHeight={300}
                open={langOpen}
                value={language}
                items={LANGUAGES.map((l) => ({ label: l.label, value: l.value }))}
                setOpen={setLangOpen}
                setValue={(callback) => {
                  const next = callback(language);
                  setLanguage(next);
                }}
                setItems={() => {}}
                style={{
                  backgroundColor: isDarkTheme ? '#1c1c1e' : '#fff',
                  borderColor: isDarkTheme ? '#333' : '#ccc',
                  minHeight: 36,
                }}
                textStyle={{
                  color: isDarkTheme ? '#fff' : '#000',
                  fontSize: 14,
                }}
                dropDownContainerStyle={{
                  backgroundColor: isDarkTheme ? '#1c1c1e' : '#fff',
                  borderColor: isDarkTheme ? '#333' : '#ccc',
                }}
              />
            </View>
          </View>
        );
      case 'slideshow':
        return (
          <View style={styles.row}>
            <Text style={[styles.label, { color: colors.text }]}>{item.title}</Text>
            <View style={styles.inputWrapper}>
              <TextInput
                style={[
                  styles.input,
                  {
                    color: isDarkTheme ? '#fff' : '#000',
                    backgroundColor: isDarkTheme ? '#333' : '#fff',
                    borderColor: isDarkTheme ? '#555' : '#ccc',
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
      case 'theme':
        return (
          <View style={styles.row}>
            <Text style={[styles.label, { color: colors.text }]}>{item.title}</Text>
            <View style={styles.toggleGroup}>
              <TouchableOpacity
                style={[styles.toggleBtn, isDarkTheme && styles.toggleBtnActive]}
                onPress={() => setIsDarkTheme(true)}
              >
                <Text style={[styles.toggleText, isDarkTheme && styles.toggleTextActive]}>
                  Dark
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.toggleBtn, !isDarkTheme && styles.toggleBtnActive]}
                onPress={() => setIsDarkTheme(false)}
              >
                <Text style={[styles.toggleText, !isDarkTheme && styles.toggleTextActive]}>
                  Light
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        );
      case 'link':
        return (
          <TouchableOpacity
            style={styles.row}
            onPress={() => item.link && Linking.openURL(item.link)}
          >
            <Text style={[styles.label, { color: colors.text }]}>{item.title}</Text>
            <Text style={styles.link}>Link</Text>
          </TouchableOpacity>
        );
      case 'text':
        return <TextRow title={item.title} value={item.value!} />;
      default:
        return null;
    }
  };

  const renderSubList = ({ item }: { item: { id: string; title: string; value: string | number } }) => (
    <View style={styles.row}>
      <Text style={[styles.label, { color: colors.text }]}>{item.title}</Text>
      <Text style={[styles.value, { color: colors.secondary }]}>{item.value}</Text>
    </View>
  );

  const sunnyAppsItem = ({ item }: { item: { name: string; url: string; image: number } }) => (
    <TouchableOpacity
      style={styles.appItem}
      onPress={() => Linking.openURL(item.url)}
    >
      <Image source={item.image} style={styles.appImage} resizeMode="contain" />
      <Text style={[styles.appName, { color: colors.text }]}>{item.name}</Text>
    </TouchableOpacity>
  );

  const renderContent = () => {
    switch (screen) {
      case 'userData':
        return (
          <FlatList
            data={userDataItems}
            keyExtractor={(item) => item.id}
            renderItem={renderSubList}
            ItemSeparatorComponent={() => (
              <View style={[styles.separator, { backgroundColor: isDarkTheme ? '#333' : '#ddd' }]} />
            )}
          />
        );
      case 'credits':
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
              <View style={[styles.separator, { backgroundColor: isDarkTheme ? '#333' : '#ddd' }]} />
            )}
          />
        );
      case 'openSource':
        return (
          <FlatList
            data={openSourceItems}
            keyExtractor={(item) => item.id}
            renderItem={renderSubList}
            ItemSeparatorComponent={() => (
              <View style={[styles.separator, { backgroundColor: isDarkTheme ? '#333' : '#ddd' }]} />
            )}
          />
        );
      case 'sunnyApps':
        return (
          <FlatList
            data={APPS_LIST}
            keyExtractor={(item) => item.name}
            renderItem={sunnyAppsItem}
            ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: isDarkTheme ? '#333' : '#ddd', marginVertical: 8 }} />}
            contentContainerStyle={{ padding: 16 }}
          />
        );
      default:
        return (
          <FlatList
            data={data}
            keyExtractor={(item) => item.id}
            renderItem={renderMainItem}
            ItemSeparatorComponent={() => (
              <View style={[styles.separator, { backgroundColor: isDarkTheme ? '#333' : '#ddd' }]} />
            )}
          />
        );
    }
  };

  const getTitle = () => {
    switch (screen) {
      case 'userData':
        return t.userData;
      case 'credits':
        return t.credits;
      case 'sunnyApps':
        return t.sunnyApps;
      case 'openSource':
        return t.openSource;
      default:
        return t.settings;
    }
  };

  const showBack = screen !== 'main';

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaView style={{ backgroundColor: '#fff' }}>
        <View style={[styles.header, { backgroundColor: '#fff' }]}>
          {showBack ? (
            <Pressable onPress={() => setScreen('main')} style={styles.backBtn}>
              <Text style={{ fontSize: 16, color: '#000' }}>‹ Back</Text>
            </Pressable>
          ) : (
            <Pressable onPress={() => router.back()} style={styles.backBtn}>
              <Text style={{ fontSize: 16, color: '#000' }}>‹ Back</Text>
            </Pressable>
          )}
          <Text style={[styles.headerTitle, { color: colors.text }]}>
            {getTitle()}
          </Text>
          <View style={styles.backBtn} />
        </View>
      </SafeAreaView>
      <View style={{ flex: 1 }}>{renderContent()}</View>
      <View style={[styles.footer]}>
        <Image
          source={require('../../assets/SIL_logo_setting_mini_xxhdpi.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        <View style={styles.links}>
          <TouchableOpacity
            onPress={() =>
              Linking.openURL('https://marmalade-neptune-dbe.notion.site/Terms-Conditions-c18656ce6c6045e590f652bf8291f28b?pvs=74')
            }
          >
            <Text style={[styles.linkText, { color: colors.secondary }]}>Terms</Text>
          </TouchableOpacity>
          <Text style={[styles.linkText, { color: colors.secondary }]}>|</Text>
          <TouchableOpacity
            onPress={() =>
              Linking.openURL('https://marmalade-neptune-dbe.notion.site/Privacy-Policy-ced8ead72ced4d8791ca4a71a289dd6b')
            }
          >
            <Text style={[styles.linkText, { color: colors.secondary }]}>Privacy</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    minWidth: 60,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    minHeight: 50,
  },
  label: { fontSize: 16 },
  value: { fontSize: 16 },
  link: { fontSize: 14, color: '#007aff' },
  arrow: { fontSize: 20 },
  inputWrapper: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  input: {
    width: 50,
    borderWidth: 1,
    borderRadius: 6,
    padding: 6,
    textAlign: 'center',
    fontSize: 14,
  },
  unit: { fontSize: 14 },
  toggleGroup: { flexDirection: 'row', gap: 8 },
  toggleBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 6,
  },
  toggleBtnActive: {
    backgroundColor: '#007aff',
    borderColor: '#007aff',
  },
  toggleText: { fontSize: 14, color: '#555' },
  toggleTextActive: { color: '#fff', fontWeight: '600' },
  separator: { height: 1 },
  appItem: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
  },
  appImage: { width: 100, height: 100, marginBottom: 8 },
  appName: { fontSize: 16, textAlign: 'center' },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    flexWrap: 'nowrap',
    padding: 15,
    borderTopWidth: 1,
    borderColor: '#ccc',
    alignItems: 'center',
    backgroundColor: '#2c2c2e',
  },
  logo: { width: 120, height: 24, marginBottom: 5 },
  links: { flexDirection: 'row', alignItems: 'center' },
  linkText: { marginHorizontal: 2 },
});