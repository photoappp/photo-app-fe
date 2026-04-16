import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface UserData {
  startDate: string;
  dateSearchCount: number;
  timeSearchCount: number;
  locationSearchCount: number;
  totalPhotos: number;
}

interface UserDataContextType {
  userData: UserData;
  updateUserData: (data: Partial<UserData>) => void;
  incrementDateFilter: () => void;
  incrementTimeFilter: () => void;
  incrementLocationFilter: () => void;
  updateTotalPhotos: (count: number) => void;
}

const defaultUserData: UserData = {
  startDate: '-',
  dateSearchCount: 0,
  timeSearchCount: 0,
  locationSearchCount: 0,
  totalPhotos: 0,
};

const STORAGE_KEY = 'userData';

const UserDataContext = createContext<UserDataContextType | undefined>(undefined);

export const UserDataProvider = ({ children }: { children: ReactNode }) => {
  const [userData, setUserData] = useState<UserData>(defaultUserData);

  useEffect(() => {
    loadUserData();
  }, []);

  const loadUserData = async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (!parsed.startDate || parsed.startDate === '-') {
          parsed.startDate = new Date().toISOString().split('T')[0];
          await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
        }
        setUserData(parsed);
      } else {
        const today = new Date().toISOString().split('T')[0];
        const initialData = { ...defaultUserData, startDate: today };
        setUserData(initialData);
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(initialData));
      }
    } catch (error) {
      console.error('Failed to load user data:', error);
    }
  };

  const saveUserData = async (data: UserData) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      console.error('Failed to save user data:', error);
    }
  };

  const updateUserData = (data: Partial<UserData>) => {
    setUserData(prev => {
      const updated = { ...prev, ...data };
      saveUserData(updated);
      return updated;
    });
  };

  const incrementDateFilter = () => {
    setUserData(prev => {
      const updated = { ...prev, dateSearchCount: prev.dateSearchCount + 1 };
      saveUserData(updated);
      return updated;
    });
  };

  const incrementTimeFilter = () => {
    setUserData(prev => {
      const updated = { ...prev, timeSearchCount: prev.timeSearchCount + 1 };
      saveUserData(updated);
      return updated;
    });
  };

  const incrementLocationFilter = () => {
    setUserData(prev => {
      const updated = { ...prev, locationSearchCount: prev.locationSearchCount + 1 };
      saveUserData(updated);
      return updated;
    });
  };

  const updateTotalPhotos = (count: number) => {
    setUserData(prev => {
      const updated = { ...prev, totalPhotos: count };
      saveUserData(updated);
      return updated;
    });
  };

  return (
    <UserDataContext.Provider
      value={{
        userData,
        updateUserData,
        incrementDateFilter,
        incrementTimeFilter,
        incrementLocationFilter,
        updateTotalPhotos,
      }}
    >
      {children}
    </UserDataContext.Provider>
  );
};

export const useUserData = (): UserDataContextType => {
  const context = useContext(UserDataContext);
  if (!context) {
    throw new Error('useUserData must be used within UserDataProvider');
  }
  return context;
};
