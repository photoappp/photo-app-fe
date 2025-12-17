//  UserDataScreen.tsx
import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import ScreenWrapper from '@/components/screens/ScreenWrapper';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface UserDataScreenProps {
	isDarkTheme: boolean;
}

const UserDataScreen: React.FC<UserDataScreenProps> = ({ isDarkTheme }) => {
	const [userData, setUserData] = useState({
			startDate: '-',
			timeSearchCount: 0,
			locationSearchCount: 0,
			totalPhotos: 0,
		});

	useEffect(() => {
		async function loadUserData() {
			const stored = await AsyncStorage.getItem('userData');
			if (stored) {
				setUserData(JSON.parse(stored));
			}
		}
		loadUserData();
	}, []);
	
	const formatDateOnly = (isoString?: string) => {
		if (!isoString) return '-';
		const d = new Date(isoString);
		return `${d.getFullYear()}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')}`;
	};
	
	const STAT_OPTIONS = [
		{ id: '1', title: '사용 시작일', value: formatDateOnly(userData.startDate) },
		{ id: '2', title: '시간 검색 횟수', value: userData.timeSearchCount ?? 0 },
		{ id: '3', title: '위치 검색 횟수', value: userData.locationSearchCount ?? 0 },
		{ id: '4', title: '총 사진 개수', value: userData.totalPhotos ?? 0 },
	];

	const renderItem = ({ item }: { item: any }) => (
		<View style={styles.optionRow}>
			<Text style={[styles.optionText, { color: isDarkTheme ? '#fff' : '#000' }]}>{item.title}</Text>
			<Text style={[styles.valueText, { color: isDarkTheme ? '#aaa' : '#555' }]}>{item.value}</Text>
		</View>
	);

	return (
		<ScreenWrapper isDarkTheme={isDarkTheme}>
			<FlatList
				data={STAT_OPTIONS}
				keyExtractor={(item) => item.id}
				renderItem={renderItem}
				ItemSeparatorComponent={() => <View style={[styles.separator, { backgroundColor: isDarkTheme ? '#333' : '#ddd' }]} />}
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
