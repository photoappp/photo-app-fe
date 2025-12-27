//  UserDataScreen.tsx
import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import ScreenWrapper from '@/components/screens/ScreenWrapper';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '@/components/context/ThemeContext';
import { useLanguage } from '@/components/context/LanguageContext';
import { TRANSLATIONS } from '@/constants/Translations';
import { useUserData } from '@/components/context/UserDataContext';

const UserDataScreen: React.FC = () => {
	const { userData, updateUserData, loadUserData } = useUserData();
	
	const { colors } = useTheme();
	const { language } = useLanguage();
	
	useEffect(() => {
		loadUserData();
	}, [loadUserData]);
	
	const formatDateOnly = (isoString?: string) => {
		if (!isoString) return '-';
		const d = new Date(isoString);
		return `${d.getFullYear()}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')}`;
	};
	
	const STAT_OPTIONS = React.useMemo(() => [
		{ id: '1', title: TRANSLATIONS[language].startDate, value: formatDateOnly(userData.startDate) },
		{ id: '2', title: TRANSLATIONS[language].timeSearchCount, value: userData.timeSearchCount ?? 0 },
		{ id: '3', title: TRANSLATIONS[language].locationSearchCount, value: userData.locationSearchCount ?? 0 },
		{ id: '4', title: TRANSLATIONS[language].totalPhotos, value: userData.totalPhotos ?? 0 },
	], [userData, language]);

	const renderItem = ({ item }: { item: any }) => (
		<View style={styles.optionRow}>
			 <Text style={[styles.optionText, { color: colors.text }]}>{item.title}</Text>
			 <Text style={[styles.valueText, { color: colors.secondary }]}>{item.value}</Text>
		</View>
	);

	return (
		<ScreenWrapper>
			<FlatList
				data={STAT_OPTIONS}
				keyExtractor={(item) => item.id}
				renderItem={renderItem}
				ItemSeparatorComponent={() => <View style={[styles.separator, { backgroundColor: colors.secondary }]} />}
			/>
		</ScreenWrapper>
	);
};

const styles = StyleSheet.create({
	optionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', height: 50, paddingHorizontal: 15 },
	optionText: { fontSize: 16 },
	valueText: { fontSize: 16 },
	separator: { height: 1 },
});

export default UserDataScreen;
