import React, { useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

type SearchBarProps = {
  placeholder?: string;
  onChangeText: (text: string) => void;
  value: string;
  onSubmitEditing?: () => void;
  suggestions?: { city?: string; country?: string }[]; // 👈 optional dropdown list
  onSelectSuggestion?: (item: string) => void; // 👈 callback when clicked
};

const SearchBar: React.FC<SearchBarProps> = ({
  placeholder,
  onChangeText,
  value,
  onSubmitEditing,
  suggestions = [],
  onSelectSuggestion,
}) => {
  const [inputLayout, setInputLayout] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);

  return (
    <View style={styles.container}>
      <View
        onLayout={(e) => setInputLayout(e.nativeEvent.layout)}
        style={styles.container}
      >
        <TextInput
          style={styles.input}
          placeholder={placeholder || "Search..."}
          onChangeText={onChangeText}
          value={value}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
          onSubmitEditing={() => onSubmitEditing?.()}
        />
      </View>
      {inputLayout && suggestions.length > 0 && (
        <View
          style={[
            styles.dropdown,
            {
              top: inputLayout.y + inputLayout.height,
              left: inputLayout.x,
              width: inputLayout.width,
            },
          ]}
        >
          <ScrollView nestedScrollEnabled style={{ maxHeight: 150 }}>
            {/* <FlatList
            data={suggestions}
            keyExtractor={(item, idx) => idx.toString()}
            renderItem={({ item }) => ( */}
            <View>
              {suggestions.map((item, index) => (
                <View key={`suggestion-${index}`}>
                  {/* City option */}
                  {item.city && (
                    <TouchableOpacity
                      onPress={() => onSelectSuggestion?.(item.city!)}
                    >
                      <Text style={styles.item}>{item.city}</Text>
                    </TouchableOpacity>
                  )}
                  {/* Country option */}
                  {item.country && (
                    <TouchableOpacity
                      onPress={() => onSelectSuggestion?.(item.country!)}
                    >
                      <Text style={styles.item}>{item.country}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))}
            </View>
            {/* // /> */}
          </ScrollView>
        </View>
      )}
    </View>
  );
};

export default SearchBar;

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  input: {
    height: 40,
    backgroundColor: "#f0f0f0",
    borderRadius: 8,
    paddingHorizontal: 10,
    fontSize: 16,
  },
  dropdown: {
    position: "absolute",
    top: 50, // below input
    left: 10,
    right: 10,
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 6,
    maxHeight: 150,
    zIndex: 1000,
  },
  item: {
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
});
