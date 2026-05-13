import { BannerAd, BannerAdSize } from "react-native-google-mobile-ads";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AdUnitIds } from "@/lib/ads/adUnitIds";

type Props = {
  size?: (typeof BannerAdSize)[keyof typeof BannerAdSize];
  withBottomInset?: boolean;
};

export default function BottomBannerAd({
  size = BannerAdSize.ANCHORED_ADAPTIVE_BANNER,
  withBottomInset = true,
}: Props) {
  const insets = useSafeAreaInsets();

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
