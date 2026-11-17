/* 2026.11.04 사진 영역과 날짜 필터 사이의 All | Photos | Screenshots 3분할 세그먼트 버튼 by yen */
/* 2026.11.15 Photos | Screenshots | Others 다중 선택으로 변경 — 처음엔 모두 선택, 최소 1개는 선택 유지.
   디자인(색/그라데이션)은 그대로 by yen */
import { useI18n } from "@/components/context/useI18n";
import { ALL_MEDIA_KINDS, type MediaKind } from "@/lib/db/photoMetadataDb";
import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

type Props = {
  /* 2026.11.15 선택된 종류 목록 by yen */
  value: MediaKind[];
  onChange: (value: MediaKind[]) => void;
  disabled?: boolean;
};

const OPTIONS = [
  { value: "photos", key: "mediaKindPhotos", fallback: "Photos" },
  { value: "screenshots", key: "mediaKindScreenshots", fallback: "Screenshots" },
  /* 2026.11.15 Others 추가 by yen */
  { value: "others", key: "mediaKindOthers", fallback: "Others" },
] as const;

export default function MediaKindSegment({ value, onChange, disabled }: Props) {
  const { t } = useI18n();

  return (
    <View style={styles.container}>
      {OPTIONS.map((option) => {
        const selected = value.includes(option.value);
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
            onPress={() => {
              /* 2026.11.15 토글 — 마지막 남은 선택은 해제하지 않음 by yen */
              if (selected) {
                if (value.length <= 1) return;
                onChange(value.filter((kind) => kind !== option.value));
              } else {
                onChange(
                  ALL_MEDIA_KINDS.filter(
                    (kind) => kind === option.value || value.includes(kind),
                  ),
                );
              }
            }}
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
    /* 2026.11.16 다중 선택 시 버튼이 붙어 보이지 않도록 버튼 사이 간격 추가 by yen */
    gap: 4,
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
