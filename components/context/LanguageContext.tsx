//  components/theme/LanguageContext.tsx
import React, { createContext, useContext, useState, useEffect } from 'react';
import * as RNLocalize from 'react-native-localize';

interface LanguageContextType {
	language: string;
	setLanguage: (lang: string) => void;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
	const [language, setLanguage] = useState('English');

	useEffect(() => {
			const locales = RNLocalize.getLocales();
			if (locales.length > 0) {
				const deviceLang = locales[0].languageCode; // 'ko', 'en', 'ja', 'zh', 'fr', 'es' 등

				switch (deviceLang) {
					case 'ko':
						setLanguage('Korean');
						break;
					case 'en':
						setLanguage('English');
						break;
					case 'ja':
						setLanguage('Japanese');
						break;
					case 'zh':
						// 중국어는 region 구분
						if (locales[0].countryCode === 'TW') setLanguage('ChineseTraditional');
						else setLanguage('ChineseSimplified');
						break;
					case 'fr':
						setLanguage('French');
						break;
					case 'es':
						setLanguage('Spanish');
						break;
					default:
						setLanguage('English'); // 그 외 언어는 English
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

