//  components/context/UserDataContext.tsx
import React, { createContext, useContext, useState, ReactNode, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface UserData {
	startDate: string;
	timeSearchCount: number;
	locationSearchCount: number;
	totalPhotos: number;
}

interface UserDataContextType {
	userData: UserData;
	updateUserData: (partial: Partial<UserData>) => Promise<void>;
	loadUserData: () => Promise<void>;
}

const defaultUserData: UserData = {
	startDate: '-',
	timeSearchCount: 0,
	locationSearchCount: 0,
	totalPhotos: 0,
};

const UserDataContext = createContext<UserDataContextType | undefined>(undefined);

export const UserDataProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
	const [userData, setUserData] = useState<UserData>(defaultUserData);

	const updateUserData = async (updater: ((prev: UserData) => UserData) | Partial<UserData>) => {
		setUserData((prev) => {
			const updated = typeof updater === 'function' ? updater(prev) : { ...prev, ...updater };
			AsyncStorage.setItem('userData', JSON.stringify(updated));
			return updated;
		});
	};

	const loadUserData = useCallback(async () => {
		try {
			const stored = await AsyncStorage.getItem('userData');
			if (stored) {
				setUserData(JSON.parse(stored));
			}
		} catch (e) {
			console.error('Failed to load userData', e);
		}
	}, []);

	useEffect(() => {
		loadUserData();
	}, []);

	return (
		<UserDataContext.Provider value={{ userData, updateUserData, loadUserData }}>
			{children}
		</UserDataContext.Provider>
	);
};

export const useUserData = () => {
	const context = useContext(UserDataContext);
	if (!context) throw new Error('useUserData must be used within UserDataProvider');
	return context;
};

//// 사용자 데이터 AsyncStorage 저장
//useEffect(() => {
//	async function saveUserData() {
//		// 1) 앱 시작일 가져오기
//		const startDateIso = await AsyncStorage.getItem('appStartDate') ?? new Date().toISOString();
//		const startDate = startDateIso.split('T')[0];
//		await AsyncStorage.setItem('appStartDate', startDate);
//		
//		// 2) 위치 검색 횟수 가져오기
//		const locationSearchCount = parseInt((await AsyncStorage.getItem('locationSearchCount')) || '0', 10);
//
//		// 3) 필터 적용된 시간 검색 횟수 계산 (photosAll 기반)
//		const filteredTimeCount = photosAll.filter(p => {
//			if (!p.takenAt) return false;
//
//			// 날짜 필터 적용
//			if (p.takenAt < dayStartMs(filter.dateStart) || p.takenAt >= dayEndNextMs(filter.dateEnd)) return false;
//
//			// 시간 필터 적용
//			return inTimeWindow(p.takenAt, filter.timeStart, filter.timeEnd);
//		}).length;
//
//		// 4) 전체 사진 개수 (필터링 전)
//		const totalPhotos = photosAll.length;
//
//		// 5) AsyncStorage에 저장
//		const userData = { startDate, timeSearchCount: filteredTimeCount, locationSearchCount, totalPhotos };
//		await AsyncStorage.setItem('userData', JSON.stringify(userData));
//		
//		setUserData(userData);
//	}
//
//	saveUserData();
//}, [photosAll, filter]);
