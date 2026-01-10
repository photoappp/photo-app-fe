//  OpenSourceInfoScreen.tsx
import React from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import ScreenWrapper from '@/components/screens/ScreenWrapper';
import { useTheme } from '@/components/context/ThemeContext';

const OpenSourceInfoScreen: React.FC = () => {
	const { colors } = useTheme();
	
	const STAT_OPTIONS = [
		{ id: '1', title: '@amplitude/analytics-react-native', value: '1.5.16' },
		{ id: '2', title: '@expo/vector-icons', value: '15.0.2' },
		{ id: '3', title: '@react-native-camera-roll/camera-roll', value: '7.10.2' },
		{ id: '4', title: '@react-native-community/datetimepicker', value: '8.5.0' },
		{ id: '5', title: '@react-navigation/bottom-tabs', value: '7.3.10' },
		{ id: '6', title: '@react-navigation/elements', value: '2.3.8' },
		{ id: '7', title: '@react-navigation/native', value: '7.1.6' },
		{ id: '8', title: 'expo', value: '54.0.19' },
		{ id: '9', title: 'expo-blur', value: '15.0.7' },
		{ id: '10', title: 'expo-constants', value: '18.0.9' },
		{ id: '11', title: 'expo-dev-client', value: '6.0.17' },
		{ id: '12', title: 'expo-font', value: '14.0.9' },
		{ id: '13', title: 'expo-haptics', value: '15.0.7' },
		{ id: '14', title: 'expo-image', value: '3.0.9' },
		{ id: '15', title: 'expo-linking', value: '8.0.8' },
		{ id: '16', title: 'expo-location', value: '19.0.7' },
		{ id: '17', title: 'expo-media-library', value: '18.2.0' },
		{ id: '18', title: 'expo-router', value: '6.0.12' },
		{ id: '19', title: 'expo-splash-screen', value: '31.0.10' },
		{ id: '20', title: 'expo-status-bar', value: '3.0.8' },
		{ id: '21', title: 'expo-symbols', value: '1.0.7' },
		{ id: '22', title: 'expo-system-ui', value: '6.0.7' },
		{ id: '23', title: 'expo-web-browser', value: '15.0.8' },
		{ id: '24', title: 'react', value: '19.1.0' },
		{ id: '25', title: 'react-dom', value: '19.1.0' },
		{ id: '26', title: 'react-native', value: '0.81.4' },
		{ id: '27', title: 'react-native-gesture-handler', value: '2.28.0' },
		{ id: '28', title: 'react-native-image-viewing', value: '0.2.2' },
		{ id: '29', title: 'react-native-reanimated', value: '4.1.1' },
		{ id: '30', title: 'react-native-safe-area-context', value: '5.6.0' },
		{ id: '31', title: 'react-native-screens', value: '4.16.0' },
		{ id: '32', title: 'react-native-uuid', value: '2.0.3' },
		{ id: '33', title: 'react-native-web', value: '0.21.0' },
		{ id: '34', title: 'react-native-webview', value: '13.15.0' },
		{ id: '35', title: 'react-native-worklets', value: '0.5.1' },
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

export default OpenSourceInfoScreen;
