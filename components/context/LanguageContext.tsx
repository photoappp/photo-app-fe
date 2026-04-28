//  components/theme/LanguageContext.tsx
import React, { createContext, useContext, useState, useEffect } from 'react';
import * as RNLocalize from 'react-native-localize';
import { normalizeLanguage, SupportedLanguage } from '@/constants/Translations';

interface LanguageContextType {
	language: SupportedLanguage;
	setLanguage: (lang: string) => void;
}

const LanguageContext = createContext<LanguageContextType | undefined>(
  undefined,
);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
	const [language, setLanguageState] = useState<SupportedLanguage>('en');

	/* 2026.04.22 외부에서 전달되는 언어 값도 정규화해 지원 언어 외 문자열 유입으로 인한 번역 누락을 막기 위해 래퍼 setter를 추가 by June */
	const setLanguage = (lang: string) => {
		setLanguageState(normalizeLanguage(lang));
	};

	useEffect(() => {
			/* 2026.04.22 디바이스 locale에서 countryCode를 함께 읽어 중국어 간체/번체를 안정적으로 분기하기 위해 초기화 로직을 재구현 by June */
			const locales = RNLocalize.getLocales();
			if (locales.length <= 0) {
				setLanguageState('en');
				return;
			}

			const primary = locales[0];
			const deviceLang = primary.languageCode;
			const deviceRegion = primary.countryCode ?? '';

			if (deviceLang === 'zh') {
				const isTraditionalRegion =
					deviceRegion === 'TW' || deviceRegion === 'HK' || deviceRegion === 'MO';
				setLanguageState(isTraditionalRegion ? 'zh-Hant' : 'zh-Hans');
				return;
			}

			setLanguageState(normalizeLanguage(deviceLang));
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
