import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface SlideshowTimeContextType {
  slideshowTime: number;
  setSlideshowTime: (time: number) => void;
}

const SlideshowTimeContext = createContext<SlideshowTimeContextType | undefined>(undefined);

const STORAGE_KEY = 'slideshowTime';

export function SlideshowTimeProvider({ children }: { children: ReactNode }) {
  const [slideshowTime, setSlideshowTimeState] = useState(2000);

  useEffect(() => {
    loadSlideshowTime();
  }, []);

  const loadSlideshowTime = async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        setSlideshowTimeState(JSON.parse(stored));
      }
    } catch (error) {
      console.error('Failed to load slideshow time:', error);
    }
  };

  const setSlideshowTime = (time: number) => {
    setSlideshowTimeState(time);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(time)).catch(error => {
      console.error('Failed to save slideshow time:', error);
    });
  };

  return (
    <SlideshowTimeContext.Provider value={{ slideshowTime, setSlideshowTime }}>
      {children}
    </SlideshowTimeContext.Provider>
  );
}

export function useSlideshowTime() {
  const context = useContext(SlideshowTimeContext);
  if (!context) {
    return { slideshowTime: 2000, setSlideshowTime: () => {} };
  }
  return context;
}
