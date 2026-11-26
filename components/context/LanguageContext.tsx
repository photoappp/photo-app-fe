//  components/theme/LanguageContext.tsx
import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
/* 2026.11.25 설정에서 고른 언어를 앱 재시작 후에도 유지하기 위해 저장소 추가 by yen */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as RNLocalize from 'react-native-localize';
import { normalizeLanguage, SupportedLanguage, SUPPORTED_LANGUAGES } from '@/constants/Translations';

interface LanguageContextType {
	language: SupportedLanguage;
	setLanguage: (lang: string) => void;
}

const LanguageContext = createContext<LanguageContextType | undefined>(
  undefined,
);

/* 2026.11.25 사용자가 설정에서 직접 고른 언어 저장 키 by yen */
const LANGUAGE_STORAGE_KEY = 'appLanguage';

/* 2026.04.22 디바이스 locale에서 countryCode를 함께 읽어 중국어 간체/번체를 안정적으로 분기하기 위해 초기화 로직을 재구현 by June */
/* 2026.11.25 기기 언어 판별을 함수로 분리 — 동기 함수라 첫 렌더부터 기기 언어를 써서 영어가 잠깐 보이던 현상 제거.
   지원하지 않는 언어면 영어 by yen */
const detectDeviceLanguage = (): SupportedLanguage => {
	const locales = RNLocalize.getLocales();
	if (locales.length <= 0) return 'en';

	const primary = locales[0];
	const deviceLang = primary.languageCode;
	const deviceRegion = primary.countryCode ?? '';

	if (deviceLang === 'zh') {
		const isTraditionalRegion =
			deviceRegion === 'TW' || deviceRegion === 'HK' || deviceRegion === 'MO';
		return isTraditionalRegion ? 'zh-Hant' : 'zh-Hans';
	}

	return normalizeLanguage(deviceLang);
};

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
	/* 2026.11.25 시작값을 기기 언어로(저장된 언어가 있으면 아래에서 바로 교체) by yen */
	const [language, setLanguageState] = useState<SupportedLanguage>(detectDeviceLanguage);
	/* 2026.11.25 저장된 언어를 읽는 중에 사용자가 언어를 바꾸면, 늦게 읽힌 저장값이 덮어쓰지 않도록 표시 by yen */
	const userChangedRef = useRef(false);

	/* 2026.04.22 외부에서 전달되는 언어 값도 정규화해 지원 언어 외 문자열 유입으로 인한 번역 누락을 막기 위해 래퍼 setter를 추가 by June */
	/* 2026.11.25 설정에서 바꾼 언어를 저장해 재시작 후에도 유지 by yen */
	const setLanguage = (lang: string) => {
		const next = normalizeLanguage(lang);
		userChangedRef.current = true;
		setLanguageState(next);
		AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, next).catch((error) => {
			console.error('Failed to save language:', error);
		});
	};

	/* 2026.11.25 사용자가 직접 고른 언어가 저장돼 있으면 그 언어를 사용, 없으면 기기 언어(시작값) 유지 by yen */
	useEffect(() => {
		let cancelled = false;
		AsyncStorage.getItem(LANGUAGE_STORAGE_KEY)
			.then((stored) => {
				if (cancelled || userChangedRef.current || !stored) return;
				if (SUPPORTED_LANGUAGES.includes(stored as SupportedLanguage)) {
					setLanguageState(stored as SupportedLanguage);
				}
			})
			.catch((error) => {
				console.error('Failed to load language:', error);
			});
		return () => {
			cancelled = true;
		};
	}, []);

	return (
		<LanguageContext.Provider value={{ language, setLanguage }}>
			{children}
		</LanguageContext.Provider>
	);
};

export const useLanguage = () => {
	const context = useContext(LanguageContext);
	if (!context) throw new Error('useLanguage must be used within LanguageProvider');
	return context;
};
