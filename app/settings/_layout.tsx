//  app/settings/_layout.tsx
import { Stack, router } from 'expo-router';
import { Pressable, Text } from 'react-native';
import { useTheme } from '@/components/theme/ThemeContext';

export default function SettingsLayout() {
	const { isDarkTheme } = useTheme();
	
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
						title: 'Settings',
						headerLeft: () => (
							<Pressable onPress={() => router.back()}>
								<Text style={{ marginLeft: 10 }}>‹ Back</Text>
							</Pressable>
						),
					}}
			/>

			<Stack.Screen
				name="userData"
				options={{ title: 'User Data' }}
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
