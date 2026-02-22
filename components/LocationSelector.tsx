import { Colors } from "@/constants/Colors";
import { Photo } from "@/types/Photo";
import { LinearGradient } from "expo-linear-gradient";
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
    locationLabel: string;
  }) => void;
};

const LocationSelector = forwardRef<LocationSelectorHandle, Props>(
  ({ photos, visible, onClose, onSelectionChange }, ref) => {
    // const [visible, setVisible] = useState(false);
    const [allCountries, setAllCountries] = useState<string[]>([]);
    const [allCities, setAllCities] = useState<string[]>([]);
    const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
    const [selectedCities, setSelectedCities] = useState<string[]>([]);
    const [translations, setTranslations] = useState<string[][]>([]);
    const [locationMap, setLocationMap] = useState<LocationMap>({});
    const [tempCountries, setTempCountries] = useState<string[]>([]);
    const [tempCities, setTempCities] = useState<string[]>([]);

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
          translations.slice(1).forEach((row) => {
            const enName = row[0];
            countryTranslationMap[enName] = { en: enName };

            row.forEach((val, i) => {
              const code = langCodes[i] as keyof Translations;
              if (val) {
                countryTranslationMap[enName][code] = val;
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
            setAllCountries(["All", ...Array.from(allCountriesSet)]);
            setAllCities(["All", ...Array.from(allCitiesSet)]);
            setTempCountries(["All", ...Array.from(allCountriesSet)]);
            setTempCities(["All", ...Array.from(allCitiesSet)]);
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

    const toggleItem = (type: "country" | "city", item: string) => {
      const current = getTempSelection(type);
      const allItems = getCurrentItems(type);

      if (item === "All") {
        if (!current.includes("All")) {
          setTempSelection(type, allItems);
        } else {
          setTempSelection(type, []);
        }
        return;
      }
      let updated: string[];
      if (current.includes(item) && current.includes("All")) {
        updated = [item];
      } else if (current.includes(item)) {
        updated = current.filter((i) => i !== item && i !== "All");
      } else {
        updated = [...current, item];
      }
      setTempSelection(type, updated);
    };

    const getCurrentItems = (type: "country" | "city") => {
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
        return Array.from(new Set(["All", ...allCitiesSet]));
      }

      return [];
    };

    const getButtonTitle = () => {
      if (tempCountries.length == 0 && tempCities.length == 0) return "None";

      const formatLabel = (items: string[]) => {
        if (!items.includes("All")) {
          return items.length === 1
            ? items[0]
            : `${items[1]}+${items.length - 1}`;
        }
        return items[0];
      };

      const countryLabel = tempCountries.length
        ? formatLabel([...tempCountries].sort())
        : "";

      const cityLabel = tempCities.length
        ? formatLabel([...tempCities].sort())
        : "";

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
        locationLabel: "Anywhere",
      });
    };
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
                <Text>Select Location</Text>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "flex-end",
                    gap: 10,
                  }}
                >
                  <TouchableOpacity onPress={handleReset}>
                    <Text style={styles.button}>Reset</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => {
                      setSelectedCountries(tempCountries);
                      setSelectedCities(tempCities);
                      console.log("Applying selection:", {
                        countries: tempCountries,
                        cities: tempCities,
                        locationLabel: getButtonTitle(),
                      });
                      onSelectionChange?.({
                        countries: tempCountries,
                        cities: tempCities,
                        locationLabel: getButtonTitle(),
                      });

                      onClose();
                    }}
                  >
                    <Text style={styles.button}>Close</Text>
                  </TouchableOpacity>
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
                  <Text style={styles.tableTitle}>Country</Text>
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
                          <Text style={styles.listItem}>{item}</Text>
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
                  <Text style={styles.tableTitle}>City</Text>
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
                            <Text style={styles.listItem}>{item}</Text>
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
                    setTempCities(allCities);
                    setTempCountries(allCountries);
                    setSelectedCountries(allCountries);
                    setSelectedCities(allCities);
                    console.log("Applying selection:", {
                      countries: allCountries,
                      cities: allCities,
                      locationLabel: getButtonTitle(),
                    });
                    onSelectionChange?.({
                      countries: allCountries,
                      cities: allCities,
                      locationLabel: getButtonTitle(),
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
                    <Text style={styles.primaryButtonText}>All Locations</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
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
LocationSelector.displayName = "LocationSelector";

export default LocationSelector;
