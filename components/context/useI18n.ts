import { useCallback, useMemo } from "react";
import { useLanguage } from "@/components/context/LanguageContext";
import {
	normalizeLanguage,
	translateText,
	TranslationKey,
} from "@/constants/Translations";

/* 2026.04.22 번역 처리 재구현 시 반복되는 language 정규화/문구 조회 코드를 공용 훅으로 통합하기 위해 신규 추가 by June */
export const useI18n = () => {
	const { language } = useLanguage();
	/* 2026.04.22 화면마다 언어 정규화 계산이 중복되지 않도록 memoized currentLanguage를 제공하기 위해 추가 by June */
	const currentLanguage = useMemo(
		() => normalizeLanguage(language),
		[language]
	);

	/* 2026.04.22 키 기반 번역 조회를 함수 형태로 제공해 컴포넌트 코드에서 TRANSLATIONS 직접 접근을 제거하기 위해 추가 by June */
	/* 2026.10.19 매 렌더마다 새 함수가 만들어져, t를 의존성에 넣은 useCallback/useEffect가
	   렌더마다 재생성·재실행되며 무한 업데이트가 발생했다. 언어가 바뀔 때만 새로 만든다 by Claude */
	const t = useCallback(
		(key: TranslationKey, fallback?: string) =>
			translateText(currentLanguage, key, fallback),
		[currentLanguage]
	);

	return {
		language: currentLanguage,
		t,
	};
};

