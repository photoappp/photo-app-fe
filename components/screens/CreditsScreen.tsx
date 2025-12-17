//  CreditsScreen.tsx
import React from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import ScreenWrapper from '@/components/screens/ScreenWrapper';

interface CreditsScreenProps {
	account?: {
		startDate?: string;
		timeSearchCount?: number;
		locationSearchCount?: number;
		totalPhotos?: number;
	};
	isDarkTheme: boolean;
}

const CreditsScreen: React.FC<CreditsScreenProps> = ({ account = {}, isDarkTheme }) => {
	const STAT_OPTIONS = [
		{ id: '1', title: 'Producer', value: 'R.S.' },
		{ id: '2', title: 'Programmer', value: '' },
		{ id: '3', title: 'Artist', value: '' },
		{ id: '4', title: 'QA Testers', value: '' },
		{ id: '5', title: 'Localization Managers', value: '' },
		{ id: '6', title: 'Special Thanks', value: '' },
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

export default CreditsScreen;
