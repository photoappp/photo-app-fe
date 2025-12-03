// App.js
import DateTimePicker from '@react-native-community/datetimepicker';
import {
  SetStateAction,
  useEffect,
  //useCallback, useMemo, useRef, 
  useState
} from 'react';
import {
  Modal,
  Platform,
  StyleSheet, Text,
  //Button, Image, FlatList, PermissionsAndroid, 
  TouchableOpacity, useWindowDimensions, View,
} from 'react-native';

type DatePickersResponsiveProps = {
    dateStart: Date;
    dateEnd: Date;
    onChangeStart: (d: Date) => void;
    onChangeEnd: (d: Date) => void;
  };

const DatePickersResponsive = ({ dateStart, dateEnd, onChangeStart, onChangeEnd }: DatePickersResponsiveProps) => {

  const { width } = useWindowDimensions();
  // 폭이 좁으면 세로 스택, 넓으면 좌우 배치
  const stack = true;

  return (
    <>
      <View style={[styles.row, stack && { flexDirection: 'column', alignItems: 'stretch' }]}>
        <Text style={styles.section}>Select date</Text>
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
                { scale: 0.95 },         // 글자/휠 축소(원하면 0.85~0.95에서 조절)
                { translateY: 0 },      // 중앙선 보정(기기별로 -4 ~ -12 사이에서 미세 튜닝)
              ],
            }}
            themeVariant="light"      // 👈 다크모드여도 라이트 테마 강제
            textColor="#000000"       // 👈 글자색 직접 지정
          />
        </View>

        {/* END */}
        <View style={[styles.pickerBox, stack && styles.pickerBoxStack]}>
          {/* stack 모드에서는 상단 라벨이 Start만 보이므로 End 라벨 추가 */}
          <DateTimePicker
            value={dateEnd}
            mode="date"
            display="spinner"
            onChange={(_, d) => { if (d) onChangeEnd(d); }}
            style={{
              height: 220,               // 네이티브 기본 높이 유지
              transform: [
                { scale: 0.95 },         // 글자/휠 축소(원하면 0.85~0.95에서 조절)
                { translateY: 0 },      // 중앙선 보정(기기별로 -4 ~ -12 사이에서 미세 튜닝)
              ],
            }}    
            themeVariant="light"      // 👈 다크모드여도 라이트 테마 강제
            textColor="#000000"       // 👈 글자색 직접 지정      
          />
        </View>
      </View>
    </>
  );
};

// iOS UIDatePicker 스피너 기본 높이(기기별 216~220)
const IOS_WHEEL_NATIVE_HEIGHT = 220;
// 한 줄 높이(UIDatePicker 폰트 기준 대략 44pt)
const ROW_HEIGHT = 30;
const VISIBLE_ROWS = 3;
const VISIBLE_HEIGHT = ROW_HEIGHT * VISIBLE_ROWS;
const WHEEL_SCALE = 0.95; // 0.88~0.95 사이 조절 가능

// scale 후 실제 렌더 높이
const RENDERED_HEIGHT = IOS_WHEEL_NATIVE_HEIGHT * WHEEL_SCALE;
// 위/아래 덮을 마스크 높이
const COVER_HEIGHT = Math.max(0, (RENDERED_HEIGHT - VISIBLE_HEIGHT) / 2);

