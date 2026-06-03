// 2026-03-04 change to close icon by yen
import ICON_CLOSE from "@/assets/icons/ic_close.svg";
import { Colors } from "@/constants/Colors";
import { Photo } from "@/types/Photo";
import { LinearGradient } from "expo-linear-gradient";
// 2026-03-04 added forwardRef, useImperativeHandle, useState for reset by yen
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useI18n } from "@/components/context/useI18n";
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
  onSelectionChange?: (selected: {
    countries: string[];
    cities: string[];
    locationLabel: string;
  }) => void;
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
      onSelectionChange,
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
    /* 2026.04.22 TRANSLATIONS 직접 접근을 제거하고 공용 i18n 훅을 사용해 번역 처리 방식을 통일하기 위해 변경 by June */
    const { language, t } = useI18n();
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

          photos.forEach(({ country, city }) => {
            if (!country) return;

            if (!nextLocationMap[country]) {
              nextLocationMap[country] = {
                country: countryTranslationMap[country] ?? { en: country },
                cities: [],
              };
            }

            allCountriesSet.add(country);
            if (city) {
              const exists = nextLocationMap[country].cities.some(
                (c) => c.en === city,
              );
              allCitiesSet.add(city);
              if (!exists) {
                nextLocationMap[country].cities.push({ en: city });
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
    }, [photos]);

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
    const getLabelForSelection = (countriesInput: string[], citiesInput: string[]) => {
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
        t("allCountries")
      );
      const cityLabel = formatLabel(
        [...citiesInput].sort(),
        t("allCities")
      );
    
      return [countryLabel, cityLabel].filter(Boolean).join(", ");
    };

    const handleReset = () => {
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

    const applyCurrentSelection = () => {
      const appliedCountries = [...tempCountries].sort();
      const appliedCities = [...tempCities].sort();
      const isAllSelected =
        allCountries.length > 0 &&
        allCities.length > 0 &&
        areListsEqual(appliedCountries, allCountries) &&
        areListsEqual(appliedCities, allCities);
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
                  <TouchableOpacity
                    onPress={applyCurrentSelection}
                  >
                    {/* 2026-03-04 change to close icon by yen */}
                    <ICON_CLOSE width={20} height={20} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
            <View
              style={{
                flexDirection: "row",
              }}
            >
              <View
                style={{
                  borderRightWidth: 1.18,
                  borderColor: "#DBEAFE",
                  flex: 1,
                  justifyContent: "center",
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
                        onPress={() => toggleCountry(item)}
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
                />
              </View>
              <View
                style={{
                  flex: 1,
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
                          onPress={() => toggleCity(item)}
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
                  />
                )}
              </View>
            </View>
            <View style={styles.buttonContainer}>
              <TouchableOpacity
                onPress={() => {
                  handleReset();
                  onClose();
                }}
              >
                <LinearGradient
                  colors={["#2B7FFF", "#AD46FF"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.primaryButton}
                >
									
									<Text style={styles.primaryButtonText}>{t("allLocations")}</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </Pressable>
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
    maxHeight: "40%",
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
