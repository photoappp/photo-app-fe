import React, { createContext, useContext, useState, ReactNode } from 'react';

interface Colors {
  background: string;
  text: string;
  secondary: string;
}

interface ThemeContextType {
  isDarkTheme: boolean;
  setIsDarkTheme: (value: boolean) => void;
  colors: Colors;
}

const lightColors: Colors = {
  background: '#FFFFFF',
  text: '#000000',
  secondary: '#666666',
};

const darkColors: Colors = {
  background: '#000000',
  text: '#FFFFFF',
  secondary: '#999999',
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [isDarkTheme, setIsDarkTheme] = useState(false);
  const colors = isDarkTheme ? darkColors : lightColors;

  return (
    <ThemeContext.Provider value={{ isDarkTheme, setIsDarkTheme, colors }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    return { isDarkTheme: false, setIsDarkTheme: () => {}, colors: lightColors };
  }
  return context;
}
