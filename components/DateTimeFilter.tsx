// App.js
import { LinearGradient } from 'expo-linear-gradient';
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
import { logEvent } from '@amplitude/analytics-react-native';
import DateTimePicker from './DateTimePicker';


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
        <View style={[styles.pickerBox, stack && styles.pickerBoxStack]}>
          <DateTimePicker mode="date" value={dateStart} onChange={onChangeStart}/>
        </View>

        <View style={[styles.pickerBox, stack && styles.pickerBoxStack]}>
          <DateTimePicker mode="date" value={dateEnd} onChange={onChangeEnd}/>
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

    useEffect(() => {
      console.log('dateModalVisible =', dateModalVisible);
    }, [dateModalVisible]);

    useEffect(() => {
      console.log('timeModalVisible =', timeModalVisible);
    }, [timeModalVisible]);
  
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
    const dateLabel = `${fmtDate(dateStart)} – ${fmtDate(dateEnd)}`;
    const timeLabel = `${fmtTime(timeStart)} – ${fmtTime(timeEnd)}`;
  
    return (
      <View>
        {/* 하단 고정 필터 패널 */}
        <View style={styles.filterPanel}>
          {/* Date row */}
          
          <View style={styles.filterRow}>
            <Text style={styles.filterLabel}>Date</Text>
            <TouchableOpacity
              onPress={() => setDateModalVisible(true)}
              activeOpacity={0.8}
              style={styles.filterCard}
            >
              <Text style={styles.filterValue} numberOfLines={1}>
                {dateLabel}
              </Text>
              <Text style={styles.filterEdit}>Reset</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.filterRow}>
            <Text style={styles.filterLabel}>Time</Text>
            <TouchableOpacity
              onPress={() => setTimeModalVisible(true)}
              activeOpacity={0.8}
              style={styles.filterCard}
            >
              <Text style={styles.filterValue} numberOfLines={1}>
                {timeLabel}
              </Text>
              <Text style={styles.filterEdit}>Reset</Text>
            </TouchableOpacity>
          </View>

          {/* Location row – 기존 Location 필터 로직에 맞게 onPress 연결 */}
          <View style={styles.filterRow}>
            <Text style={styles.filterLabel}>Location</Text>
            <TouchableOpacity
              onPress={() => setTimeModalVisible(true)}
              activeOpacity={0.8}
              style={styles.filterCard}
            >
              <View style={styles.filterValueArea}>
                {/* <Text style={styles.filterValue} numberOfLines={1}>
                  {locationLabel}
                </Text> */}
                <Text style={styles.filterEdit}>Reset</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>
  
        {/* 날짜 범위 모달: Start/End 한 팝업, 즐겨찾기 포함 (좁은 화면은 세로 스택) */}
        {true && (
          <Modal
            visible={dateModalVisible}
            transparent
            animationType="slide"
            onRequestClose={() => setDateModalVisible(false)}
          >
            <View style={styles.modalBackdrop}>
              <View style={styles.sheet}>
                <View style={styles.sheetHeader}>
                  <Text style={styles.sheetTitle}>Select Date</Text>
                  <View style={{ flexDirection: 'row' }}>
                    <TouchableOpacity onPress={() => { setDateStart(oneYearAgo); setDateEnd(today); setDateModalVisible(false); }}>
                      <Text style={styles.link}>Reset</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setDateModalVisible(false)} style={{ marginLeft: 16 }}>
                      <Text style={styles.link}>Close</Text>
                    </TouchableOpacity>
                  </View>
                </View>
                
                {/* 즐겨찾기 */}
                <View style={styles.favs}>
                  <Fav label="One Year Ago" onPress={favOneYearAgo} />
                  <Fav label="One Month Ago" onPress={favOneMonthAgo} />
                  <Fav label="Past Month" onPress={favPastMonth} />
                  <Fav label="Past Week" onPress={favPastWeek} />
                </View>
    
                <DatePickersResponsive
                  dateStart={dateStart}
                  dateEnd={dateEnd}
                  onChangeStart={setDateStart}
                  onChangeEnd={setDateEnd}
                />
    

              </View>
            </View>
          </Modal>
        )}

        {/* 시간 범위 모달: Start/End 한 팝업 */}
        {true && (
          <Modal
            visible={timeModalVisible}
            transparent
            animationType="slide"
            onRequestClose={() => setTimeModalVisible(false)}
          >
            <View style={styles.modalBackdrop}>
              <View style={styles.sheet}>
                <View style={styles.sheetHeader}>
                  <Text style={styles.sheetTitle}>Select Time</Text>
                  <View style={{ flexDirection: 'row' }}>
                    <TouchableOpacity onPress={() => { setTimeStart(0); setTimeEnd(1439); setTimeModalVisible(false); }}>
                      <Text style={styles.link}>Reset</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setTimeModalVisible(false)} style={{ marginLeft: 16 }}>
                      <Text style={styles.link}>Close</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.row}>
                    <View style={styles.pickerBox}>
                      <DateTimePicker
                        mode="time"
                        value={new Date(2000, 0, 1, Math.floor(timeStart / 60), timeStart % 60)}
                        onChange={(d) => setTimeHM('start', d.getHours(), d.getMinutes())}
                      />
                    </View>

                    <View style={styles.pickerBox}>
                      <DateTimePicker
                        mode="time"
                        value={new Date(2000, 0, 1, Math.floor(timeEnd / 60), timeEnd % 60)}
                        onChange={(d) => setTimeHM('end', d.getHours(), d.getMinutes())}
                      />
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
                      <LinearGradient
                        colors={['#2B7FFF', '#AD46FF']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={styles.rangeBtnGradient}
                      >
                        <Text style={styles.timePresetTxt}>{p.label}</Text>
                      </LinearGradient>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Anytime 한 줄 */}
                <TouchableOpacity
                  style={[styles.timePresetBtn, styles.timePresetAny]}
                  activeOpacity={0.8}
                  onPress={() => applyTimePreset(0, 1439)}
                >
                  <LinearGradient
                          colors={['#2B7FFF', '#AD46FF']}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 0 }}
                          style={styles.rangeBtnGradient}
                  >
                    <Text style={styles.timePresetTxt}>All day</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
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
    <TouchableOpacity onPress={onPress}>
      <LinearGradient
        colors={['#2B7FFF', '#AD46FF']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.quickBtnGradient}
      >
        <Text style={styles.favTxt}>{label}</Text>
      </LinearGradient>
    </TouchableOpacity>
);

