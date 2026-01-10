//  SunnyAppsScreen.tsx
import React from 'react';
import ScreenWrapper from '@/components/screens/ScreenWrapper';
import { useTheme } from '@/components/context/ThemeContext';
import { View, Text, FlatList, Image, TouchableOpacity, Linking, StyleSheet } from "react-native";
import { APPS_LIST } from "@/constants/AppsList";

const SunnyAppsScreen: React.FC = () => {
	const { colors } = useTheme();
	
	const openLink = (url: string) => {
		Linking.openURL(url).catch((err) => console.error("Failed to open URL:", err));
	};
	
	const renderItem = ({ item }: { item: any }) => (
		<View style={styles.optionRow}>
			<Text style={[styles.optionText, { color: colors.text }]}>{item.title}</Text>
			<Text style={[styles.valueText, { color: colors.secondary }]}>{item.value}</Text>
		</View>
	);

	return (
					<ScreenWrapper>
						<FlatList
							data={APPS_LIST}
							keyExtractor={(item) => item.name}
							renderItem={({ item }) => (
								<TouchableOpacity
									style={styles.itemContainer}
									onPress={() => openLink(item.url)}
									activeOpacity={0.7}
								>
									<Image source={item.image} style={styles.image} resizeMode="contain" />
									<Text style={[styles.name, { color: colors.text }]}>{item.name}</Text>
								</TouchableOpacity>
							)}
							ItemSeparatorComponent={() => <View style={styles.separator} />}
							contentContainerStyle={{ padding: 16 }}
						/>
					</ScreenWrapper>
	);
};

const styles = StyleSheet.create({
	itemContainer: {
			alignItems: 'center',       // 가운데 정렬
			justifyContent: 'center',
			paddingVertical: 16,
		},
		image: {
			width: 100,                 // 아이콘 100px
			height: 100,
			marginBottom: 8,            // 아이콘과 앱 이름 사이 간격
		},
		name: {
			fontSize: 16,
			textAlign: 'center',
		},
		separator: {
			height: 1,
			backgroundColor: '#D1D5DB', // 회색 줄
			marginVertical: 8,
		},
});

export default SunnyAppsScreen;
