/* 2026.06.23 버튼 클릭 시 노출되는 공용 리워드(광고 시청) 팝업 UI by yen
   - 디자인: 상단 그라데이션 헤더(선물 아이콘) + 혜택 3종 + Watch Ad 버튼
   - 게이트 로직은 RewardGateContext가 담당하고, 이 컴포넌트는 표시만 담당해 재사용 가능하게 분리 */
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect } from "react";
import {
  ActivityIndicator,
  BackHandler,
  Modal,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
/* 2026.11.27 시스템 글꼴 크기 영향 차단(allowFontScaling 기본 false) by yen */
import { Text } from "@/components/FixedText";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useI18n } from "@/components/context/useI18n";
import type { RewardedAdStatus } from "@/lib/ads/rewardedAd";

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
  locationStatus?: RewardedAdStatus;
  adStatus?: RewardedAdStatus;
  onRetry?: () => void;
};

export default function RewardPopup({
  visible,
  loading = false,
  onWatchAd,
  onClose,
  asOverlay = false,
  locationStatus,
  adStatus,
  onRetry,
}: Props) {
  const { language, t } = useI18n();
  const insets = useSafeAreaInsets();
  const isLocation = locationStatus !== undefined;
  const status = locationStatus ?? adStatus;
  const watchDisabled = loading || (status !== undefined && status !== "ready");
  const locationStatusText = locationStatus === "preparing"
    ? t("locationRewardPreparing")
    : locationStatus === "unavailable" || locationStatus === "retryable"
      ? t("locationRewardUnavailable") : "";

  useEffect(() => {
    if (!visible || !asOverlay) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      onClose();
      return true;
    });
    return () => subscription.remove();
  }, [asOverlay, onClose, visible]);

  /* 2026.11.27 팝업 내용을 헤더/안내/버튼으로 나눔 — 화면보다 길어질 때 안내만 스크롤되고
     Watch Ad 버튼은 카드 하단에 항상 온전히 보이도록(Galaxy M33 등 큰 글꼴/화면 확대에서 버튼이 잘리던 문제) by yen */
  const headerContent = (
    <>
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

            <Text style={styles.title} allowFontScaling={isLocation ? false : undefined}>
              {isLocation ? t("locationRewardTitle") : t(
                "rewardPopupTitle",
                "Watch an ad to unlock all features for 2 hours.",
              )}
            </Text>
          </LinearGradient>
    </>
  );

  const infoContent = (
    <>
            {isLocation ? (
              <Text style={styles.locationDescription} allowFontScaling={false}>
                {t("locationRewardDescription")}
              </Text>
            ) : BENEFITS.map((benefit) => (
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
            {status !== undefined && (
              <View style={styles.locationStatus}>
                {locationStatusText ? (
                  <Text accessibilityLiveRegion="polite" style={styles.locationStatusText} allowFontScaling={false}>
                    {locationStatusText}
                  </Text>
                ) : status === "preparing" ? (
                  <ActivityIndicator color="#57615C" />
                ) : null}
              </View>
            )}
    </>
  );

  const actionContent = (
    <>
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={onWatchAd}
              disabled={watchDisabled}
              accessibilityRole="button"
              accessibilityState={{ disabled: watchDisabled }}
              style={[styles.watchButtonWrap, watchDisabled && styles.disabledWatchButton]}
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
                    <Text style={styles.watchButtonText} allowFontScaling={isLocation ? false : undefined}>
                      {isLocation && language === "ko" ? "광고 보기" : t("watchAd", "Watch Ad")}
                    </Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
            {onRetry && (
              <View style={styles.retrySlot}>
                {status === "retryable" && !loading && (
                  <TouchableOpacity
                    accessibilityRole="button"
                    onPress={onRetry}
                    style={styles.retryButton}
                  >
                    <Text style={styles.retryText} allowFontScaling={false}>
                      {t("rewardAdRetry")}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
    </>
  );

  /* 기존 배치(상태 표시 없는 팝업): 헤더 + 본문(안내 + 버튼) 그대로 */
  const cardContent = (
    <>
      {headerContent}
      {/* 혜택 목록 + Watch Ad 버튼 */}
      <View style={styles.body}>
        {infoContent}
        {actionContent}
      </View>
    </>
  );

  /* 2026.11.27 상태 표시 팝업(지도/위치 등): 스크롤 영역이 카드 높이에 맞춰 줄어들도록(flexGrow 0, flexShrink 1) 하고,
     버튼은 스크롤 밖 하단에 고정. 기존에는 ScrollView가 줄지 않아 카드(overflow hidden)에 잘리고 스크롤도 안 됐음 by yen */
  const scrollableCardContent = (
    <>
      <ScrollView style={styles.cardScroll} bounces={false}>
        {headerContent}
        <View style={[styles.body, styles.bodyAboveFooter]}>{infoContent}</View>
      </ScrollView>
      <View style={styles.cardFooter}>{actionContent}</View>
    </>
  );

  const content = (
    <View style={[
      styles.backdrop,
      status !== undefined && {
        paddingTop: insets.top + 12,
        paddingBottom: insets.bottom + 12,
        paddingLeft: insets.left + 24,
        paddingRight: insets.right + 24,
      },
    ]} collapsable={false}>
      <View style={[styles.card, status !== undefined && styles.locationCard]} accessibilityViewIsModal={asOverlay}>
        {status !== undefined ? scrollableCardContent : cardContent}
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
  locationCard: {
    flexShrink: 1,
  },
  /* 2026.11.27 카드 높이에 맞춰 줄어들고 넘치면 스크롤 by yen */
  cardScroll: {
    flexGrow: 0,
    flexShrink: 1,
  },
  /* 2026.11.27 스크롤 영역 아래 본문 여백은 하단 버튼 영역이 담당 by yen */
  bodyAboveFooter: {
    paddingBottom: 0,
  },
  /* 2026.11.27 Watch Ad 버튼 고정 영역(본문과 같은 좌우/하단 여백) by yen */
  cardFooter: {
    paddingHorizontal: 20,
    paddingBottom: 24,
    backgroundColor: "#FFFFFF",
  },
  locationDescription: {
    color: "#1F2937",
    fontSize: 16,
    lineHeight: 23,
    textAlign: "center",
  },
  locationStatus: {
    minHeight: 66,
    justifyContent: "center",
    paddingVertical: 6,
  },
  locationStatusText: {
    color: "#57615C",
    fontSize: 14,
    lineHeight: 19,
    textAlign: "center",
  },
  disabledWatchButton: {
    opacity: 0.55,
  },
  retrySlot: {
    minHeight: 44,
  },
  retryButton: {
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 12,
  },
  retryText: {
    color: "#245DC1",
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
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
