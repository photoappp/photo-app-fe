import { BannerAd, BannerAdSize } from "react-native-google-mobile-ads";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AdUnitIds } from "@/lib/ads/adUnitIds";
/* 2026.11.25 동의(UMP) 확인 후에만 배너 표시 by yen */
import { useAdsAllowed } from "@/lib/ads/adsConsent";

type Props = {
  size?: (typeof BannerAdSize)[keyof typeof BannerAdSize];
  withBottomInset?: boolean;
};

export default function BottomBannerAd({
  size = BannerAdSize.ANCHORED_ADAPTIVE_BANNER,
  withBottomInset = true,
}: Props) {
  const insets = useSafeAreaInsets();
  /* 2026.11.25 확인 중(null)이거나 광고 요청 불가면 배너를 그리지 않음 by yen */
  const adsAllowed = useAdsAllowed();
  if (!adsAllowed) return null;

  return (
    <View
      style={{
        paddingBottom: withBottomInset ? insets.bottom : 0,
        alignItems: "center",
        width: "100%",
      }}
    >
      <BannerAd
        unitId={AdUnitIds.banner}
        size={size}
        requestOptions={{
          requestNonPersonalizedAdsOnly: true,
        }}
      />
    </View>
  );
}
