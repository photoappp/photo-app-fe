//  CreditsScreen.tsx
import React from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import ScreenWrapper from '@/components/screens/ScreenWrapper';
import { useTheme } from '@/components/context/ThemeContext';

const CreditsScreen: React.FC = () => {
	const { colors } = useTheme();
	
	const STAT_OPTIONS = [
		{ id: 'producer', title: 'Producer', value: 'R.S.' },
		{ id: 'programmers', title: 'Programmers', value: 'Yen Han, June Chun, Minji Kim' },
		{ id: 'designer', id: 'designer', title: 'UI/UX Designer', value: 'Jenny Kim' },
		{ id: 'qaTesters', title: 'QA Testers', value: 'YC, SJ' },
		{ id: 'localizationManagers', title: 'Localization Managers', value: 'Mary, Carol, Ann, Edward' },
		{ id: 'specialThanks', title: 'Special Thanks', value: 'Toronto Korean Developers' },
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
