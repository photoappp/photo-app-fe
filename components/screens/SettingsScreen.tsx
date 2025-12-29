//  SettingsScreen.tsx
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, Linking, Modal, Button, TextInput } from 'react-native';
import ScreenWrapper from '@/components/screens/ScreenWrapper';
import { router } from 'expo-router';
import { useTheme } from '@/components/context/ThemeContext';
import { useLanguage } from '@/components/context/LanguageContext';
import { useSlideshowTime } from '@/components/context/SlideshowTimeContext';
import { TRANSLATIONS } from '@/constants/Translations';

const SettingsScreen = () => {
	const { isDarkTheme, setIsDarkTheme } = useTheme();
	const { language, setLanguage } = useLanguage();
	const { slideshowTime, setSlideshowTime } = useSlideshowTime();
	const [modalVisible, setModalVisible] = useState(false);

	const LANGUAGES = ['English', '한국어', '日本語', '繁體中文', '簡体中文'];

	const SETTINGS_OPTIONS = React.useMemo(() => [
		{ id: 'userData', title: TRANSLATIONS[language].userData, route: '/settings/userData' },
		{ id: 'language', title: TRANSLATIONS[language].language, type: 'language' },
		{ id: 'slideshow', title: TRANSLATIONS[language].slideshowInterval, type: 'slideshow', value: slideshowTime },
		{ id: 'theme', title: TRANSLATIONS[language].theme, type: 'theme' },
		{ id: 'instagram', title: TRANSLATIONS[language].instagram, type: 'link', link: 'https://www.instagram.com/sunnyinnolab' },
		{ id: 'twitter', title: TRANSLATIONS[language].twitter, type: 'link', link: 'https://x.com/sunnyinnolab' },
		{ id: 'credits', title: TRANSLATIONS[language].credits, route: '/settings/credits' },
		{ id: 'openSource', title: TRANSLATIONS[language].openSource, route: '/settings/openSource' },
		{ id: 'appVersion', title: TRANSLATIONS[language].appVersion, type: 'text', value: '1.0.0' }
	], [language, slideshowTime]);
	
	const [inputValue, setInputValue] = useState((slideshowTime / 1000).toString());
	
	const renderItem = ({ item }: { item: any }) => {
		switch (item.type) {
			case 'language':
				return (
					<TouchableOpacity style={styles.optionRow} onPress={() => setModalVisible(true)}>
						<Text style={[styles.optionText, { color: isDarkTheme ? '#fff' : '#000' }]}>{item.title}</Text>
						<Text style={styles.valueText}>{/* 현재 화면에 보여줄 언어 */
							(() => {
								const displayMap: Record<string, string> = {
									'English': 'English',
									'Korean': '한국어',
									'Japanese': '日本語',
									'ChineseTraditional': '繁體中文',
									'ChineseSimplified': '簡体中文',
								};
								return displayMap[language];
							})()}
						</Text>
					</TouchableOpacity>
				);
			case 'slideshow':
				return (
					<View style={styles.optionRow}>
						<Text style={[styles.optionText, { color: isDarkTheme ? '#fff' : '#000' }]}>
							{item.title}
						</Text>
						<View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
							<TextInput
								style={{
									borderWidth: 1,
									borderColor: isDarkTheme ? '#555' : '#ccc',
									borderRadius: 6,
									padding: 6,
									width: 60,
									textAlign: 'center',
									fontSize: 16,
									color: isDarkTheme ? '#fff' : '#000',          // 다크모드면 글씨 흰색
									backgroundColor: isDarkTheme ? '#333' : '#fff' // 다크모드면 배경 어둡게
								}}
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
							<Text style={{ color: isDarkTheme ? '#fff' : '#000' }}>sec</Text>
						</View>
					</View>
				);
			case 'theme':
				return (
					<View style={styles.optionRow}>
						<Text style={[styles.optionText, { color: isDarkTheme ? '#fff' : '#000' }]}>{item.title}</Text>
						<View style={styles.themeButtonGroup}>
							<TouchableOpacity
								style={[styles.themeButton, isDarkTheme && styles.activeButton]}
								onPress={() => setIsDarkTheme(true)}
							>
								<Text style={[styles.themeButtonText, isDarkTheme && styles.activeButtonText]}>Dark</Text>
							</TouchableOpacity>
							<TouchableOpacity
								style={[styles.themeButton, !isDarkTheme && styles.activeButton]}
								onPress={() => setIsDarkTheme(false)}
							>
								<Text style={[styles.themeButtonText, !isDarkTheme && styles.activeButtonText]}>Light</Text>
							</TouchableOpacity>
						</View>
					</View>
				);
			case 'link':
				return (
					<View style={styles.optionRow}>
						<Text style={[styles.optionText, { color: isDarkTheme ? '#fff' : '#000' }]}>{item.title}</Text>
						<TouchableOpacity style={styles.linkButton} onPress={() => Linking.openURL(item.link)}>
							<Text style={styles.linkText}>Open</Text>
						</TouchableOpacity>
					</View>
				);
			case 'text':
				return (
					<View style={styles.optionRow}>
						<Text style={[styles.optionText, { color: isDarkTheme ? '#fff' : '#000' }]}>{item.title}</Text>
						{item.value && <Text style={[styles.valueText, { color: isDarkTheme ? '#aaa' : '#555' }]}>{item.value}</Text>}
					</View>
				);
			default:
				return (
						<TouchableOpacity style={styles.optionRow} onPress={() => item.route && router.push(item.route)}>
							<Text style={[styles.optionText, { color: isDarkTheme ? '#fff' : '#000' }]}>{item.title}</Text>
						</TouchableOpacity>
				);
		}
	};

	return (
		<ScreenWrapper>
			<FlatList
				data={SETTINGS_OPTIONS}
				keyExtractor={(item) => item.id}
				renderItem={renderItem}
				ItemSeparatorComponent={() => <View style={[styles.separator, { backgroundColor: isDarkTheme ? '#333' : '#ddd' }]} />}
			/>

			{/* Language Modal */}
			<Modal visible={modalVisible} transparent animationType="slide">
				<View style={styles.modalOverlay}>
					<View style={styles.modalContent}>
						{LANGUAGES.map((lang) => (
							<TouchableOpacity
								key={lang}
								style={styles.modalItem}
								onPress={() => {
										const keyMap: Record<string, string> = {
											'English': 'English',
											'한국어' : 'Korean',
											'日本語': 'Japanese',
											'繁體中文': 'ChineseTraditional',
											'簡体中文': 'ChineseSimplified',
										};
									setLanguage(keyMap[lang]);
									setModalVisible(false);
								}}
							>
								<Text style={styles.modalItemText}>{lang}</Text>
							</TouchableOpacity>
						))}
						<Button title="Cancel" onPress={() => setModalVisible(false)} />
					</View>
				</View>
			</Modal>
		</ScreenWrapper>
	);
};

const styles = StyleSheet.create({
	optionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', height: 50, paddingHorizontal: 15 },
	optionText: { fontSize: 16 },
	valueText: { fontSize: 16, color: '#555' },
	themeButtonGroup: { flexDirection: 'row', gap: 8 },
	themeButton: { paddingVertical: 6, paddingHorizontal: 12, borderWidth: 1, borderColor: '#ccc', borderRadius: 6 },
	activeButton: { backgroundColor: '#007aff', borderColor: '#007aff' },
	themeButtonText: { fontSize: 14, color: '#555' },
	activeButtonText: { color: '#fff', fontWeight: '600' },
	linkButton: { paddingVertical: 6, paddingHorizontal: 10, backgroundColor: '#e0e0e0', borderRadius: 5 },
	linkText: { fontSize: 14, color: '#007aff' },
	separator: { height: 1 },
	modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#00000088' },
	modalContent: { backgroundColor: '#fff', width: 250, borderRadius: 8, padding: 10 },
	modalItem: { paddingVertical: 10 },
	modalItemText: { fontSize: 16 },
});

export default SettingsScreen;
