import { useMemo, useRef, useState } from "react";
import { PanResponder, StyleSheet, Text, View } from "react-native";

type AsyncWorkDebugOverlayProps = {
  dbIndexComplete: boolean;
  indexedPhotoCount: number;
  currentFilterPhotoCount: number | null;
  photosLength: number;
  photosAllLength: number;
  displayUriMapSize: number;
  thumbnailResolving: boolean;
  thumbnailResolveRunId: number;
  photoLoadRequestId: number;
  currentDataSource: string;
  hasNextPage: boolean;
  appendLoading: boolean;
  backgroundLoading: boolean;
  pendingReload: boolean;
  staleRequestSkipCount: number;
  warnings: string[];
};

/* 2026.05.28 개발 중 비동기/백그라운드 작업 상태를 화면에서 즉시 확인하기 위한 디버그 오버레이 추가 by June */
export default function AsyncWorkDebugOverlay({
  dbIndexComplete,
  indexedPhotoCount,
  currentFilterPhotoCount,
  photosLength,
  photosAllLength,
  displayUriMapSize,
  thumbnailResolving,
  thumbnailResolveRunId,
  photoLoadRequestId,
  currentDataSource,
  hasNextPage,
  appendLoading,
  backgroundLoading,
  pendingReload,
  staleRequestSkipCount,
  warnings,
}: AsyncWorkDebugOverlayProps) {
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const dragStartOffsetRef = useRef({ x: 0, y: 0 });
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  /* 2026.05.28 디버그 오버레이가 화면 확인을 가리지 않도록 개발 중 드래그 이동을 지원 by June */
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, gestureState) =>
          Math.abs(gestureState.dx) > 2 || Math.abs(gestureState.dy) > 2,
        onPanResponderGrant: () => {
          dragStartOffsetRef.current = dragOffsetRef.current;
        },
        onPanResponderMove: (_, gestureState) => {
          const next = {
            x: dragStartOffsetRef.current.x + gestureState.dx,
            y: dragStartOffsetRef.current.y + gestureState.dy,
          };
          dragOffsetRef.current = next;
          setDragOffset(next);
        },
        onPanResponderRelease: () => {
          dragStartOffsetRef.current = dragOffsetRef.current;
        },
        onPanResponderTerminate: () => {
          dragStartOffsetRef.current = dragOffsetRef.current;
        },
      }),
    [],
  );

  if (!__DEV__) return null;

  const rows = [
    `DB index complete: ${dbIndexComplete}`,
    `Indexed photos: ${indexedPhotoCount}`,
    `Filter count: ${currentFilterPhotoCount ?? "unknown"}`,
    `photos/photosAll: ${photosLength}/${photosAllLength}`,
    `displayUriMap: ${displayUriMapSize}`,
    `thumbnailResolving: ${thumbnailResolving}`,
    `thumbnailRunId: ${thumbnailResolveRunId}`,
    `photoLoadRequestId: ${photoLoadRequestId}`,
    `source: ${currentDataSource}`,
    `hasNextPage: ${hasNextPage}`,
    `append/background: ${appendLoading}/${backgroundLoading}`,
    `pendingReload: ${pendingReload}`,
    `stale skips: ${staleRequestSkipCount}`,
  ];

  return (
    <View
      {...panResponder.panHandlers}
      style={[
        styles.container,
        {
          transform: [
            { translateX: dragOffset.x },
            { translateY: dragOffset.y },
          ],
        },
      ]}
    >
      <Text style={styles.dragHint}>Drag debug overlay</Text>
      {rows.map((row) => (
        <Text key={row} style={styles.text}>
          {row}
        </Text>
      ))}
      {warnings.slice(0, 3).map((warning, index) => (
        <Text key={`${warning}-${index}`} style={styles.warning}>
          {warning}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 8,
    bottom: 8,
    maxWidth: 280,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "rgba(17, 24, 39, 0.82)",
    zIndex: 9999,
  },
  text: {
    color: "#E5E7EB",
    fontSize: 10,
    lineHeight: 13,
  },
  dragHint: {
    color: "#93C5FD",
    fontSize: 10,
    fontWeight: "700",
    lineHeight: 13,
    marginBottom: 3,
  },
  warning: {
    color: "#FCD34D",
    fontSize: 10,
    lineHeight: 13,
    marginTop: 2,
  },
});
