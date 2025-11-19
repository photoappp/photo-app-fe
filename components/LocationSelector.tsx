import { Colors } from "@/constants/Colors";
import { Photo } from "@/types/Photo";
import { useEffect, useState } from "react";
import { Button, Modal, Pressable, StyleSheet, Text, View } from "react-native";
const CONTINENTS = [
  "Africa",
  "Asia",
  "Europe",
  "Oceania",
  "North America",
  "South America",
];
type CountryTranslations = {
  en: string;
  ko?: string;
  ja?: string;
  zh?: string;
};

type LocationMap = {
  [continent: string]: {
    countries: CountryTranslations[];
    cities?: Record<string, string[]>;
  };
};

type Props = {
  photos: Photo[];
  onSelectionChange?: (selected: {
    continents: string[];
    countries: string[];
    cities: string[];
  }) => void;
};

export default function ContinentSelector({
  photos,
  onSelectionChange,
}: Props) {
  const [visible, setVisible] = useState(false);
  const [modalStep, setModalStep] = useState<"continent" | "country" | "city">(
    "continent"
  );
  // Final selections (what user confirmed)
  const [selectedContinents, setSelectedContinents] = useState<string[]>([]);
  const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
  const [selectedCities, setSelectedCities] = useState<string[]>([]);
  const [translations, setTranslations] = useState<string[][]>([]);
  const [locationMap, setLocationMap] = useState<LocationMap>({});
  // Temporary selections in modal
  const [tempContinents, setTempContinents] = useState<string[]>([]);
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

        const locationMap: LocationMap = CONTINENTS.reduce((acc, continent) => {
          acc[continent] = { countries: [], cities: {} };
          return acc;
        }, {} as LocationMap);

        photos.forEach(({ country, city }) => {
          if (!country) return;

          const row = translations.find((r) => r[1] === country);
          if (!row) return;

          const continent = row[0];
          if (!continent) return;

          if (!locationMap[continent].countries.some((c) => c.en === country)) {
            locationMap[continent].countries.push({ en: country });
          }

          if (city) {
            if (!locationMap[continent].cities)
              locationMap[continent].cities = {};
            if (!locationMap[continent].cities[country])
              locationMap[continent].cities[country] = [];
            if (!locationMap[continent].cities[country].includes(city)) {
              locationMap[continent].cities[country].push(city);
            }
          }
        });
        setLocationMap(locationMap);
      })
      .catch(console.error);
  }, [photos]);

  const goNext = () => {
    if (modalStep === "continent") {
      setSelectedContinents(tempContinents);

      // Get all countries from selected continents
      const allCountries = tempContinents.flatMap((continent) => {
        const continentData = locationMap[continent];
        if (!continentData) return [];
        return continentData.countries.map((c) => c.en);
      });

      setTempCountries(["All", ...allCountries]);
      setModalStep("country");
    } else if (modalStep === "country") {
      setSelectedCountries(tempCountries);

      const allCities = tempCountries.flatMap((country) => {
        const continent = Object.keys(locationMap).find((cont) =>
          locationMap[cont].countries.some((c) => c.en === country)
        );
        if (!continent) return [];
        return locationMap[continent].cities?.[country] ?? [];
      });
      const citiesWithAll = ["All", ...allCities];
      setTempCities(citiesWithAll);
      setSelectedCities(citiesWithAll);

      setModalStep("city");
    }
  };

  const goBack = () => {
    if (modalStep === "city") {
      setSelectedCities([]);
      setModalStep("country");
    } else if (modalStep === "country") {
      setTempCountries(selectedCountries);
      setSelectedCountries([]);
      setModalStep("continent");
    }
  };
  // Get temporary selection array based on current step
  const getTempSelection = () => {
    if (modalStep === "continent") return tempContinents;
    if (modalStep === "country") return tempCountries;
    if (modalStep === "city") return tempCities;
    return [];
  };

  const setTempSelection = (items: string[]) => {
    if (modalStep === "continent") setTempContinents(items);
    else if (modalStep === "country") setTempCountries(items);
    else setTempCities(items);
  };

  const toggleItem = (item: string) => {
    const current = getTempSelection();
    const allItems = getCurrentItems();

    if (item === "All") {
      if (!current.includes("All")) {
        setTempSelection(allItems);
      } else {
        setTempSelection([]);
      }
      return;
    }

    // Normal toggle
    let updated: string[];
    if (current.includes(item)) {
      updated = current.filter((i) => i !== item);
    } else {
      updated = [...current, item];
    }

    if (updated.includes("All") && updated.length !== allItems.length) {
      updated = updated.filter((i) => i !== "All");
    }
    const nonAllItems = allItems.filter((i) => i !== "All");
    if (
      nonAllItems.every((i) => updated.includes(i)) &&
      !updated.includes("All")
    ) {
      updated = [...allItems];
    }

    setTempSelection(updated);
  };

  const getCurrentItems = () => {
    if (modalStep === "continent") return CONTINENTS;

    if (modalStep === "country") {
      const countries = tempContinents.flatMap((continent) => {
        const continentData = locationMap[continent];
        if (!continentData) return [];
        return continentData.countries.map((c) => c.en);
      });
      if (countries.length === 0) return [];
      return ["All", ...countries];
    }
    if (modalStep === "city") {
      const cities = tempCountries.flatMap((country) => {
        const continent = Object.keys(locationMap).find((cont) =>
          locationMap[cont].countries.some((c) => c.en === country)
        );

        if (!continent) return [];

        const cityList = locationMap[continent].cities?.[country] ?? [];
        return cityList;
      });

      return ["All", ...cities];
    }

    return [];
  };

  const getButtonTitle = () => {
    const countryTitles =
      selectedCountries.length > 1 ? selectedCountries : selectedContinents;
    if (!countryTitles.length && !selectedContinents.length) return "Anywhere";

    const formatLabel = (items: string[]) => {
      if (!items.includes("All")) {
        return items.length === 1
          ? items[0]
          : `${items[1]}+${items.length - 1}`;
      }
      return items.length === 1 ? items[1] : `${items[1]}+${items.length - 1}`;
    };

    const countryLabel = countryTitles.length
      ? formatLabel([...countryTitles].sort())
      : "";

    const cityLabel = selectedCities.length
      ? formatLabel([...selectedCities].sort())
      : "";

    return [countryLabel, cityLabel].filter(Boolean).join(", ");
  };

  const handleReset = () => {
    setSelectedContinents([]);
    setSelectedCountries([]);
    setSelectedCities([]);
    setTempCities([]);
    setTempCountries([]);

    onSelectionChange?.({
      continents: [],
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
            if (modalStep === "continent")
              setTempContinents(selectedContinents);
            else if (modalStep === "country")
              setTempCountries(selectedCountries);
            else setTempCities(selectedCities);
          }}
        />
        <Button title="Reset" onPress={handleReset} />
      </View>

      <Modal
        transparent
        visible={visible}
        animationType="slide"
        onRequestClose={() => setVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.selectionContainer}>
            <Text style={{ fontWeight: "bold" }}>{getButtonTitle()}</Text>

            {getCurrentItems().map((item) => (
              <Pressable
                key={item}
                onPress={() => toggleItem(item)}
                style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
              >
                <View
                  style={[
                    styles.checkBoxContainer,
                    {
                      backgroundColor: getTempSelection().includes(item)
                        ? Colors.light.selected
                        : Colors.light.background,
                    },
                  ]}
                >
                  {getTempSelection().includes(item) && (
                    <Text style={{ color: "white", fontWeight: "bold" }}>
                      ✓
                    </Text>
                  )}
                </View>
                <Text>{item}</Text>
              </Pressable>
            ))}

            <View style={styles.buttonContainer}>
              <Button
                title="Cancel"
                onPress={() => {
                  setVisible(false);
                  setModalStep("continent");
                }}
              />
              <View style={{ flexDirection: "row", gap: 10 }}>
                {modalStep !== "continent" && (
                  <Button title="Back" onPress={goBack} />
                )}
                {modalStep !== "city" && getTempSelection().length > 0 && (
                  <Button title="Next" onPress={goNext} />
                )}
                {modalStep !== "continent" && (
                  <Button
                    title="OK"
                    onPress={() => {
                      if (modalStep === "country")
                        setSelectedCountries(tempCountries);
                      else setSelectedCities(tempCities);
                      onSelectionChange?.({
                        continents: tempContinents,
                        countries: tempCountries,
                        cities: tempCities,
                      });

                      setVisible(false);
                      setModalStep("continent");
                    }}
                  />
                )}
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
    padding: 20,
  },
  selectionContainer: {
    backgroundColor: Colors.light.background,
    borderRadius: 10,
    padding: 20,
    gap: 10,
  },
  checkBoxContainer: {
    width: 20,
    height: 20,
    borderWidth: 1,
    borderColor: "#444",
    justifyContent: "center",
    alignItems: "center",
  },
  buttonContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderColor: "#ccc",
    backgroundColor: Colors.light.background,
  },
});
