//  components/theme/LanguageContext.tsx
import React, { createContext, useContext, useState, useEffect } from 'react';
import * as RNLocalize from 'react-native-localize';

interface LanguageContextType {
	language: string;
	setLanguage: (lang: string) => void;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
	const [language, setLanguage] = useState('en');

	useEffect(() => {
			const locales = RNLocalize.getLocales();
			if (locales.length > 0) {
				const deviceLang = locales[0].languageCode; // 'ko', 'en', 'ja', 'zh', 'fr', 'es' 등

				switch (deviceLang) {
					case 'ko':
						setLanguage('ko');
						break;
					case 'en':
						setLanguage('en');
						break;
					case 'ja':
						setLanguage('ja');
						break;
					case 'zh':
						// 중국어는 region 구분
						if (countryCode === 'TW' || countryCode === 'HK' || countryCode === 'MO')
							setLanguage('zh-Hant'); // 번체
						else
							setLanguage('zh-Hans'); // 간체
						break;
					case 'fr':
						setLanguage('fr');
						break;
					case 'es':
						setLanguage('es');
						break;
					default:
						setLanguage('en'); // 그 외 언어는 English
				}
			}
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

