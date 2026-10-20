// 2026-03-04 change to close icon by yen
import ICON_CLOSE from "@/assets/icons/ic_close.svg";
import { Colors } from "@/constants/Colors";
import { Photo } from "@/types/Photo";
import { LinearGradient } from "expo-linear-gradient";
// 2026-03-04 added forwardRef, useImperativeHandle, useState for reset by yen
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { useI18n } from "@/components/context/useI18n";
/* 2026.06.23 [포인트3] 메뉴 내부 버튼 게이트 팝업을 이 Modal 안에서 직접 렌더하기 위해 추가 by yen */
import { useRewardGate } from "@/components/context/RewardGateContext";
import RewardPopup from "@/components/RewardPopup";
import { SUPPORTED_LANGUAGES, SupportedLanguage } from "@/constants/Translations";
/* 2026.04.22 위치 선택 번역 재구현을 위해 지원 언어 기반 로컬라이즈 라벨 타입을 명시적으로 정의 by June */
type LocalizedLabel = {
  en: string;
} & Partial<Record<SupportedLanguage, string>>;
type CountryBlock = {
  country: LocalizedLabel;
  cities: LocalizedLabel[];
};
type LocationMap = {
  [country: string]: CountryBlock;
};
// 2026-03-04 to reset location selection by yen
export interface LocationSelectorHandle {
  handleReset: () => void;
}

