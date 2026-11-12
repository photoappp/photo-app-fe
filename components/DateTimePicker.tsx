// CrossPlatformDatePicker.tsx
import RNCDateTimePicker, {
  DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { Platform } from 'react-native';
import RNDatePicker from 'react-native-date-picker';

type Props = {
  mode: 'date' | 'time';
  value: Date;
  onChange: (d: Date) => void;
  minimumDate?: Date;
  maximumDate?: Date;
  /* 2026.11.08 Android 휠 구분선 색 — 날짜 시트에서 선택 줄 하이라이트를 대신 쓰기 위해 추가 by yen */
  dividerColor?: string;
};

export default function DateTimePicker({ mode, value, onChange, minimumDate, maximumDate, dividerColor }: Props) {
  const isAndroid = Platform.OS === 'android';

  if (isAndroid) {
    // Android -> react-native-date-picker 사용 (바텀시트 안 휠)
    return (
      <RNDatePicker
        mode={mode}
        date={value}
        onDateChange={onChange}
        theme="light"
        dividerColor={dividerColor}
        //androidVariant="iosClone"
        //textColor="#000000"
        minimumDate={mode === "date" ? minimumDate : undefined}
        maximumDate={mode === "date" ? maximumDate : undefined}
      />
    );
  }

  // iOS -> @react-native-community/datetimepicker 사용
  const handleIOSChange = (_e: DateTimePickerEvent, d?: Date) => {
    if (d) onChange(d);
  };

  return (
    <RNCDateTimePicker
      value={value}
      mode={mode}
      display="spinner"
      onChange={handleIOSChange}
      themeVariant="light"
      textColor="#000000"
      minimumDate={mode === "date" ? minimumDate : undefined}
      maximumDate={mode === "date" ? maximumDate : undefined}
    />
  );
}
