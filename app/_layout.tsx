import { DarkTheme, DefaultTheme } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/useColorScheme';
import { ThemeProvider } from '@/components/context/ThemeContext';
import { LanguageProvider } from '@/components/context/LanguageContext';
import { UserDataProvider } from '@/components/context/UserDataContext';
import { SlideshowTimeProvider } from '@/components/context/SlideshowTimeContext';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  if (!loaded) {
    // Async font loading only occurs in development.
    return null;
  }

  return (
		<UserDataProvider>
			<ThemeProvider>
				<LanguageProvider>
					<SlideshowTimeProvider>
						<Stack>
							<Stack.Screen name="(tabs)" options={{ headerShown: false }} />
							<Stack.Screen name="settings" options={{ headerShown: false }} />
							<Stack.Screen name="+not-found" />
						</Stack>
						<StatusBar style="auto" />
					</SlideshowTimeProvider>
				</LanguageProvider>
			</ThemeProvider>
		</UserDataProvider>
  );
}
