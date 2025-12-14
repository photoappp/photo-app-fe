import { Colors } from "@/constants/Colors";
import { Photo } from "@/types/Photo";
import { useEffect, useState } from "react";
import {
  Button,
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

type Props = {
  photos: Photo[];
  onSelectionChange?: (selected: {
    countries: string[];
    cities: string[];
  }) => void;
};

export default function LocationSelector({ photos, onSelectionChange }: Props) {
  const [visible, setVisible] = useState(false);
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
      `https://docs.google.com/spreadsheets/d/e/2PACX-1vRUqmYxjUnGRx-JgOO8CP_gxaa2LNeX1c1grP2z3iVJExf3di7Rj1oWEIe5kTAsEaO2-B0dQM0KIefX/pub?gid=905203283&single=true&output=csv`
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
              (c) => c.en === city
            );
            allCitiesSet.add(city);
            if (!exists) {
              locationMap[country].cities.push({ en: city });
            }
          }
        });
        setLocationMap(locationMap);
        setAllCountries(["All", ...Array.from(allCountriesSet)]);
        setAllCities(["All", ...Array.from(allCitiesSet)]);
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
    if (current.includes(item)) {
      updated = current.filter((i) => i !== item && i !== "All");
    } else {
      updated = [...current, item];
    }
    setTempSelection(type, updated);
  };

  const getCurrentItems = (type: "country" | "city") => {
    if (type === "country") {
      return Array.from(new Set(["All", ...allCountries]));
    }
    if (type === "city") {
      const allCitiesSet = new Set<string>();

      tempCountries.forEach((country) => {
        const cities = locationMap[country]?.cities ?? [];
        cities.forEach((c) => {
          if (c.en) allCitiesSet.add(c.en);
        });
      });

      return Array.from(new Set(["All", ...allCitiesSet]));
    }

    return [];
  };

  const getButtonTitle = () => {
    if (selectedCountries.length == 0 && selectedCities.length == 0)
      return "None";

    const formatLabel = (items: string[]) => {
      if (!items.includes("All")) {
        return items.length === 1
          ? items[0]
          : `${items[1]}+${items.length - 1}`;
      }
      return items[0];
    };

    const countryLabel = selectedCountries.length
      ? formatLabel([...selectedCountries].sort())
      : "";

    const cityLabel = selectedCities.length
      ? formatLabel([...selectedCities].sort())
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
    });
  };

  return (
    <View style={{ alignItems: "center", marginBottom: 10 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <Text style={{ flexShrink: 1, fontSize: 16 }}>Location:</Text>
        <Button
          title={getButtonTitle()}
          onPress={() => {
            setVisible(true);
            setTempCountries(allCountries);
          }}
        />
      </View>

      <Modal
        transparent
        visible={visible}
        animationType="slide"
        onRequestClose={() => setVisible(false)}
      >
        <Pressable style={styles.overlay} onPress={() => setVisible(false)}>
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
                      setVisible(false);
                    }}
                  >
                    <Text style={styles.button}>Close</Text>
                  </TouchableOpacity>
                </View>
              </View>
              <View
                style={{
                  paddingLeft: "3%",
                  paddingRight: "3%",
                  paddingBottom: "2%",
                  paddingTop: "2%",
                  backgroundColor: "#EFF6FF",
                  borderColor: "#DBEAFE",
                  borderWidth: 1.18,
                }}
              >
                <Text
                  style={{
                    fontSize: 14,
                    color: "#4A5565",
                  }}
                >
                  Selected:
                </Text>
                <Text style={{ fontSize: 16, fontWeight: "400" }}>
                  {getButtonTitle()}
                </Text>
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
                    setSelectedCountries(tempCountries);
                    setSelectedCities(tempCities);
                    onSelectionChange?.({
                      countries: tempCountries,
                      cities: tempCities,
                    });

                    setVisible(false);
                  }}
                >
                  <Text style={styles.applyButton}>Apply Location</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}
const styles = StyleSheet.create({
  modalContainer: {
    backgroundColor: "white",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 20,
    paddingBottom: 40, // 아이폰 홈 바 영역 고려
    minHeight: 300,
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
  applyButton: {
    backgroundColor: "#AD46FF",
    fontSize: 16,
    color: "white",
    padding: 10,
    borderRadius: 5,
    textAlign: "center",
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
  },
});
