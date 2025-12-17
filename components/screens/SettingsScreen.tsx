//  SettingsScreen.tsx
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, Linking, Modal, Button } from 'react-native';
import ScreenWrapper from '@/components/screens/ScreenWrapper';
import { router } from 'expo-router';
import { useTheme } from '@/components/theme/ThemeContext';

const SettingsScreen = () => {
	const { isDarkTheme, setIsDarkTheme } = useTheme();
	const [language, setLanguage] = useState('English');
	const [modalVisible, setModalVisible] = useState(false);

	const LANGUAGES = ['English', 'Korean', 'Japanese', 'Chinese (Traditional)', 'Chinese (Simplified)'];

	const SETTINGS_OPTIONS = [
		{ id: '1', title: 'User Data', route: '/settings/userData' },
		{ id: '2', title: 'Language', type: 'language' },
		{ id: '3', title: 'Theme', type: 'theme' },
		{ id: '4', title: 'Instagram', type: 'link', link: 'https://www.instagram.com/sunnyinnolab' },
		{ id: '5', title: 'X (Twitter)', type: 'link', link: 'https://x.com/sunnyinnolab' },
		{ id: '6', title: 'Credits', route: '/settings/credits' },
		{ id: '7', title: 'Open Source Info', route: '/settings/openSource' },
	];

	const renderItem = ({ item }: { item: any }) => {
		switch (item.type) {
			case 'language':
				return (
					<TouchableOpacity style={styles.optionRow} onPress={() => setModalVisible(true)}>
						<Text style={[styles.optionText, { color: isDarkTheme ? '#fff' : '#000' }]}>{item.title}</Text>
						<Text style={styles.valueText}>{language}</Text>
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
									setLanguage(lang);
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
