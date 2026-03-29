//  app/settings/_layout.tsx
import { Stack, router } from 'expo-router';
import { Pressable, Text } from 'react-native';
import { useTheme } from '@/components/context/ThemeContext';
import { useLanguage } from '@/components/context/LanguageContext';
import { TRANSLATIONS } from '@/constants/Translations';

export default function SettingsLayout() {
	const { isDarkTheme, colors } = useTheme();
	const { language } = useLanguage();
	
	// 공통 Back 버튼
	// 2026-03-27 left margin 수정 by Minji
		const BackButton = () => (
			<Pressable onPress={() => router.back()}>
				<Text style={{ fontsize: 18, color: colors.text, includeFontPadding: false }}>‹ Back</Text>
			</Pressable>
		);

	return (
		<Stack
					screenOptions={{
							headerBackTitleVisible: false,
							headerTitleAlign: 'center',
							headerStyle: {
									backgroundColor: isDarkTheme ? '#121212' : '#fff',
							},
							headerTintColor: isDarkTheme ? '#fff' : '#000',
							// 모든 화면에 공통 Back 버튼 적용
							headerLeft: BackButton,
					}}
		>
			<Stack.Screen
				name="index"
				options={{
						title: TRANSLATIONS[language].settings,
					}}
			/>

			<Stack.Screen
				name="userData"
				options={{ title: 'User Data' }}
			/>
			
			<Stack.Screen
				name="sunnyApps"
				options={{ title: 'Sunny\'s Games and Apps' }}
			/>

			<Stack.Screen
				name="credits"
				options={{ title: 'Credits' }}
			/>

			<Stack.Screen
				name="openSource"
				options={{ title: 'Open Source Info' }}
			/>
		</Stack>
	);
}
