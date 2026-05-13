import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import 'react-native-reanimated';

import { LanguageProvider } from '@/components/context/LanguageContext';
import { SlideshowTimeProvider } from '@/components/context/SlideshowTimeContext';
import { ThemeProvider } from '@/components/context/ThemeContext';
import { UserDataProvider } from '@/components/context/UserDataContext';
import { useColorScheme } from '@/hooks/useColorScheme';

/* 2026.05.12 스플래시가 즉시 사라지지 않도록 자동 숨김을 비활성화 by June */
void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  useEffect(() => {
    if (!loaded) return;

    /* 2026.05.12 앱 시작 시 스플래시를 1.5초 유지 후 숨기도록 지연 처리 by June */
    const timer = setTimeout(() => {
      void SplashScreen.hideAsync();
    }, 1500);

    return () => clearTimeout(timer);
  }, [loaded]);

  useEffect(() => {
    if (Platform.OS !== "android") return;

    let isMounted = true;
    let NavigationBarModule: any = null;

    const applyImmersive = async () => {
      try {
        if (!NavigationBarModule) {
          NavigationBarModule = require("expo-navigation-bar");
        }
        await NavigationBarModule.setBehaviorAsync("overlay-swipe");
        await NavigationBarModule.setVisibilityAsync("hidden");
      } catch {
        // expo-navigation-bar 미설치/미지원 환경에서는 무시
      }
    };

    void applyImmersive();

    const sub = AppState.addEventListener("change", (state) => {
      if (!isMounted) return;
      if (state === "active") {
        void applyImmersive();
      }
    });

    return () => {
      isMounted = false;
      sub.remove();
    };
  }, []);

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