const pad = (n: number) => `${n}`.padStart(2, '0');
const fmtDate = (d: Date) => `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
const fmtTime = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;

const today = new Date();
const oneYearAgo = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate());

type DateTimeFilterValue = {
    dateStart: Date;
    dateEnd: Date;
    timeStart: number;  // 0~1440
    timeEnd: number;
  };
  
  type DateTimeFilterProps = {
    onChange?: (value: DateTimeFilterValue) => void;
  };

export default function DateTimeFilter({ onChange }: DateTimeFilterProps) {
    // ---- 필터 상태 ----
    const [dateStart, setDateStart] = useState(oneYearAgo);
    const [dateEnd, setDateEnd] = useState(today);
    
    // 시간은 분 단위 (0~1440; 1440=24:00 허용)
    const [timeStart, setTimeStart] = useState(0);
    const [timeEnd, setTimeEnd] = useState(1440);
  
    // ---- 모달 표시 상태 ----
    const [dateModalVisible, setDateModalVisible] = useState(false);
    const [timeModalVisible, setTimeModalVisible] = useState(false);

    // 플랫폼 플래그
    const isIOS = Platform.OS === 'ios';

    // 안드로이드에서만 사용할, “어느 필드를 편집 중인지” 상태
    const [androidDateField, setAndroidDateField] =
      useState<'start' | 'end' | null>(null);
    const [androidTimeField, setAndroidTimeField] =
      useState<'start' | 'end' | null>(null);

    // 필터 값 바뀔 때마다 메인에 알려주기
    useEffect(() => {
        onChange?.({ dateStart, dateEnd, timeStart, timeEnd });
    }, [dateStart, dateEnd, timeStart, timeEnd, onChange]);
  
    // 분→라벨 보조(필요시)
    const mm = (m: number) => `${`${Math.floor(m/60)}`.padStart(2,'0')}:${`${m%60}`.padStart(2,'0')}`;
  
    // 프리셋 적용
    const applyTimePreset = (s: SetStateAction<number>, e: SetStateAction<number>) => {
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
    const setTimeHM = (which: string, hours: number, minutes: number) => {
      const mins = hours * 60 + minutes;
      if (which === 'start') setTimeStart(mins);
      else setTimeEnd(mins);
    };
  
    // ---- 렌더 ----
    const dateLabel = `Date: ${fmtDate(dateStart)} – ${fmtDate(dateEnd)}`;
    const timeLabel = `Time: ${fmtTime(timeStart)} – ${fmtTime(timeEnd)}`;
  
    return (
      <View>
        {/* 상단 검색 바 */}
        <View style={styles.bar}>
          <Chip label={dateLabel} 
            onPress={
              //() => setDateModalVisible(true)
              () => {
              if (isIOS) {
                setDateModalVisible(true); // iOS: 기존 bottom sheet
              } else {
                setAndroidDateField('start'); // Android: start 날짜부터 선택
              }
            }}
            onReset={() => { setDateStart(oneYearAgo); 
            setDateEnd(today); }} />
          <Chip
            label={timeLabel}
            onPress={() => {
              if (isIOS) {
                setTimeModalVisible(true); // iOS: 기존 bottom sheet
              } else {
                setAndroidTimeField('start'); // Android: start 시간부터 선택
              }
            }}
            onReset={() => {
              setTimeStart(0);
              setTimeEnd(1440);
            }}
          />
          {/* <TouchableOpacity onPress={resetAll} style={styles.resetBtn}>
            <Text style={styles.resetTxt}>Reset</Text>
          </TouchableOpacity> */}
        </View>
  
        {/* 날짜 범위 모달: Start/End 한 팝업, 즐겨찾기 포함 (좁은 화면은 세로 스택) */}
        {isIOS && (
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
        )}

        {/* 시간 범위 모달: Start/End 한 팝업 */}
        {isIOS && (
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
                    <TouchableOpacity onPress={() => { setTimeStart(0); setTimeEnd(1439); setTimeModalVisible(false); }}>
                      <Text style={styles.link}>Reset</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setTimeModalVisible(false)} style={{ marginLeft: 16 }}>
                      <Text style={styles.link}>Close</Text>
                    </TouchableOpacity>
                  </View>
                </View>
    
                {/* Start / End 두 섹션 */}
                <View style={styles.row}>
                  <Text style={styles.section}>Select time</Text>
                  {/* <Text style={styles.section}>End</Text> */}
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
                          { translateY: 0 },
                        ],
                      }}
                      themeVariant="light"      // 👈 다크모드여도 라이트 테마 강제
                      textColor="#000000"       // 👈 글자색 직접 지정
                    />
                    {/* <View style={[styles.cover, { top: 0, height: COVER_HEIGHT + 0 }]} />
                    <View style={[styles.cover, { bottom: 0, height: COVER_HEIGHT + 6 }]} /> */}
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
                          { translateY: 0 },
                        ],
                      }}
                      themeVariant="light"      // 👈 다크모드여도 라이트 테마 강제
                      textColor="#000000"       // 👈 글자색 직접 지정
                    />
                    {/* <View style={[styles.cover, { top: 0, height: COVER_HEIGHT + 6 }]} />
                    <View style={[styles.cover, { bottom: 0, height: COVER_HEIGHT + 6 }]} /> */}
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
                  onPress={() => applyTimePreset(0, 1439)}  // 00:00~24:00
                >
                  <Text style={styles.timePresetTxt}>All day</Text>
                </TouchableOpacity>
    
              </View>
            </View>
          </Modal>
        )}

        {/* ---- Android 전용 DatePicker (start/end 한 번씩) ---- */}
        {!isIOS && androidDateField && (
          <DateTimePicker
            value={androidDateField === 'start' ? dateStart : dateEnd}
            mode="date"
            display="default"            // 안드로이드 시스템 모달
            onChange={(_, d) => {
              if (d) {
                if (androidDateField === 'start') setDateStart(d);
                else setDateEnd(d);
              }
              setAndroidDateField(null); // 시스템 모달 닫힌 뒤 상태 초기화
            }}
          />
        )}

        {/* ---- Android 전용 TimePicker ---- */}
        {!isIOS && androidTimeField && (
          <DateTimePicker
            value={
              androidTimeField === 'start'
                ? new Date(2000, 0, 1, Math.floor(timeStart / 60), timeStart % 60)
                : new Date(2000, 0, 1, Math.floor(timeEnd / 60), timeEnd % 60)
            }
            mode="time"
            display="default"
            onChange={(_, d) => {
              if (!d) {
                setAndroidTimeField(null);
                return;
              }
              if (androidTimeField === 'start') {
                setTimeHM('start', d.getHours(), d.getMinutes());
              } else {
                setTimeHM('end', d.getHours(), d.getMinutes());
              }
              setAndroidTimeField(null);
            }}
          />
        )}

      </View>
    );
}

/* ---------------- UI 컴포넌트 ---------------- */
type ChipProps = {
    label: string;
    onPress: () => void;
    onReset: () => void;
};

const Chip = ({ label, onPress, onReset }: ChipProps) => (
    <TouchableOpacity onPress={onPress} style={styles.chip}>
      <Text style={styles.chipTxt}>{label}</Text>
      {/* <TouchableOpacity onPress={onReset} style={{ marginLeft: 6 }}>
        <Text style={{ fontWeight: '700' }}>Reset</Text>
      </TouchableOpacity> */}
    </TouchableOpacity>
);

type FavProps = {
    label: string;
    onPress: () => void;
};

const Fav = ({ label, onPress }: FavProps) => (
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
    chipTxt: { fontSize: 12, color: '#000', },
    resetBtn: { marginLeft: 'auto' },
    resetTxt: { color: '#3478f6', fontWeight: '600' },
  
    thumb: { width: '24%', aspectRatio: 1, backgroundColor: '#ddd', margin: '0.5%', borderRadius: 6 },
  
    modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' },
    sheet: { backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 12, maxHeight: '80%' },
    sheetHeader: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center' },
    sheetTitle: { fontWeight: '600', fontSize: 16, color: '#000', },
    link: { color: '#3478f6', fontWeight: '600' },
  
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, color: '#000', },
    section: { fontWeight: '600', color: '#000', },
    pickerBox: {
      width: '48%',
      borderWidth: 1, borderColor: '#eee', borderRadius: 12,
      height: VISIBLE_HEIGHT,     // ← 3줄만 보이게
      overflow: 'hidden',
      position: 'relative',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#fff',    // 모달 배경과 동일해야 덮개가 티 안남
      color: '#000',
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
    favTxt: { fontSize: 12, fontWeight: '600', color: '#000', },
  
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
      color: '#000',
    },

});