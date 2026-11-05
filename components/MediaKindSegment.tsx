/* 2026.11.04 사진 영역과 날짜 필터 사이의 All | Photos | Screenshots 3분할 세그먼트 버튼 by yen */
import { useI18n } from "@/components/context/useI18n";
import type { MediaKind } from "@/lib/db/photoMetadataDb";
import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

type Props = {
  value: MediaKind;
  onChange: (value: MediaKind) => void;
  disabled?: boolean;
};

const OPTIONS = [
  { value: "all", key: "mediaKindAll", fallback: "All" },
  { value: "photos", key: "mediaKindPhotos", fallback: "Photos" },
  { value: "screenshots", key: "mediaKindScreenshots", fallback: "Screenshots" },
] as const;

export default function MediaKindSegment({ value, onChange, disabled }: Props) {
  const { t } = useI18n();

  return (
    <View style={styles.container}>
      {OPTIONS.map((option) => {
        const selected = option.value === value;
        const label = (
          <Text
            style={[styles.label, selected && styles.labelSelected]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
          >
            {t(option.key, option.fallback)}
          </Text>
        );

        return (
          <TouchableOpacity
            key={option.value}
            style={styles.segment}
            activeOpacity={0.8}
            disabled={disabled}
            onPress={() => onChange(option.value)}
            accessibilityRole="button"
            accessibilityState={{ selected, disabled }}
          >
            {selected ? (
              <LinearGradient
                colors={["#2B7FFF", "#AD46FF"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.segmentFill}
              >
                {label}
              </LinearGradient>
            ) : (
              <View style={styles.segmentFill}>{label}</View>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    height: 48,
    padding: 4,
    marginBottom: 12,
    borderRadius: 16,
    backgroundColor: "#fff",
    elevation: 3,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
  },
  segment: {
    flex: 1,
  },
  segmentFill: {
    flex: 1,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  label: {
    fontSize: 14,
    color: "#314158",
  },
  labelSelected: {
    color: "#fff",
    fontWeight: "bold",
  },
});