/* ---------------- 스타일 ---------------- */
const styles = StyleSheet.create({

    filterCard: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: "#fff",
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 12,
      // 그림자
      elevation: 3,
      shadowColor: "#000",
      shadowOpacity: 0.12,
      shadowOffset: { width: 0, height: 2 },
      shadowRadius: 4,
      flex: 1,   // ← 레이블 옆에서 가능한 공간을 전부 차지함
      marginLeft: 12,
    },
    filterLabel: {
      fontSize: 14,
      fontWeight: "bold",
      color: "#777",
      width: 65,   // ← 레이블 길이를 고정해야 줄바꿈 안 생김
    },
    filterValue: {
      fontSize: 12,
      color: "#000",
      flex: 1,
    },
    filterEdit: {
      fontSize: 10,
      color: "#3478f6",
      marginLeft: 12,
    },
    filterPanel: {
      //borderTopWidth: 1,
      //borderColor: '#eee',
      //backgroundColor: '#fff',
      paddingHorizontal: 0,
      paddingTop: 0,
      paddingBottom: 0,
    },
    filterRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 12,
    },
    filterTitle: {
      fontSize: 12,
      color: '#888',
      width: 90,              // 왼쪽 제목 폭 고정해서 정렬
    },
    filterValueArea: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
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
    sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    sheetTitle: { fontWeight: '600', fontSize: 15, color: '#000', },
    link: { color: '#3478f6', fontWeight: '600' },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, color: '#000', },
    section: { fontWeight: '600', color: '#000', },
    pickerBox: {
      width: '49%',
      borderWidth: 1, borderColor: '#eee', borderRadius: 12,
      ...Platform.select({
        ios: { height: VISIBLE_HEIGHT }, // 3줄
        android: { // 안드로이드는 휠 자체가 더 커서 높이를 충분히 주고 잘라내지 않음
          height: 130,
        },
      }),
      overflow: 'hidden',
      position: 'relative',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#fff',    // 모달 배경과 동일해야 덮개가 티 안남
      color: '#000',
      marginBottom: 0,
    },
    cover: {
      position: 'absolute',
      left: 0, right: 0,
      backgroundColor: '#fff',    // 모달 바탕색과 동일
      zIndex: 10,
    },
    pickerBoxStack: { width: '100%', marginTop: 5, },
    favs: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 12, },
    favBtn: { backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#F3F4F6', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5, marginRight: 0, marginBottom: 0 },
    favTxt: { fontSize: 9, fontWeight: '800', color: '#FFF', },
  
    timePresetGrid: {
      marginTop: 12,
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
    },
    timePresetBtn: {
      width: '49%',
      //borderWidth: 1,
      //borderColor: '#999',        
      borderRadius: 10,
      paddingVertical: 0,
      marginBottom: 5,
      alignItems: 'center',
      justifyContent: 'center',
    },
    timePresetAny: {
      width: '100%',
      borderColor: '#999',
      //paddingVertical: 12,
    },
    timePresetTxt: {
      fontWeight: '600',
      color: '#FFF',
    },

    quickBtnGradient: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 14,
    },
    
    rangeBtnGradient: {
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 12,
      width: '100%',
      justifyContent: 'center',
      alignItems: 'center',
    },

});
