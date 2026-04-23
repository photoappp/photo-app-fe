//  components/context/UserDataContext.tsx
import React, { createContext, useContext, useState, ReactNode, useEffect, useCallback, useMemo } from 'react';
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
	updateTotalPhotos: (count: number) => void;
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

	/* 2026.04.15 Context 함수 참조를 고정해 소비 컴포넌트 useEffect 의존성 루프를 방지하기 위해 useCallback 적용 by June */
	const updateUserData = useCallback((partial: Partial<UserData>) => {
		setUserData(prev => ({ ...prev, ...partial }));
	}, []);

	/* 2026.04.15 날짜 필터 카운트 함수의 참조 안정성을 보장해 Maximum update depth 루프를 방지하기 위해 useCallback 적용 by June */
	const incrementDateFilter = useCallback(() => {
		setUserData(prev => ({ ...prev, dateSearchCount: prev.dateSearchCount + 1 }));
	}, []);
		
	/* 2026.04.15 시간 필터 카운트 함수의 참조 안정성을 보장해 불필요한 effect 재실행을 방지하기 위해 useCallback 적용 by June */
	const incrementTimeFilter = useCallback(() => {
		setUserData(prev => ({ ...prev, timeSearchCount: prev.timeSearchCount + 1 }));
	}, []);

	/* 2026.04.15 위치 필터 카운트 함수의 참조 안정성을 보장해 필터 effect 루프를 차단하기 위해 useCallback 적용 by June */
	const incrementLocationFilter = useCallback(() => {
		setUserData(prev => ({ ...prev, locationSearchCount: prev.locationSearchCount + 1 }));
	}, []);
		
	/* 2026.04.15 전체 사진 수 업데이트 함수 참조를 안정화해 context 리렌더 파급을 최소화하기 위해 useCallback 적용 by June */
	const updateTotalPhotos = useCallback((count: number) => {
		setUserData(prev => ({ ...prev, totalPhotos: count }));
	}, []);

	/* 2026.04.15 Provider value 객체를 메모이징해 함수 참조 안정화 효과가 실제 소비 컴포넌트까지 전달되도록 보장하기 위해 추가 by June */
	const contextValue = useMemo(
		() => ({ userData, updateUserData, incrementDateFilter, incrementTimeFilter, incrementLocationFilter, updateTotalPhotos }),
		[userData, updateUserData, incrementDateFilter, incrementTimeFilter, incrementLocationFilter, updateTotalPhotos]
	);

	return (
		<UserDataContext.Provider
			value={contextValue}
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
