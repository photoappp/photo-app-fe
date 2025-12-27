//  SettingsScreen.tsx
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, Linking, Modal, Button } from 'react-native';
import ScreenWrapper from '@/components/screens/ScreenWrapper';
import { router } from 'expo-router';
import { useTheme } from '@/components/context/ThemeContext';
import { useLanguage } from '@/components/context/LanguageContext';
import { TRANSLATIONS } from '@/constants/Translations';

const SettingsScreen = () => {
	const { isDarkTheme, setIsDarkTheme } = useTheme();
	const { language, setLanguage } = useLanguage();
	const [modalVisible, setModalVisible] = useState(false);

	const LANGUAGES = ['English', '한국어', '日本語', '繁體中文', '簡体中文'];

	const SETTINGS_OPTIONS = React.useMemo(() => [
		{ id: '1', title: TRANSLATIONS[language].userData, route: '/settings/userData' },
		{ id: '2', title: TRANSLATIONS[language].language, type: 'language' },
		{ id: '3', title: TRANSLATIONS[language].theme, type: 'theme' },
		{ id: '4', title: TRANSLATIONS[language].instagram, type: 'link', link: 'https://www.instagram.com/sunnyinnolab' },
		{ id: '5', title: TRANSLATIONS[language].twitter, type: 'link', link: 'https://x.com/sunnyinnolab' },
		{ id: '6', title: TRANSLATIONS[language].credits, route: '/settings/credits' },
		{ id: '7', title: TRANSLATIONS[language].openSource, route: '/settings/openSource' },
		{ id: '8', title: TRANSLATIONS[language].appVersion, type: 'text', value: '1.0.0' }
	], [language]);
	
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
