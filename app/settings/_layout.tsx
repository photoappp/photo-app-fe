//  app/settings/_layout.tsx
import { Stack, router } from 'expo-router';
import { Pressable, Text } from 'react-native';
import { useTheme } from '@/components/context/ThemeContext';
import { useLanguage } from '@/components/context/LanguageContext';
import { TRANSLATIONS } from '@/constants/Translations';

export default function SettingsLayout() {
	const { isDarkTheme, colors } = useTheme();
	const { language } = useLanguage();
	
	return (
		<Stack
					screenOptions={{
							headerBackTitleVisible: false,
							headerTitleAlign: 'center',
							headerStyle: {
									backgroundColor: isDarkTheme ? '#121212' : '#fff',
							},
							headerTintColor: isDarkTheme ? '#fff' : '#000',
					}}
		>
			<Stack.Screen
				name="index"
				options={{
						title: TRANSLATIONS[language].settings,
						headerLeft: () => (
							<Pressable onPress={() => router.back()}>
								<Text style={{ marginLeft: 10, color: colors.text }}>‹ Back</Text>
							</Pressable>
						),
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