type Props = {
  visible: boolean;
  onClose: () => void;
  photos: Photo[];
  /* 2026.05.28 위치 후보 목록이 아직 준비 중이면 선택 UI 위에 안내 오버레이를 띄워 중복 입력을 막기 위해 추가 by June */
  isPreparing?: boolean;
  preparingMessage?: string;
  /* 2026.10.11 백그라운드 도시 해소 잔여 수 — >0이면 목록이 아직 자라는 중임을 비차단으로 안내 by Claude */
  pendingCityCount?: number;
  /* 2026.10.19 DB 전체(DISTINCT)에서 만든 장소 목록 — 로드된 사진에만 의존하지 않도록 by Claude */
  availablePlaces?: { country: string; city: string | null }[];
  /* 2026.10.19 검색 진행 중이면 Search 버튼을 비활성화하고 'Searching…'으로 표시 by Claude */
  searching?: boolean;
  onSelectionChange?: (selected: {
    countries: string[];
    cities: string[];
    locationLabel: string;
  }) => void;
  /* 2026.06.23 [포인트3] 메뉴 안의 버튼을 누를 때 공용 리워드 게이트를 먼저 통과시키기 위한 콜백 by yen
     - true(또는 미지정) 면 동작 수행, false 면 동작 취소 */
  onGate?: () => Promise<boolean>;
};
// 2026-03-04 to to push reset function to parent with forwardRef by yen
const LocationSelector = forwardRef<LocationSelectorHandle, Props>(
  (
    {
      photos,
      visible,
      onClose,
      isPreparing = false,
      preparingMessage,
      pendingCityCount,
      availablePlaces,
      searching = false,
      onSelectionChange,
      onGate,
    },
    ref,
  ) => {
    // const [visible, setVisible] = useState(false);
    const [allCountries, setAllCountries] = useState<string[]>([]);
    const [allCities, setAllCities] = useState<string[]>([]);
    const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
    const [selectedCities, setSelectedCities] = useState<string[]>([]);
    const [locationMap, setLocationMap] = useState<LocationMap>({});

    const [tempCountries, setTempCountries] = useState<string[]>([]);
    const [tempCities, setTempCities] = useState<string[]>([]);
    const hasCommittedSelectionRef = useRef(false);
    /* 2026.04.22 TRANSLATIONS 직접 접근을 제거하고 공용 i18n 훅을 사용해 번역 처리 방식을 통일하기 위해 변경 by June */
    const { language, t } = useI18n();
    /* 2026.10.19 국가/도시 목록이 길어지면 시트 높이를 넘겨 하단 버튼(All Locations·Search)이
       화면 밖으로 밀려 보이지 않았다. 목록 높이에 상한을 두어 목록만 스크롤되게 하고
       버튼은 항상 보이도록 한다 by Claude */
    const { height: windowHeight } = useWindowDimensions();
    const placeListMaxHeight = Math.max(160, Math.round(windowHeight * 0.3));
    /* 2026.06.23 [포인트3] 게이트 팝업 상태/콜백 — placeSearch일 때만 이 Modal 안에서 오버레이로 렌더 by yen */
    const {
      popupVisible: gatePopupVisible,
      activeFeature: gateActiveFeature,
      adLoading: gateAdLoading,
      watchAd: gateWatchAd,
      closePopup: gateClosePopup,
    } = useRewardGate();
    const shouldShowPreparingOverlay = isPreparing;
    const areListsEqual = useCallback((left: string[], right: string[]) => {
      if (left.length !== right.length) return false;
      return left.every((item, index) => item === right[index]);
    }, []);

    useEffect(() => {
      // Fetch Translations from Google Sheets
      fetch(
        `https://docs.google.com/spreadsheets/d/e/2PACX-1vRUqmYxjUnGRx-JgOO8CP_gxaa2LNeX1c1grP2z3iVJExf3di7Rj1oWEIe5kTAsEaO2-B0dQM0KIefX/pub?gid=905203283&single=true&output=csv`,
      )
        .then((res) => res.text())
        .then((csvText) => {
          const rows = csvText.split("\n").map((row) => row.split(","));
          const countryTranslationMap: Record<string, LocalizedLabel> = {};
          const langCodes = rows[0];
          const allCountriesSet = new Set<string>();
          const allCitiesSet = new Set<string>();
          const nextLocationMap: LocationMap = {};

          rows.slice(1).forEach((row) => {
            const enName = row[0];
            countryTranslationMap[enName] = { en: enName };

            row.forEach((val, i) => {
              const code = langCodes[i] as string;
              if (val && SUPPORTED_LANGUAGES.includes(code as SupportedLanguage)) {
                const normalizedCode = code as SupportedLanguage;
                countryTranslationMap[enName][normalizedCode] = val;
              }
            });
          });

          /* 2026.10.19 목록 구성 소스: DB 전체 장소 목록(availablePlaces)이 있으면 그것을 쓰고,
             없으면(인덱스/보강 전) 기존처럼 로드된 사진에서 구성 by Claude */
          const placeEntries: { country: string; city: string | null }[] =
            availablePlaces && availablePlaces.length > 0
              ? availablePlaces
              : photos.map(({ country, city, cityApprox }) => ({
                  country: country ?? "",
                  city: city ?? cityApprox ?? null,
                }));

          placeEntries.forEach(({ country, city: cityLabel }) => {
            if (!country) return;

            if (!nextLocationMap[country]) {
              nextLocationMap[country] = {
                country: countryTranslationMap[country] ?? { en: country },
                cities: [],
              };
            }

            allCountriesSet.add(country);
            if (cityLabel) {
              const exists = nextLocationMap[country].cities.some(
                (c) => c.en === cityLabel,
              );
              allCitiesSet.add(cityLabel);
              if (!exists) {
                nextLocationMap[country].cities.push({ en: cityLabel });
              }
            }
          });

          const nextCountries = Array.from(allCountriesSet).sort();
          const nextCities = Array.from(allCitiesSet).sort();

          setLocationMap(nextLocationMap);
          setAllCountries(nextCountries);
          setAllCities(nextCities);
          setSelectedCountries((prev) => prev.filter((item) => allCountriesSet.has(item)));
          setSelectedCities((prev) => {
            const filtered = prev.filter((item) => allCitiesSet.has(item));
            return filtered.length > 0 ? filtered : [];
          });
        })
        .catch(console.error);
    }, [photos, availablePlaces]);

    const getCitiesForCountry = useCallback(
      (country: string) =>
        (locationMap[country]?.cities ?? [])
          .map((city) => city.en)
          .filter(Boolean),
      [locationMap],
    );

    useEffect(() => {
      if (!visible) return;
      const hasActiveLocationFilter =
        selectedCountries.length > 0 || selectedCities.length > 0;
      const nextCities = hasActiveLocationFilter ? selectedCities : allCities;
      const nextCountries = hasActiveLocationFilter ? selectedCountries : allCountries;
      setTempCities((prev) =>
        areListsEqual(prev, nextCities) ? prev : nextCities,
      );
      setTempCountries((prev) =>
        areListsEqual(prev, nextCountries) ? prev : nextCountries,
      );
    }, [
      allCities,
      allCountries,
      areListsEqual,
      selectedCities,
      selectedCountries,
      visible,
    ]);

    const visibleCities = useMemo(() => {
      if (tempCountries.length === 0) {
        return allCities;
      }

      const citySet = new Set<string>();
      tempCountries.forEach((country) => {
        getCitiesForCountry(country).forEach((city) => citySet.add(city));
      });
      return Array.from(citySet).sort();
    }, [allCities, tempCountries, locationMap]);

    const areAllCountriesSelected =
      allCountries.length > 0 && tempCountries.length === allCountries.length;
    const areAllVisibleCitiesSelected =
      visibleCities.length > 0 &&
      visibleCities.every((city) => tempCities.includes(city));

    const toggleCountry = (item: string) => {
      if (item === "All") {
        if (areAllCountriesSelected) {
          setTempCountries([]);
          setTempCities([]);
          return;
        }

        setTempCountries(allCountries);
        setTempCities(allCities);
        return;
      }

      const isSelected = tempCountries.includes(item);
      const countryCities = getCitiesForCountry(item);

      /* 2026.10.19 'All'이 켜진 상태(= 전부 선택)에서 개별 국가를 누르면 그 국가 하나만 남긴다.
         전체에서 하나를 빼는 동작은 사용자가 기대하는 바가 아니다 — 전체가 켜진 상태의 첫 탭은
         '이것만 보기'로 읽힌다. 도시도 그 국가의 도시 전체로 맞춰 'All' 상태를 유지한다 by Claude */
      if (areAllCountriesSelected) {
        setTempCountries([item]);
        setTempCities([...countryCities].sort());
        return;
      }

      if (isSelected) {
        const nextCountries = tempCountries.filter((country) => country !== item);
        const nextCities = tempCities.filter((city) => !countryCities.includes(city));
        setTempCountries(nextCountries);
        setTempCities(nextCities);
        return;
      }

      const nextCities = Array.from(new Set([...tempCities, ...countryCities])).sort();
      setTempCities(nextCities);
      setTempCountries(Array.from(new Set([...tempCountries, item])).sort());
    };

    const toggleCity = (item: string) => {
      if (item === "All") {
        if (areAllVisibleCitiesSelected) {
          const nextCities = tempCities.filter((city) => !visibleCities.includes(city));
          setTempCities(nextCities);
          return;
        }

        const nextCities = Array.from(new Set([...tempCities, ...visibleCities])).sort();
        setTempCities(nextCities);
        return;
      }

      /* 2026.10.19 도시도 같은 규칙 — 'All'이 켜진 상태에서 개별 도시를 누르면 그 도시만 남긴다 by Claude */
      if (areAllVisibleCitiesSelected) {
        setTempCities([item]);
        return;
      }

      const isSelected = tempCities.includes(item);
      const nextCities = isSelected
        ? tempCities.filter((city) => city !== item)
        : [...tempCities, item];
      const normalized = Array.from(new Set(nextCities)).sort();
      setTempCities(normalized);
    };

    /*const getButtonTitle = () => {
      // 2026-05-12: 위치 라벨을 'All Locations' 하나로 통일하고 한쪽만 전체인 경우 'All Countries'/'All Cities'로 표기하도록 변경 by yen
      const countryIsAll =
        tempCountries.length === 0 || tempCountries.includes("All");
      const cityIsAll = tempCities.length === 0 || tempCities.includes("All");

      if (countryIsAll && cityIsAll) {
        return t("allLocations");
      }

      const getTranslatedCountry = (item: string) =>
        locationMap[item]?.country[language] ??
        locationMap[item]?.country.en ??
        item;

      const formatLabel = (items: string[], allLabel: string) => {
        if (items.length === 0 || items.includes("All")) return allLabel;
        return items.length === 1
          ? getTranslatedCountry(items[0])
          : `${getTranslatedCountry(items[1])}+${items.length - 1}`;
      };

      const countryLabel = formatLabel(
        [...tempCountries].sort(),
        t("allCountries")
      );
      const cityLabel = formatLabel([...tempCities].sort(), t("allCities"));

      return [countryLabel, cityLabel].filter(Boolean).join(", ");
    };*/

    // 2026.05.13 설정에서 언어 변경 이후 위치필터에 문자열 반영 안되는 현상 수정 June START
    const getLabelForSelection = useCallback(
      (countriesInput: string[], citiesInput: string[]) => {
        const countryIsAll = countriesInput.length === 0;
        const cityIsAll = citiesInput.length === 0;

        if (countryIsAll && cityIsAll) {
          return t("allLocations");
        }

        const getTranslatedCountry = (item: string) =>
          locationMap[item]?.country[language] ??
          locationMap[item]?.country.en ??
          item;

        const formatLabel = (items: string[], allLabel: string) => {
          if (items.length === 0) return allLabel;
          return items.length === 1
            ? getTranslatedCountry(items[0])
            : `${getTranslatedCountry(items[0])}+${items.length - 1}`;
        };

        const countryLabel = formatLabel(
          [...countriesInput].sort(),
          t("allCountries"),
        );
        const cityLabel = formatLabel([...citiesInput].sort(), t("allCities"));

        return [countryLabel, cityLabel].filter(Boolean).join(", ");
      },
      [language, locationMap, t],
    );

    useEffect(() => {
      if (!hasCommittedSelectionRef.current) return;

      const appliedCountries = [...selectedCountries].sort();
      const appliedCities = [...selectedCities].sort();
      const isAllSelected =
        allCountries.length > 0 &&
        allCities.length > 0 &&
        areListsEqual(appliedCountries, allCountries) &&
        areListsEqual(appliedCities, allCities);
      const nextLocationLabel = isAllSelected
        ? t("allLocations")
        : getLabelForSelection(appliedCountries, appliedCities);

      onSelectionChange?.({
        countries: appliedCountries,
        cities: appliedCities,
        locationLabel: nextLocationLabel,
      });
    }, [
      allCities,
      allCountries,
      areListsEqual,
      getLabelForSelection,
      onSelectionChange,
      selectedCities,
      selectedCountries,
      t,
    ]);

    const handleReset = () => {
      hasCommittedSelectionRef.current = true;
      setSelectedCountries([]);
      setSelectedCities([]);
      setTempCities([]);
      setTempCountries([]);

      onSelectionChange?.({
        countries: [],
        cities: [],
        // 2026-05-12: 리셋 시 라벨도 통일된 'All Locations'로 표시되도록 변경 by yen
        locationLabel: t("allLocations"),
      });
    };
    // 2026-03-04 to reset location selection by yen
    useImperativeHandle(ref, () => ({
      handleReset,
    }));

    /* 2026.10.19 'All Locations' 버튼용 — 초안(temp)만 전체 선택으로 바꾼다.
       applyCurrentSelection이 '전체 선택'을 필터 해제(빈 배열)로 환산하므로,
       이 상태에서 Search를 누르면 기존 리셋과 같은 결과가 된다 by Claude */
    const selectAllPlacesDraft = () => {
      setTempCountries(allCountries);
      setTempCities(allCities);
    };

    const applyCurrentSelection = () => {
      hasCommittedSelectionRef.current = true;
      const appliedCountries = [...tempCountries].sort();

      /* 2026.10.19 도시 칼럼이 'All' 상태면 도시 조건 자체를 걸지 않는다.
         도시 목록을 그대로 넘기면 SQL이 'AND (city IN (...) OR city_approx IN (...))'를 붙이는데,
         오프라인 도시 테이블(50km 반경)에서 도시가 잡히지 않은 사진은 city/city_approx가 모두
         NULL이라 국가만 고른 경우에도 전부 빠져버린다.
         PicQly-T의 cities: { all: true }(= 조건 없음)와 같은 의미 by Claude */
      const cityIsAll =
        visibleCities.length === 0 || areAllVisibleCitiesSelected;
      const appliedCities = cityIsAll ? [] : [...tempCities].sort();
      const countryIsAll =
        allCountries.length > 0 &&
        areListsEqual(appliedCountries, allCountries);
      const isAllSelected = countryIsAll && cityIsAll;
      const nextCountries = isAllSelected ? [] : appliedCountries;
      const nextCities = isAllSelected ? [] : appliedCities;
      const locationLabel = isAllSelected
        ? t("allLocations")
        : getLabelForSelection(nextCountries, nextCities);

      setSelectedCountries(nextCountries);
      setSelectedCities(nextCities);
      onSelectionChange?.({
        countries: nextCountries,
        cities: nextCities,
        locationLabel,
      });
      onClose();
    };

    /* 2026.06.23 [포인트3] 메뉴 내부 버튼은 리워드 게이트를 먼저 통과한 뒤 동작 수행 by yen
       - 해금 중이면 즉시 통과, 아니면 팝업을 띄우고 광고 시청 시에만 동작 수행 */
    const runGated = (action: () => void) => {
      if (!onGate) {
        action();
        return;
      }
      void (async () => {
        const granted = await onGate();
        if (granted !== false) {
          action();
        } else {
          /* 2026.06.23 광고를 보지 않고 팝업을 닫으면 위치 메뉴도 함께 닫음 by yen */
          onClose();
        }
      })();
    };

    return (
      <Modal
        transparent
        visible={visible}
        animationType="slide"
        onRequestClose={onClose}
      >
        <Pressable style={styles.overlay} onPress={onClose}>
          <Pressable
            style={styles.modalContainer}
            onPress={(event) => event.stopPropagation()}
          >
            {shouldShowPreparingOverlay ? (
              <View style={styles.preparingOverlay} pointerEvents="auto">
                <View style={styles.preparingBox}>
                  <ActivityIndicator size="large" color="#6366F1" />
                  <Text style={styles.preparingText}>
                    {preparingMessage ??
                      "Preparing location list. Please wait..."}
                  </Text>
                </View>
              </View>
            ) : null}
            <View style={styles.selectionContainer}>
              {typeof pendingCityCount === "number" && pendingCityCount > 0 ? (
                <Text
                  style={{
                    textAlign: "center",
                    color: "#6366F1",
                    fontSize: 12,
                    paddingVertical: 4,
                  }}
                >
                  {t("locationListFilling", "Organizing location info…")} (
                  {pendingCityCount})
                </Text>
              ) : null}
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  paddingLeft: "3%",
                  paddingRight: "3%",
                  paddingBottom: "3%",
                  paddingTop: "1%",
                }}
              >
								
							<Text>{t("selectLocation")}</Text>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "flex-end",
                    gap: 10,
                  }}
                >
                  {/* 2026.10.19 닫기는 아무것도 적용하지 않는다 — 이전에는 이 X가 선택을 확정하고
                      검색까지 시작했다. 적용은 하단 Search 버튼에서만 (PicQly-T와 동일) by Claude */}
                  <TouchableOpacity onPress={onClose}>
                    {/* 2026-03-04 change to close icon by yen */}
                    <ICON_CLOSE width={20} height={20} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
            <View
              style={{
                flexDirection: "row",
                /* 2026.10.19 시트 높이를 넘길 때 이 영역이 줄어들어야 하단 버튼이 살아남는다 by Claude */
                flexShrink: 1,
                minHeight: 0,
              }}
            >
              <View
                style={{
                  borderRightWidth: 1.18,
                  borderColor: "#DBEAFE",
                  flex: 1,
                  minHeight: 0,
                }}
              >
                <Text style={styles.tableTitle}>
                  {t("country")}
                </Text>
                <FlatList
                  data={["All", ...allCountries]}
                  renderItem={({ item }) => {
                    const isSelected =
                      item === "All"
                        ? areAllCountriesSelected
                        : tempCountries.includes(item);

                    return (
                      <Pressable
                        key={item}
                        onPress={() => runGated(() => toggleCountry(item))}
                        style={({ pressed }) => [
                          {
                            backgroundColor: pressed
                              ? "#EFF6FF"
                              : isSelected
                                ? "#EFF6FF"
                                : Colors.light.background,
                            borderBottomWidth: item === "All" ? 1 : 0,
                            borderBottomColor:
                              item === "All" ? "#DBEAFE" : "transparent",
                          },
                        ]}
                      >
                        <Text style={styles.listItem}>
                          
													{item === "All"
														? t("all")
														: locationMap[item]?.country[language] ??
															locationMap[item]?.country.en ??
															item}
                        </Text>
                      </Pressable>
                    );
                  }}
                  keyExtractor={(item) => item}
                  style={{ maxHeight: placeListMaxHeight }}
                />
              </View>
              <View
                style={{
                  flex: 1,
                  minHeight: 0,
                }}
              >
                <Text style={styles.tableTitle}>
                  {t("city")}
                </Text>
                {tempCountries && (
                  <FlatList
                    data={["All", ...visibleCities]}
                    renderItem={({ item }) => {
                      const isSelected =
                        item === "All"
                          ? areAllVisibleCitiesSelected
                          : tempCities.includes(item);

                      return (
                        <Pressable
                          key={item}
                          onPress={() => runGated(() => toggleCity(item))}
                          style={({ pressed }) => [
                            {
                              backgroundColor: pressed
                                ? "#EFF6FF"
                                : isSelected
                                  ? "#EFF6FF"
                                  : Colors.light.background,
                              borderBottomWidth: item === "All" ? 1 : 0,
                              borderBottomColor:
                                item === "All" ? "#DBEAFE" : "transparent",
                            },
                          ]}
                        >
													
													<Text style={styles.listItem}>{item === "All" ? t("all") : item}</Text>
                        </Pressable>
                      );
                    }}
                    keyExtractor={(item) => item}
                    style={{ maxHeight: placeListMaxHeight }}
                  />
                )}
              </View>
            </View>
            <View style={styles.buttonContainer}>
              {/* 2026.10.19 'All Locations'는 선택만 전체로 바꾼다 — 적용/검색/닫기를 하지 않는다.
                  날짜·시간 시트의 'All Dates'/'All Times' 프리셋과 같은 성격 by Claude */}
              <TouchableOpacity onPress={selectAllPlacesDraft}>
                <LinearGradient
                  colors={["#2B7FFF", "#AD46FF"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.primaryButton}
                >
									
									<Text style={styles.primaryButtonText}>{t("allLocations")}</Text>
                </LinearGradient>
              </TouchableOpacity>
              {/* 2026.10.19 Search — 이 버튼만이 선택을 확정하고 검색을 시작한다.
                  리워드 게이트도 여기로 옮겼다(이전에는 X/전체선택 버튼에 걸려 있었다) by Claude */}
              <TouchableOpacity
                activeOpacity={0.8}
                disabled={searching}
                onPress={() => runGated(applyCurrentSelection)}
                style={styles.searchButtonWrap}
              >
                <LinearGradient
                  colors={
                    searching
                      ? ["#A9C4EC", "#CBB6E8"]
                      : ["#2B7FFF", "#AD46FF"]
                  }
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.primaryButton}
                >
                  <Text style={styles.primaryButtonText}>
                    {searching
                      ? t("searching", "Searching…")
                      : t("search", "Search")}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </Pressable>
          {/* 2026.06.23 [포인트3] 장소 메뉴 버튼 게이트 팝업 — 이 Modal 위에 오버레이로 표시 by yen */}
          <RewardPopup
            asOverlay
            visible={gatePopupVisible && gateActiveFeature === "placeSearch"}
            loading={gateAdLoading}
            onWatchAd={gateWatchAd}
            onClose={gateClosePopup}
          />
        </Pressable>
      </Modal>
    );
  },
);
const styles = StyleSheet.create({
  modalContainer: {
    backgroundColor: "white",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    position: "relative",
    paddingTop: 20,
    paddingBottom: 40, // 아이폰 홈 바 영역 고려
    /* 2026.10.19 40%로는 목록 + 하단 버튼 2개가 들어가지 않아 Search가 화면 밖으로 밀렸다.
       maxHeight는 상한일 뿐이라 목록이 짧으면 시트도 그만큼 낮게 유지된다 by Claude */
    maxHeight: "80%",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: -2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5, // 안드로이드 그림자
  },
  preparingOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
    elevation: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.82)",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  preparingBox: {
    minWidth: 220,
    marginHorizontal: 20,
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  preparingText: {
    marginTop: 10,
    color: "#374151",
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
  },
  selectionContainer: {
    borderRadius: 3,
    marginBottom: 15,
  },
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0, 0, 0, 0.4)", // 반투명 검은 배경
  },
  listItem: {
    fontSize: 14,
    paddingTop: 8,
    paddingLeft: 8,
    paddingBottom: 8,
  },
  button: {
    fontWeight: "500",
    fontSize: 16,
    color: "#2B7FFF",
  },
  buttonContainer: {
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderColor: "#ccc",
    backgroundColor: Colors.light.background,
  },
  /* 2026.10.19 하단 Search 버튼 — 'All Locations'와 동일한 그라데이션 디자인 by Claude */
  searchButtonWrap: {
    marginTop: 8,
  },
  tableTitle: {
    paddingTop: 8,
    paddingLeft: 8,
    paddingBottom: 8,
    backgroundColor: "#F9FAFB",
    borderColor: "#DBEAFE",
    borderBottomWidth: 1.18,
    borderTopWidth: 1.18,
  },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    height: 40,
    borderRadius: 14,
    shadowColor: "#2563EB",
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
});
// 2026-03-04 to add forwardRef for reset location selection by yen
LocationSelector.displayName = "LocationSelector";

export default LocationSelector;
