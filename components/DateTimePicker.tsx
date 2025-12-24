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
};

export default function DateTimePicker({ mode, value, onChange }: Props) {
  const isAndroid = Platform.OS === 'android';

  if (isAndroid) {
    // Android -> react-native-date-picker 사용 (바텀시트 안 휠)
    return (
      <RNDatePicker
        mode={mode}
        date={value}
        onDateChange={onChange}
        theme="light"
        //androidVariant="iosClone"
        //textColor="#000000"
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
    />
  );
}
