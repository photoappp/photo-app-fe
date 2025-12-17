//  components/theme/ThemeContext.tsx
import React, { createContext, useContext, useState } from 'react';

interface ThemeContextType {
	isDarkTheme: boolean;
	setIsDarkTheme: (value: boolean) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
	const [isDarkTheme, setIsDarkTheme] = useState(false);

	return (
		<ThemeContext.Provider value={{ isDarkTheme, setIsDarkTheme }}>
			{children}
		</ThemeContext.Provider>
	);
};

export const useTheme = () => {
	const context = useContext(ThemeContext);
	if (!context) throw new Error('useTheme must be used within ThemeProvider');
	return context;
};
