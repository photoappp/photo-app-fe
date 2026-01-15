//  components/theme/ThemeContext.tsx
import React, { createContext, useContext, useState } from 'react';

interface ThemeContextType {
	isDarkTheme: boolean;
	setIsDarkTheme: (value: boolean) => void;
	colors: {
			background: string;
			text: string;
			primary: string;
			secondary: string;
		};
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
	const [isDarkTheme, setIsDarkTheme] = useState(false);

	const colors = isDarkTheme
			? {
					background: '#000',
					text: '#fff',
					primary: '#007aff',
					secondary: '#fff',
				}
			: {
					background: '#fff',
					text: '#000',
					primary: '#007aff',
					secondary: '#555',
				};
	
	return (
		<ThemeContext.Provider value={{ isDarkTheme, setIsDarkTheme, colors }}>
			{children}
		</ThemeContext.Provider>
	);
};

export const useTheme = () => {
	const context = useContext(ThemeContext);
	if (!context) throw new Error('useTheme must be used within ThemeProvider');
	return context;
};
