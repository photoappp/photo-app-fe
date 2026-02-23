//  CreditsScreen.tsx
import React from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import ScreenWrapper from '@/components/screens/ScreenWrapper';
import { useTheme } from '@/components/context/ThemeContext';

const CreditsScreen: React.FC = () => {
	const { colors, isDarkTheme } = useTheme();
	
	const STAT_OPTIONS = [
		{ id: 'producer', title: 'Producer', value: 'R.S.' },
		{ id: 'programmers', title: 'Programmers', value: 'Yen Han, June Chun, Minji Kim', multiline: true },
		/* 2026.01.27 id key 값 중복이라 제거함 by June */
		//{ id: 'designer', id: 'designer', title: 'UI/UX Designer', value: 'Jenny Kim' },
		{ id: 'designer', title: 'UI/UX Designer', value: 'Jenny Kim' },
		{ id: 'qaTesters', title: 'QA Testers', value: 'YC, SJ' },
		{ id: 'localizationManagers', title: 'Localization Managers', value: 'Mary, Carol, Ann, Edward', multiline: true },
		{ id: 'specialThanks', title: 'Special Thanks', value: 'Toronto Korean Developers', multiline: true },
	];
	
	const renderItem = ({ item }: { item: any }) => {
		if (item.multiline) { // 2026.02.10 value가 긴 경우 multi line 처리 by Minji
			return (
						<View style={styles.optionColumn}>
							<Text style={[styles.optionText, { color: colors.text }]}>
								{item.title}
							</Text>
							<Text style={[styles.valueText, styles.multilineValue, { color: colors.secondary }]}>
								{item.value}
							</Text>
						</View>
					);
			}
		return (
						<View style={styles.optionRow}>
							<Text style={[styles.optionText, { color: colors.text }]}>{item.title}</Text>
							<Text style={[styles.valueText, { color: colors.secondary }]}>{item.value}</Text>
						</View>
					);
	};

	return (
		<ScreenWrapper>
			<FlatList
				data={STAT_OPTIONS}
				keyExtractor={(item) => item.id}
				renderItem={renderItem}
					ItemSeparatorComponent={() => <View style={[styles.separator, { backgroundColor: isDarkTheme ? 'rgba(255,255,255,0.2)' : '#D1D5DB' }]} />}
			/>
		</ScreenWrapper>
	);
};

const styles = StyleSheet.create({
	optionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 15, paddingHorizontal: 15, marginVertical: 4 },
	optionColumn: { flexDirection: 'column', paddingVertical: 12, paddingHorizontal: 15, marginVertical: 4 },
	multilineValue: { marginTop: 12, lineHeight: 20 }, // textAlign: 'right', alignSelf: 'stretch' - 오른쪽 정렬 적용 시
	optionText: { fontSize: 16 },
	valueText: { fontSize: 16 },
	separator: { height: 1 },
});

export default CreditsScreen;
