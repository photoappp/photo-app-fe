// components/context/SlideshowTimeContext.tsx
import { createContext, useContext, useState } from 'react';

const SlideshowTimeContext = createContext({
	slideshowTime: 3000,
	setSlideshowTime: (time: number) => {}
});

export const SlideshowTimeProvider = ({ children }) => {
	const [slideshowTime, setSlideshowTime] = useState(3000); // default 3 sec
	return (
		<SlideshowTimeContext.Provider value={{ slideshowTime, setSlideshowTime }}>
			{children}
		</SlideshowTimeContext.Provider>
	);
};

export const useSlideshowTime = () => useContext(SlideshowTimeContext);
