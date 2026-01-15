//  components/context/UserDataContext.tsx
import React, { createContext, useContext, useState, ReactNode, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface UserData {
	startDate: string;
	dateSearchCount: number;
	timeSearchCount: number;
	locationSearchCount: number;
	totalPhotos: number;
}

interface UserDataContextType {
	userData: UserData;
	updateUserData: (partial: Partial<UserData>) => void;
	incrementDateFilter: () => void;
	incrementTimeFilter: () => void;
	incrementLocationFilter: () => void;
	updateTotalPhotos: () => void;
}

const defaultUserData: UserData = {
	startDate: '-',
	dateSearchCount: 0,
	timeSearchCount: 0,
	locationSearchCount: 0,
	totalPhotos: 0,
};

const UserDataContext = createContext<UserDataContextType | undefined>(undefined);

const STORAGE_KEY = 'userData';

export const UserDataProvider = ({ children }: { children: ReactNode }) => {
	const [userData, setUserData] = useState<UserData>(defaultUserData);
	const [loaded, setLoaded] = useState(false);

	// 앱 최초 실행일 저장
	useEffect(() => {
			(async () => {
				const stored = await AsyncStorage.getItem(STORAGE_KEY);
				if (stored) {
					setUserData(JSON.parse(stored));
				} else {
					const today = new Date().toISOString().split('T')[0];
					const init = { ...defaultUserData, startDate: today };
					setUserData(init);
					await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(init));
				}
				setLoaded(true);
			})();
		}, []);

	// userData 변경 시 자동 저장
	useEffect(() => {
		if (!loaded) return;
		AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(userData));
	}, [userData, loaded]);

	const updateUserData = (partial: Partial<UserData>) => {
		setUserData(prev => ({ ...prev, ...partial }));
	};

	const incrementDateFilter = () => {
		setUserData(prev => ({ ...prev, dateSearchCount: prev.dateSearchCount + 1 }));
	};
	
	const incrementTimeFilter = () => {
		setUserData(prev => ({ ...prev, timeSearchCount: prev.timeSearchCount + 1 }));
	};

	const incrementLocationFilter = () => {
		setUserData(prev => ({ ...prev, locationSearchCount: prev.locationSearchCount + 1 }));
	};
	
	const updateTotalPhotos = (count: number) => {
		setUserData(prev => ({ ...prev, totalPhotos: count }));
	};

	return (
		<UserDataContext.Provider
			value={{ userData, updateUserData, incrementDateFilter, incrementTimeFilter, incrementLocationFilter, updateTotalPhotos }}
		>
			{children}
		</UserDataContext.Provider>
	);
};

export const useUserData = () => {
	const context = useContext(UserDataContext);
	if (!context) throw new Error('useUserData must be used within UserDataProvider');
	return context;
};
