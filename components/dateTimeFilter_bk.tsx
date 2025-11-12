// App.js
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useWindowDimensions } from 'react-native';
import {
  View, Text, Button, Image, FlatList, PermissionsAndroid, Platform,
  TouchableOpacity, StyleSheet, Modal, ActivityIndicator, Alert,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';

type DatePickersResponsiveProps = {
    dateStart: Date;
    dateEnd: Date;
    onChangeStart: (d: Date) => void;
    onChangeEnd: (d: Date) => void;
  };

const DatePickersResponsive = ({ dateStart, dateEnd, onChangeStart, onChangeEnd }: DatePickersResponsiveProps) => {

  const { width } = useWindowDimensions();
  // 폭이 좁으면 세로 스택, 넓으면 좌우 배치
  const stack = width < 420;

  return (
    <>
      <View style={[styles.row, stack && { flexDirection: 'column', alignItems: 'stretch' }]}>
        <Text style={styles.section}>Start</Text>
        {!stack && <Text style={styles.section}>End</Text>}
      </View>

      <View style={[styles.row, stack && { flexDirection: 'column', alignItems: 'stretch' }]}>
        {/* START */}
        <View style={[styles.pickerBox, stack && styles.pickerBoxStack]}>
          <DateTimePicker
            value={dateStart}
            mode="date"
            display="spinner"
            onChange={(_, d) => { if (d) onChangeStart(d); }}
            style={{
              height: 220,               // 네이티브 기본 높이 유지
              transform: [
                { scale: 0.92 },         // 글자/휠 축소(원하면 0.85~0.95에서 조절)
                { translateY: -6 },      // 중앙선 보정(기기별로 -4 ~ -12 사이에서 미세 튜닝)
              ],
            }}
          />
          <View
            style={{
              position: 'absolute',
              left: 12,
              right: 12,
              height: 1,
              backgroundColor: '#e5e5ea',
              top: '33%', // 중앙선보다 살짝 위
            }}
          />
          <View
            style={{
              position: 'absolute',
              left: 12,
              right: 12,
              height: 1,
              backgroundColor: '#e5e5ea',
              top: '66%', // 중앙선보다 살짝 아래
            }}
          />
        </View>

        {/* END */}
        <View style={[styles.pickerBox, stack && styles.pickerBoxStack]}>
          {/* stack 모드에서는 상단 라벨이 Start만 보이므로 End 라벨 추가 */}
          {stack && <Text style={[styles.section, { marginBottom: 6 }]}>End</Text>}
          <DateTimePicker
            value={dateEnd}
            mode="date"
            display="spinner"
            onChange={(_, d) => { if (d) onChangeEnd(d); }}
            style={{
              height: 220,               // 네이티브 기본 높이 유지
              transform: [
                { scale: 0.92 },         // 글자/휠 축소(원하면 0.85~0.95에서 조절)
                { translateY: -6 },      // 중앙선 보정(기기별로 -4 ~ -12 사이에서 미세 튜닝)
              ],
            }}          
          />
          <View
            style={{
              position: 'absolute',
              left: 12,
              right: 12,
              height: 1,
              backgroundColor: '#e5e5ea',
              top: '33%', // 중앙선보다 살짝 위
            }}
          />
          <View
            style={{
              position: 'absolute',
              left: 12,
              right: 12,
              height: 1,
              backgroundColor: '#e5e5ea',
              top: '66%', // 중앙선보다 살짝 아래
            }}
          />
        </View>
      </View>
    </>
  );
};

const viewerStyles = StyleSheet.create({
  header: {
    position: 'absolute',
    top: 44,                // 노치 고려해서 여백
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  counter: { color: '#fff', fontSize: 16, fontWeight: '600' },
  metaTxt: { color: '#fff', fontSize: 14, fontWeight: '600' },
  closeBtn: {
    zIndex: 999, // 👈 추가
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center', justifyContent: 'center',
  },
  closeTxt: { color: '#fff', fontSize: 18, fontWeight: '700' },
});


// iOS UIDatePicker 스피너 기본 높이(기기별 216~220)
const IOS_WHEEL_NATIVE_HEIGHT = 220;
// 한 줄 높이(UIDatePicker 폰트 기준 대략 44pt)
const ROW_HEIGHT = 44;
const VISIBLE_ROWS = 3;
const VISIBLE_HEIGHT = ROW_HEIGHT * VISIBLE_ROWS; // 132
const WHEEL_SCALE = 0.92; // 0.88~0.95 사이 조절 가능

// scale 후 실제 렌더 높이
const RENDERED_HEIGHT = IOS_WHEEL_NATIVE_HEIGHT * WHEEL_SCALE;
// 위/아래 덮을 마스크 높이
const COVER_HEIGHT = Math.max(0, (RENDERED_HEIGHT - VISIBLE_HEIGHT) / 2);


const pad = (n: number) => `${n}`.padStart(2, '0');
const fmtDate = (d: Date) => `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
const fmtTime = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;

const today = new Date();
const oneYearAgo = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate());

const fmtDateTime = (ms: string | number | Date) => {
  if (!ms) return 'Unknown';
  const d = new Date(ms);
  const yyyy = d.getFullYear();
  const MM = `${d.getMonth()+1}`.padStart(2, '0');
  const DD = `${d.getDate()}`.padStart(2, '0');
  const hh = `${d.getHours()}`.padStart(2, '0');
  const mm = `${d.getMinutes()}`.padStart(2, '0');
  return `${yyyy}/${MM}/${DD} ${hh}:${mm}`;
};

// const dayStartMs = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).getTime();
// const dayEndNextMs = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 0, 0, 0).getTime();

// // 시각(분) 윈도우 판정: timeStart~timeEnd(분), 1440=24:00 처리 포함
// const inTimeWindow = (tsMs: string | number | Date, timeStart: number, timeEnd: number) => {
//   const local = new Date(tsMs);
//   const mins = local.getHours() * 60 + local.getMinutes();
//   if (timeEnd === 1440) return mins >= timeStart && mins <= 1439; // 24:00은 하루 끝까지
//   if (timeEnd >= timeStart) return mins >= timeStart && mins <= timeEnd;
//   // (필요시) 밤을 가르는 구간도 지원하려면 아래처럼:
//   // return mins >= timeStart || mins <= timeEnd;
//   return mins >= timeStart && mins <= timeEnd; // 기본: 정상 구간
// };


export default function dateTimeFilter() {
    // ---- 필터 상태 ----
    const [dateStart, setDateStart] = useState(oneYearAgo);
    const [dateEnd, setDateEnd] = useState(today);
    
    // 시간은 분 단위 (0~1440; 1440=24:00 허용)
    const [timeStart, setTimeStart] = useState(0);
    const [timeEnd, setTimeEnd] = useState(1440);
  
    // ---- 모달 표시 상태 ----
    const [dateModalVisible, setDateModalVisible] = useState(false);
    const [timeModalVisible, setTimeModalVisible] = useState(false);
  
    // ---- 사진 목록/페이지네이션 ----
    const [photos, setPhotos] = useState([]);
    const [endCursor, setEndCursor] = useState(undefined);
    const [hasNextPage, setHasNextPage] = useState(true);
    const [loading, setLoading] = useState(false);
    const [userScrolled, setUserScrolled] = useState(false);
    const onEndLockRef = useRef(false); // 연속 호출 잠금
    const [listCanScroll, setListCanScroll] = useState(false);
    const lastEndCallRef = useRef(0);
    const onEndDuringMomentumRef = useRef(true); // 모멘텀 중 중복 호출 방지
    const isPaginatingRef = useRef(false);       // footer 로딩바 표시에만 사용
  
    const [viewerVisible, setViewerVisible] = useState(false);
    const [viewerIndex, setViewerIndex] = useState(0);
  
    // === Viewer 안정화: 재마운트 방지용 메모/레퍼런스 ===
    // (A) images 참조 고정
    const viewerImages = useMemo(() => photos.map(p => ({ uri: p.uri })), [photos]);
    const viewerImages = useMemo(() => photos.map(p => ({ uri: p.uri })), [photos]);
    // (B) Header가 항상 최신 값을 읽도록 ref 유지
    const photosRef = useRef(photos);
    const viewerIndexRef = useRef(viewerIndex);
    useEffect(() => { photosRef.current = photos; }, [photos]);
    useEffect(() => { viewerIndexRef.current = viewerIndex; }, [viewerIndex]);
    // (C) Header: 참조 고정(빈 deps) + ref로 현재 아이템 메타 읽기
    const Header = useCallback(() => {
      const curTakenAt = photosRef.current?.[viewerIndexRef.current]?.takenAt;
      return (
        <View style={viewerStyles.header} pointerEvents="box-none">
          <Text style={viewerStyles.metaTxt}>{fmtDateTime(curTakenAt)}</Text>
          <TouchableOpacity
            onPress={() => setViewerVisible(false)}
            style={viewerStyles.closeBtn}
            pointerEvents="box-only"
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Text style={viewerStyles.closeTxt}>✕</Text>
          </TouchableOpacity>
        </View>
      );
    }, []);
  
    // 분→라벨 보조(필요시)
    const mm = (m) => `${`${Math.floor(m/60)}`.padStart(2,'0')}:${`${m%60}`.padStart(2,'0')}`;
  
    // 프리셋 적용
    const applyTimePreset = (s, e) => {
      setTimeStart(s);
      setTimeEnd(e);
    };
  
    // 프리셋 값(요구사항)
    const PRESETS = [
      { label: '00:00 - 05:59', s: 0,    e: 6*60-1 },  // 00:00~05:59
      { label: '06:00 - 11:59', s: 6*60, e: 12*60-1 }, // 06:00~11:59
      { label: '12:00 - 17:59', s: 12*60, e: 18*60-1}, // 12:00~17:59
      { label: '18:00 - 23:59', s: 18*60, e: 24*60-1}, // 18:00~23:59
    ];
  
    // 디바운스 타이머
    const debounceRef = useRef(null);
  
    // ---- 권한 요청 ----
    const requestPermission = useCallback(async () => {
      if (Platform.OS === 'android') {
        // SDK33+ READ_MEDIA_IMAGES, 그 이하 READ_EXTERNAL_STORAGE
        const perm =
          Platform.Version >= 33
            ? PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES
            : PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE;
  
        const granted = await PermissionsAndroid.request(perm);
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      }
      // iOS는 getPhotos 호출시 시스템 권한 플로우
      return true;
    }, []);
  
    // ---- 날짜+시간 → epoch(ms) 변환 ----
    const combineToMs = useCallback((d, mins) => {
      const base = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
      const combined = new Date(base.getTime() + mins * 60 * 1000);
      return combined.getTime();
    }, []);
  
    const effectiveFromTo = useCallback(() => {
      // 보정: End < Start이면 스왑
      let ds = dateStart, de = dateEnd;
      if (de.getTime() < ds.getTime()) [ds, de] = [de, ds];
      let ts = timeStart, te = timeEnd;
      if (te < ts) [ts, te] = [te, ts];
  
      // toTime은 inclusive가 아닐 수 있으므로 24:00이면 다음날 00:00로 보정
      const fromTime = combineToMs(ds, ts);
      const toTime = (te === 1440)
        ? new Date(de.getFullYear(), de.getMonth(), de.getDate() + 1, 0, 0, 0, 0).getTime()
        : combineToMs(de, te);
  
      return { fromTime, toTime };
    }, [dateStart, dateEnd, timeStart, timeEnd, combineToMs]);
  
    // // ---- 사진 로드 ----
    // const loadPhotos = useCallback(async ({ reset = false } = {}) => {
    //   const hasPerm = await requestPermission();
    //   if (!hasPerm) {
    //     Alert.alert('권한 필요', '사진 접근 권한이 필요합니다.');
    //     return;
    //   }
    //   if (loading) return;
    //   setLoading(true);
    //   try {
    //     // const { fromTime, toTime } = effectiveFromTo();
    //     // const params = {
    //     //   first: 60,
    //     //   assetType: 'Photos',
    //     //   fromTime,   // epoch ms
    //     //   toTime,     // epoch ms
    //     // };
    //     // 1) 네이티브 쿼리는 날짜 범위(하루 경계)만 사용
    //     const params = {
    //       first: 60,
    //       assetType: 'Photos',
    //       fromTime: dayStartMs(dateStart),
    //       toTime:   dayEndNextMs(dateEnd), // end-day의 다음날 00:00
    //     };
    //     if (!reset && endCursor) params.after = endCursor;
  
    //     const result = await CameraRoll.getPhotos(params);
    //     const nextEdges = result.edges ?? [];
    //     // const mapped = nextEdges.map((e) => ({
    //     //   uri: e.node.image.uri,
    //     //   takenAt: e?.node?.timestamp ? Math.round(e.node.timestamp * 1000) : null, // epoch sec → ms
    //     // }));
    //     // 2) 로컬에서 "시각 윈도우"로 필터링
    //     const filtered = nextEdges.filter((e) => {
    //       const tsMs = e?.node?.timestamp ? Math.round(e.node.timestamp * 1000) : null;
    //       if (!tsMs) return false;
    //       // 날짜 범위 안전 체크(혹시 네이티브가 넓게 줄 경우 대비)
    //       if (tsMs < dayStartMs(dateStart) || tsMs >= dayEndNextMs(dateEnd)) return false;
    //       return inTimeWindow(tsMs, timeStart, timeEnd);
    //     });
    //     const mapped = filtered.map((e) => ({
    //       uri: e.node.image.uri,
    //       takenAt: e?.node?.timestamp ? Math.round(e.node.timestamp * 1000) : null,
    //     }));
  
    //     setPhotos((prev) => (reset ? mapped : [...prev, ...mapped]));
    //     setEndCursor(result.page_info?.end_cursor);
    //     setHasNextPage(Boolean(result.page_info?.has_next_page));
        
    //   } catch (err) {
    //     console.log('CameraRoll 오류:', err);
    //     Alert.alert('오류', '사진을 불러오는 중 문제가 발생했습니다.');
    //   } finally {
    //     setLoading(false);
    //   }
    // }, [
    //   //requestPermission, loading, endCursor, effectiveFromTo
    //   requestPermission, loading, endCursor, dateStart, dateEnd, timeStart, timeEnd
    // ]);
  
    // ---- 필터 변경 → 디바운스 로드 ----
    useEffect(() => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        setEndCursor(undefined);
        setHasNextPage(true);
        loadPhotos({ reset: true });
      }, 200);
      return () => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
      };
    }, [dateStart, dateEnd, timeStart, timeEnd, loadPhotos]);
  
    // // 최초 로드
    // useEffect(() => {
    //   loadPhotos({ reset: true });
    //   // eslint-disable-next-line react-hooks/exhaustive-deps
    // }, []);
  
    // ---- Reset ----
    const resetAll = () => {
      setDateStart(oneYearAgo);
      setDateEnd(today);
      setTimeStart(0);
      setTimeEnd(1440);
    };
  
    // ---- 즐겨찾기 ----
    const favOneYearAgo = () => {
      const now = new Date();
      const d = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
      setDateStart(d);
      setDateEnd(d);
    };
    const favOneMonthAgo = () => {
      const now = new Date();
      const d = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
      setDateStart(d);
      setDateEnd(d);
    };
    const favPastMonth = () => {
      const now = new Date();
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const last = new Date(now.getFullYear(), now.getMonth(), 0);
      setDateStart(first);
      setDateEnd(last);
    };
    const favPastWeek = () => {
      const now = new Date();
      const s = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
      const e = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      setDateStart(s);
      setDateEnd(e);
    };
  
    // ---- Time 수정 유틸 (시/분을 분단위로) ----
    const setTimeHM = (which, hours, minutes) => {
      const mins = hours * 60 + minutes;
      if (which === 'start') setTimeStart(mins);
      else setTimeEnd(mins);
    };
  
    // ---- 렌더 ----
    const dateLabel = `Date: ${fmtDate(dateStart)} – ${fmtDate(dateEnd)}`;
    const timeLabel = `Time: ${fmtTime(timeStart)} – ${fmtTime(timeEnd)}`;
  
    const renderItem = ({ item, index }) => (
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => { setViewerIndex(index); setViewerVisible(true); }}
      >
        {/* <Image source={{ uri: item.uri }} style={styles.thumb} /> */}
        <Image source={{ uri: item.uri }} style={{ width: 90, height: 90, margin: 2, borderRadius: 6 }} />
      </TouchableOpacity>
    );
  
  
    return (
      <View style={{ flex: 1, paddingTop: 48 }}>

        {/* 상단 검색 바 */}
        <View style={styles.bar}>
          <Chip label={dateLabel} onPress={() => setDateModalVisible(true)} onReset={() => { setDateStart(oneYearAgo); setDateEnd(today); }} />
          <Chip label={timeLabel} onPress={() => setTimeModalVisible(true)} onReset={() => { setTimeStart(0); setTimeEnd(1440); }} />
          <TouchableOpacity onPress={resetAll} style={styles.resetBtn}>
            <Text style={styles.resetTxt}>Reset</Text>
          </TouchableOpacity>
        </View>
  
        {/* 썸네일 그리드
        <FlatList
          data={photos}
          numColumns={4}
          keyExtractor={(_, i) => i.toString()}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 4 }}
          onScrollBeginDrag={() => { setUserScrolled(true); }}
          onMomentumScrollBegin={() => { setUserScrolled(true); onEndDuringMomentumRef.current = false; }}
          onMomentumScrollEnd={() => { onEndDuringMomentumRef.current = true; }}
          onEndReachedThreshold={0.4}
          onEndReached={() => {
            // 1) 스크롤 시작 전이면 무시
            if (!userScrolled) return;
            // 2) 모멘텀 중 첫 호출만 허용
            if (onEndDuringMomentumRef.current) return;
            // 3) 이미 로딩 중/락이면 무시
            if (loading || onEndLockRef.current) return;
            // 4) 더 불러올 페이지 없으면 무시
            if (!hasNextPage) return;
            // ---- 페이지네이션 시작 ----
            onEndLockRef.current = true;
            onEndDuringMomentumRef.current = true; // 이번 모멘텀 사이클에서는 한 번만
            isPaginatingRef.current = true;
            loadPhotos({ reset: false }).finally(() => {
              onEndLockRef.current = false;
              isPaginatingRef.current = false;
            });
          }}
          ListFooterComponent={
            //loading ? <ActivityIndicator style={{ marginVertical: 12 }} /> : null
            // 사용자가 스크롤해서 로딩하는 경우에만 표시(초기 자동 로딩 표시 억제)
            //userScrolled && loading ? <ActivityIndicator style={{ marginVertical: 12 }} /> : null
            (isPaginatingRef.current && loading) ? <ActivityIndicator style={{ marginVertical: 12 }} /> : null
          }
          onLayout={({nativeEvent:{layout:{height: lh}}}) => {
            // 높이는 onContentSizeChange에서 비교
          }}
          onContentSizeChange={(_, ch) => {
            // ch: contentHeight
            // 화면보다 컨텐츠가 클 때만 다음 페이지 로딩 허용
            setListCanScroll(ch > 0);
          }}
        /> */}
  
        {/* 날짜 범위 모달: Start/End 한 팝업, 즐겨찾기 포함 (좁은 화면은 세로 스택) */}
        <Modal
          visible={dateModalVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setDateModalVisible(false)}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.sheet}>
              <View style={styles.sheetHeader}>
                <Text style={styles.sheetTitle}></Text>
                <View style={{ flexDirection: 'row' }}>
                  <TouchableOpacity onPress={() => { setDateStart(oneYearAgo); setDateEnd(today); setDateModalVisible(false); }}>
                    <Text style={styles.link}>Reset</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setDateModalVisible(false)} style={{ marginLeft: 16 }}>
                    <Text style={styles.link}>Close</Text>
                  </TouchableOpacity>
                </View>
              </View>
  
              <DatePickersResponsive
                dateStart={dateStart}
                dateEnd={dateEnd}
                onChangeStart={setDateStart}
                onChangeEnd={setDateEnd}
              />
  
              {/* 즐겨찾기 */}
              <View style={styles.favs}>
                <Fav label="One Year Ago" onPress={favOneYearAgo} />
                <Fav label="One Month Ago" onPress={favOneMonthAgo} />
                <Fav label="Past Month" onPress={favPastMonth} />
                <Fav label="Past Week" onPress={favPastWeek} />
              </View>
            </View>
          </View>
        </Modal>
  
        {/* 시간 범위 모달: Start/End 한 팝업 */}
        <Modal
          visible={timeModalVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setTimeModalVisible(false)}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.sheet}>
              <View style={styles.sheetHeader}>
                <Text style={styles.sheetTitle}></Text>
                <View style={{ flexDirection: 'row' }}>
                  <TouchableOpacity onPress={() => { setTimeStart(0); setTimeEnd(1440); setTimeModalVisible(false); }}>
                    <Text style={styles.link}>Reset</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setTimeModalVisible(false)} style={{ marginLeft: 16 }}>
                    <Text style={styles.link}>Close</Text>
                  </TouchableOpacity>
                </View>
              </View>
  
              {/* Start / End 두 섹션 */}
              <View style={styles.row}>
                <Text style={styles.section}>Start</Text>
                <Text style={styles.section}>End</Text>
              </View>
  
              <View style={styles.row}>
                {/* START: Time Picker 1 */}
                <View style={styles.pickerBox}>
                  <DateTimePicker
                    value={new Date(2000, 0, 1, Math.floor(timeStart/60), timeStart%60)}
                    mode="time"
                    display="spinner"
                    onChange={(_, d) => {
                      if (!d) return;
                      setTimeHM('start', d.getHours(), d.getMinutes());
                    }}
                    style={{
                      height: IOS_WHEEL_NATIVE_HEIGHT,
                      transform: [
                        { scale: WHEEL_SCALE },
                        // scale로 줄이면 중앙선이 약간 내려가 보일 수 있어 약간 올림(기기별 미세 조정: -6~-10)
                        { translateY: -6 },
                      ],
                    }}
                  />
                  <View style={[styles.cover, { top: 0, height: COVER_HEIGHT + 6 }]} />
                  <View style={[styles.cover, { bottom: 0, height: COVER_HEIGHT + 6 }]} />
                </View>
  
                {/* END: Time Picker 2 */}
                <View style={styles.pickerBox}>
                  <DateTimePicker
                    value={new Date(2000, 0, 1, Math.floor(timeEnd/60), timeEnd%60)}
                    mode="time"
                    display="spinner"
                    onChange={(_, d) => {
                      if (!d) return;
                      // 24:00 허용: 사용자가 00:00을 선택했는데 End를 다음날 00:00으로 간주하고 싶다면 아래 로직 확장
                      setTimeHM('end', d.getHours(), d.getMinutes());
                    }}
                    style={{
                      height: IOS_WHEEL_NATIVE_HEIGHT,
                      transform: [
                        { scale: WHEEL_SCALE },
                        // scale로 줄이면 중앙선이 약간 내려가 보일 수 있어 약간 올림(기기별 미세 조정: -6~-10)
                        { translateY: -6 },
                      ],
                    }}
                  />
                  <View style={[styles.cover, { top: 0, height: COVER_HEIGHT + 6 }]} />
                  <View style={[styles.cover, { bottom: 0, height: COVER_HEIGHT + 6 }]} />
                </View>
              </View>
  
              {/* 프리셋 4개 (2x2 그리드) */}
              <View style={styles.timePresetGrid}>
                {PRESETS.map(p => (
                  <TouchableOpacity
                    key={p.label}
                    style={styles.timePresetBtn}
                    activeOpacity={0.8}
                    onPress={() => applyTimePreset(p.s, p.e)}
                  >
                    <Text style={styles.timePresetTxt}>{p.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
  
              {/* Anytime 한 줄 */}
              <TouchableOpacity
                style={[styles.timePresetBtn, styles.timePresetAny]}
                activeOpacity={0.8}
                onPress={() => applyTimePreset(0, 1440)}  // 00:00~24:00
              >
                <Text style={styles.timePresetTxt}>Any Time</Text>
              </TouchableOpacity>
  
            </View>
          </View>
        </Modal>
      </View>
    );
  }

/* ---------------- UI 컴포넌트 ---------------- */
const Chip = ({ label, onPress, onReset }) => (
    <TouchableOpacity onPress={onPress} style={styles.chip}>
      <Text style={styles.chipTxt}>{label}</Text>
      <TouchableOpacity onPress={onReset} style={{ marginLeft: 6 }}>
        <Text style={{ fontWeight: '700' }}>×</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
  
  const Fav = ({ label, onPress }) => (
    <TouchableOpacity onPress={onPress} style={styles.favBtn}>
      <Text style={styles.favTxt}>{label}</Text>
    </TouchableOpacity>
  );

/* ---------------- 스타일 ---------------- */
const styles = StyleSheet.create({
    bar: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: '#fff',
      elevation: 2,
    },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1, borderColor: '#ccc', borderRadius: 20,
      paddingHorizontal: 10, paddingVertical: 6, marginRight: 8,
    },
    chipTxt: { fontSize: 12 },
    resetBtn: { marginLeft: 'auto' },
    resetTxt: { color: '#3478f6', fontWeight: '600' },
  
    thumb: { width: '24%', aspectRatio: 1, backgroundColor: '#ddd', margin: '0.5%', borderRadius: 6 },
  
    modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' },
    sheet: { backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 12, maxHeight: '80%' },
    sheetHeader: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center' },
    sheetTitle: { fontWeight: '600', fontSize: 16 },
    link: { color: '#3478f6', fontWeight: '600' },
  
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
    section: { fontWeight: '600' },
    pickerBox: {
      width: '48%',
      borderWidth: 1, borderColor: '#eee', borderRadius: 12,
      height: VISIBLE_HEIGHT,     // ← 3줄만 보이게
      overflow: 'hidden',
      position: 'relative',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#fff',    // 모달 배경과 동일해야 덮개가 티 안남
    },
    cover: {
      position: 'absolute',
      left: 0, right: 0,
      backgroundColor: '#fff',    // 모달 바탕색과 동일
      zIndex: 10,
    },
    pickerBoxStack: { width: '100%', marginTop: 8, },
  
  
    favs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
    favBtn: { borderWidth: 1, borderColor: '#ccc', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6, marginRight: 8, marginBottom: 8 },
    favTxt: { fontSize: 12, fontWeight: '600' },
  
    timePresetGrid: {
      marginTop: 12,
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
    },
    timePresetBtn: {
      width: '48%',
      borderWidth: 1,
      borderColor: '#999',        
      borderRadius: 10,
      paddingVertical: 10,
      marginBottom: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    timePresetAny: {
      width: '100%',
      borderColor: '#999',
      paddingVertical: 12,
    },
    timePresetTxt: {
      fontWeight: '600',
    },
    
  });