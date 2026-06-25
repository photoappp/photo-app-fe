/* 2026.06.23 버튼 클릭 시 노출되는 공용 리워드(광고 시청) 팝업 UI by yen
   - 디자인: 상단 그라데이션 헤더(선물 아이콘) + 혜택 3종 + Watch Ad 버튼
   - 게이트 로직은 RewardGateContext가 담당하고, 이 컴포넌트는 표시만 담당해 재사용 가능하게 분리 */
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useI18n } from "@/components/context/useI18n";

type RewardBenefit = {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  labelKey: "rewardFeatureOlderPhotos" | "rewardFeatureViewOnMap" | "rewardFeaturePlaceSearch";
  fallback: string;
};

const BENEFITS: RewardBenefit[] = [
  {
    icon: "time-outline",
    color: "#2B7FFF",
    labelKey: "rewardFeatureOlderPhotos",
    fallback: "Search older photos",
  },
  {
    icon: "map-outline",
    color: "#8B5CF6",
    labelKey: "rewardFeatureViewOnMap",
    fallback: "View photos on map",
  },
  {
    icon: "location-outline",
    color: "#AD46FF",
    labelKey: "rewardFeaturePlaceSearch",
    fallback: "Unlimited place search",
  },
];

type Props = {
  visible: boolean;
  loading?: boolean;
  onWatchAd: () => void;
  onClose: () => void;
  /* 2026.06.23 다른 Modal(지도/장소 메뉴) 위에 띄울 때는 Modal 중첩 대신 절대위치 오버레이로 렌더해 iOS 프리즈를 방지 by yen */
  asOverlay?: boolean;
};

export default function RewardPopup({
  visible,
  loading = false,
  onWatchAd,
  onClose,
  asOverlay = false,
}: Props) {
  const { t } = useI18n();

  const content = (
    <View style={styles.backdrop}>
      <View style={styles.card}>
          {/* 상단 그라데이션 헤더 */}
          <LinearGradient
            colors={["#2B7FFF", "#AD46FF"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.header}
          >
            <TouchableOpacity
              style={styles.closeButton}
              onPress={onClose}
              activeOpacity={0.8}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="close" size={20} color="#FFFFFF" />
            </TouchableOpacity>

            <View style={styles.giftCircle}>
              <Ionicons name="gift" size={36} color="#FFFFFF" />
            </View>

            <Text style={styles.title}>
              {t(
                "rewardPopupTitle",
                "Watch an ad to unlock all features for 2 hours.",
              )}
            </Text>
          </LinearGradient>

          {/* 혜택 목록 + Watch Ad 버튼 */}
          <View style={styles.body}>
            {BENEFITS.map((benefit) => (
              <View key={benefit.labelKey} style={styles.benefitRow}>
                <View
                  style={[styles.benefitIcon, { backgroundColor: benefit.color }]}
                >
                  <Ionicons name={benefit.icon} size={18} color="#FFFFFF" />
                </View>
                <Text style={styles.benefitLabel}>
                  {t(benefit.labelKey, benefit.fallback)}
                </Text>
              </View>
            ))}

            <TouchableOpacity
              activeOpacity={0.9}
              onPress={onWatchAd}
              disabled={loading}
              style={styles.watchButtonWrap}
            >
              <LinearGradient
                colors={["#2B7FFF", "#AD46FF"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.watchButton}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="play" size={18} color="#FFFFFF" />
                    <Text style={styles.watchButtonText}>
                      {t("watchAd", "Watch Ad")}
                    </Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>
      </View>
    </View>
  );

  if (asOverlay) {
    /* 이미 열려 있는 Modal 안에서 그 위에 표시 (Modal 중첩 금지) */
    if (!visible) return null;
    return (
      <View style={styles.overlayFill} pointerEvents="auto">
        {content}
      </View>
    );
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {content}
    </Modal>
  );
}

const styles = StyleSheet.create({
  /* 다른 Modal 내부에서 그 위를 덮는 절대위치 오버레이 */
  overlayFill: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    elevation: 9999,
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 28,
    overflow: "hidden",
    backgroundColor: "#FFFFFF",
  },
  header: {
    paddingTop: 28,
    paddingBottom: 32,
    paddingHorizontal: 24,
    alignItems: "center",
  },
  closeButton: {
    position: "absolute",
    top: 16,
    right: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.25)",
    justifyContent: "center",
    alignItems: "center",
  },
  giftCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: "rgba(255,255,255,0.22)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 18,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "800",
    textAlign: "center",
    lineHeight: 30,
  },
  body: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 24,
  },
  benefitRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F7F5FC",
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 16,
    marginBottom: 14,
  },
  benefitIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
  },
  benefitLabel: {
    flex: 1,
    fontSize: 17,
    fontWeight: "700",
    color: "#1F2937",
  },
  watchButtonWrap: {
    marginTop: 6,
  },
  watchButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    paddingVertical: 16,
    gap: 8,
  },
  watchButtonText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "800",
  },
});
