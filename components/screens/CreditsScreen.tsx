//  CreditsScreen.tsx
import React from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import ScreenWrapper from '@/components/screens/ScreenWrapper';
import { useTheme } from '@/components/context/ThemeContext';

const CreditsScreen: React.FC = () => {
	const { colors } = useTheme();
	
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

export default CreditsScreen;
