// 2026-03-04 change to close icon by yen
import ICON_CLOSE from "@/assets/icons/ic_close.svg";
import { Colors } from "@/constants/Colors";
import { Photo } from "@/types/Photo";
import { LinearGradient } from "expo-linear-gradient";
// 2026-03-04 added forwardRef, useImperativeHandle, useState for reset by yen
import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
// 2026-02-10 언어 설정 추가 by Minji
import { useLanguage } from "@/components/context/LanguageContext";
import { TRANSLATIONS } from "@/constants/Translations";
type Translations = {
  en: string;
  ko?: string;
  ja?: string;
  "zh-Hans"?: string;
  "zh-Hant"?: string;
};
type CountryBlock = {
  country: Translations;
  cities: Translations[];
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
  onSelectionChange?: (selected: {
    countries: string[];
    cities: string[];
//    locationLabel: string; //2026-03-27 언어 변경 시 필터 라벨 자동 변경 by Minji
  }) => void;
};
// 2026-03-04 to to push reset function to parent with forwardRef by yen
const LocationSelector = forwardRef<LocationSelectorHandle, Props>(
  ({ photos, visible, onClose, onSelectionChange }, ref) => {
    // const [visible, setVisible] = useState(false);
    const [allCountries, setAllCountries] = useState<string[]>([]);
    const [allCities, setAllCities] = useState<string[]>([]);
    const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
    const [selectedCities, setSelectedCities] = useState<string[]>([]);
    const [translations, setTranslations] = useState<string[][]>([]);
    const [locationMap, setLocationMap] = useState<LocationMap>({});
		// 2026-03-27 Default All 값 다국어 설정 추가 by Minji
		const ALL_KEY = "__ALL__";
    const [tempCountries, setTempCountries] = useState<string[]>([ALL_KEY]);
    const [tempCities, setTempCities] = useState<string[]>([ALL_KEY]);
    const { language, setLanguage } = useLanguage(); // 2026-02-10 언어 설정 추가 by Minji
		const [buttonTitle, setButtonTitle] = useState("");

    useEffect(() => {
      // Fetch Translations from Google Sheets
      fetch(
        `https://docs.google.com/spreadsheets/d/e/2PACX-1vRUqmYxjUnGRx-JgOO8CP_gxaa2LNeX1c1grP2z3iVJExf3di7Rj1oWEIe5kTAsEaO2-B0dQM0KIefX/pub?gid=905203283&single=true&output=csv`,
      )
        .then((res) => res.text())
        .then((csvText) => {
          const rows = csvText.split("\n").map((row) => row.split(","));
          setTranslations(rows);
          const countryTranslationMap: Record<string, Translations> = {};
          const langCodes = rows[0];
          const allCountriesSet = new Set<string>();
          const allCitiesSet = new Set<string>();
					// 2026-03-18 선택 국가 언어설정에 따라 보이게 by Minji
					// 2026-03-27 언어 설정 값 고려하여 trim 추가 by Minji
          rows.slice(1).forEach((row) => {
            const enName = row[0].trim();
            countryTranslationMap[enName] = { en: enName };

            row.forEach((val, i) => {
              const code = langCodes[i].trim() as keyof Translations;
              if (val) {
                countryTranslationMap[enName][code] = val.trim();
              }
            });
          });

          photos.forEach(({ country, city }) => {
            if (!country) return;

            // Initialize country block if missing
            locationMap[country] = {
              country: countryTranslationMap[country] ?? { en: country },
              cities: [],
            };
            allCountriesSet.add(country);
            // Add city if present and not duplicated
            if (city) {
              const exists = locationMap[country].cities.some(
                (c) => c.en === city,
              );
              allCitiesSet.add(city);
              if (!exists) {
                locationMap[country].cities.push({ en: city });
              }
            }
          });
          setLocationMap(locationMap);
          if (allCountriesSet.size > 0) {
						// 2026-03-27 Default 다국어 설정 추가 by Minji
						const countryList = Array.from(allCountriesSet);
						const cityList = Array.from(allCitiesSet);

						// All 키워드와 실제 리스트를 합쳐서 전체 목록 생성
						setAllCountries([ALL_KEY, ...countryList]);
						setAllCities([ALL_KEY, ...cityList]);

						// 초기 선택 상태를 [ALL_KEY, 국가1, 국가2...] 전체로 설정
						setTempCountries([ALL_KEY, ...countryList]);
						setTempCities([ALL_KEY, ...cityList]);
          }
        })
        .catch(console.error);
    }, [photos]);

    // Get temporary selection array based on type
    const getTempSelection = (type: "country" | "city") => {
      if (type === "country") return tempCountries;
      if (type === "city") return tempCities;
      return [];
    };

    const setTempSelection = (type: "country" | "city", items: string[]) => {
      if (type === "country") setTempCountries(items);
      else setTempCities(items);
    };

		
		//2026-03-27 필터나 언어가 바뀔 때마다 버튼 라벨 업데이트 by Minji
		useEffect(() => {
				setButtonTitle(getButtonTitle(tempCountries, tempCities));
		}, [tempCountries, tempCities, language, locationMap]);
		
		//2026-03-27 언어 설정이 바뀔 때만 부모의 라벨을 강제로 업데이트 by Minji
		useEffect(() => {
			if (Object.keys(locationMap).length === 0) return;
			console.log("Language or Data changed! Updating label for:", language, selectedCountries);
			console.log("Current Selected:", selectedCountries);
			
			// 2026-03-27 언어 변경 시에도 필터링 데이터 형식을 유지하기 위한 로직
			const getActualCities = () => {
				if (selectedCities.includes(ALL_KEY)) {
					const allSelectedCities: string[] = [];
					selectedCountries.forEach((country) => {
						const cities = locationMap[country]?.cities ?? [];
						cities.forEach((c) => { if (c.en) allSelectedCities.push(c.en); });
					});
					return allSelectedCities;
				}
				return selectedCities;
			};

			const actualCities = getActualCities();
			const updatedLabel = getButtonTitle(selectedCountries, selectedCities);
			onSelectionChange?.({
				countries: selectedCountries,
				cities: actualCities, // 부모가 이해할 수 있는 실제 도시 리스트 전달
				locationLabel: updatedLabel,
			});
			console.log("Current Selected:", actualCities, updatedLabel);
		}, [language,locationMap]); // 오직 language가 바뀔 때만 실행
		
    const toggleItem = (type: "country" | "city", item: string) => {
      const current = getTempSelection(type);
      const allItems = getCurrentItems(type);

      if (item === ALL_KEY) {
        if (!current.includes(ALL_KEY)) {
          setTempSelection(type, allItems);
        } else {
          setTempSelection(type, []);
        }
        return;
      }
			// 2026-03-27 ALL_KEY 기준으로 변경 by Minji
			const updated = current.includes(item)
					? current.filter(i => i !== item && i !== ALL_KEY)
					: [...current.filter(i => i !== ALL_KEY), item];
//      let updated: string[];
//      // 2026-03-04 change toggle logic to handle "All" selection by yen
//      if (current.includes(item) && current.includes("All")) {
//        updated = [item];
//      } else if (current.includes(item)) {
//        updated = current.filter((i) => i !== item && i !== "All");
//      } else {
//        updated = [...current, item];
//      }
      setTempSelection(type, updated);
    };

    const getCurrentItems = (type: "country" | "city") => {
			// 2026-03-27 실시간 번역 추가 by Minji
      if (type === "country") {
        return Array.from(new Set([...allCountries]));
      }
      if (type === "city") {
        const allCitiesSet = new Set<string>();

        tempCountries.forEach((country) => {
          const cities = locationMap[country]?.cities ?? [];
          cities.forEach((c) => {
            if (c.en) allCitiesSet.add(c.en);
          });
        });
        if (allCitiesSet.size == 0) return [];
				// 2026-03-27 ALL_KEY 기준으로 변경 by Minji
        return Array.from(new Set([ALL_KEY, ...allCitiesSet]));
      }

      return [];
    };

		//2026-03-27 언어 변경 시 필터 라벨 자동 변경되기 위한 함수로 타입 변경 by Minji
		const getButtonTitle = (countries: string[] = [], cities: string[] = []) => {
			// 2026-03-18 Default All 값 다국어 설정 추가 by Minji
			const isCountriesAll = !countries.length || (countries.length === 1 && countries[0] === ALL_KEY);
			const isCitiesAll = !cities.length || (cities.length === 1 && cities[0] === ALL_KEY);
			if (isCountriesAll && isCitiesAll) {
				return TRANSLATIONS[language].all;
			}
//      if (tempCountries.length == 0 && tempCities.length == 0) return "None";

			// 2026-03-27 Default All 실시간 번역 추가 by Minji
      const formatLabel = (items: string[]) => {
				// items가 비어있거나 "All" 키워드가 포함되어 있으면 All 표시
				if (!items || !items.length || (items.length === 1 && items[0] === ALL_KEY)) {
					return TRANSLATIONS[language].all; // 2026-03-18 Default All 값 다국어 설정 추가 by Minji
				}
				
				const getTranslatedCountry = (item: string) => {
				 if (item === ALL_KEY) return TRANSLATIONS[language].all;

				 return (
					 locationMap[item]?.country[language] ??
					 locationMap[item]?.country.en ??
					 item
				 );
			 };
				
				// 선택된 아이템이 1개일 때
        if (items.length === 1) {
          return getTranslatedCountry(items[0]);
        }
        return `${getTranslatedCountry(items[0])}+${items.length - 1}`;
      };

			// 2026-03-27 필터 라벨 실시간 번역 되도록 temps->countries 수정 by Minji
      const countryLabel = countries.length
        ? formatLabel([...countries].sort())
        : "";

      const cityLabel = cities.length
        ? formatLabel([...cities].sort())
        : "";

			// 2개 이상일 때 (기존 로직의 items[1] 스타일 유지)
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
				/* 2026-03-18 언어 설정 추가 by Minji */
        locationLabel: TRANSLATIONS[language].all,
      });
    };
    // 2026-03-04 to reset location selection by yen
    useImperativeHandle(ref, () => ({
      handleReset,
    }));
    return (
      <Modal
        transparent
        visible={visible}
        animationType="slide"
        onRequestClose={onClose}
      >
        <Pressable style={styles.overlay} onPress={onClose}>
          <View style={styles.modalContainer}>
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
								{/* 2026-03-18 다국어 라벨 출력 추가 by Minji */}
							<Text>{TRANSLATIONS[language].selectLocation}</Text>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "flex-end",
                    gap: 10,
                  }}
                >
                  <TouchableOpacity
                    onPress={() => {
											// 2026-03-27 필터링된 도시 목록 계산 by Minji
											const getFilteredCities = () => {
												if (tempCities.includes(ALL_KEY)) {
													const allSelectedCities: string[] = [];
													tempCountries.forEach((country) => {
														const cities = locationMap[country]?.cities ?? [];
														cities.forEach((c) => {
															if (c.en) allSelectedCities.push(c.en);
														});
													});
													return allSelectedCities;
												}
												return tempCities;
											};

											const filteredCities = getFilteredCities();

											// 2026-03-27 비동기적인 selectedCountries 대신 현재 값인 tempCountries를 사용 by Minji
											const currentLabel = getButtonTitle(tempCountries, tempCities);
												
											console.log("Applying selection:", {
												countries: tempCountries,
												cities: filteredCities,
												locationLabel: currentLabel,
											});
											onSelectionChange?.({
												countries: tempCountries,
												cities: filteredCities,
												locationLabel: currentLabel, //2026-03-27 언어 변경 시 필터 라벨 자동 변경 by Minji
											});
											
                      setSelectedCountries(tempCountries);
                      setSelectedCities(tempCities);

                      onClose();
                    }}
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
                  {TRANSLATIONS[language].country}
                </Text>
                <FlatList
                  data={getCurrentItems("country")}
                  renderItem={({ item }) => {
                    const isSelected =
                      getTempSelection("country").includes(item);

                    return (
                      <Pressable
                        key={item}
                        onPress={() => toggleItem("country", item)}
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
                          {/* 2026-03-18 언어 설정 추가 by Minji */}
													{item === ALL_KEY
														? TRANSLATIONS[language].all
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
                  {TRANSLATIONS[language].city}
                </Text>
                {tempCountries && (
                  <FlatList
                    data={getCurrentItems("city")}
                    renderItem={({ item }) => {
                      const isSelected =
                        getTempSelection("city").includes(item);

                      return (
                        <Pressable
                          key={item}
                          onPress={() => toggleItem("city", item)}
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
													{/* 2026-03-18 언어 설정 추가 by Minji */}
													<Text style={styles.listItem}>
															{item === ALL_KEY
																? TRANSLATIONS[language].all
																: locationMap[item]?.country[language] ?? locationMap[item]?.country.en ?? item}
													</Text>
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
									// 2026-04-05 close button과 동일한 로직 추가 by Minji
									const getFilteredCities = () => {
										if (tempCities.includes(ALL_KEY)) {
											const allSelectedCities: string[] = [];
											tempCountries.forEach((country) => {
												const cities = locationMap[country]?.cities ?? [];
												cities.forEach((c) => {
													if (c.en) allSelectedCities.push(c.en);
												});
											});
											return allSelectedCities;
										}
										return tempCities;
									};
									
									const filteredCities = getFilteredCities();
									
                  setSelectedCountries(tempCountries);
                  setSelectedCities(tempCities);
                  console.log("Applying selection:", {
                    countries: tempCountries,
                    cities: tempCities,
                    locationLabel: getButtonTitle(),
                  });
                  onSelectionChange?.({
                    countries: tempCountries,
                    cities: filteredCities,
                    locationLabel: getButtonTitle(selectedCountries, filteredCities), //2026-03-27 언어 변경 시 필터 라벨 자동 변경 by Minji
                  });

                  onClose();
                }}
              >
                <LinearGradient
                  colors={["#2B7FFF", "#AD46FF"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.primaryButton}
                >
									{/*  2026-03-13 번역 라벨 추가 by Minji */}
									<Text style={styles.primaryButtonText}>{TRANSLATIONS[language].allLocations}</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
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
