import { Text, View, StyleSheet } from 'react-native';
import { useTheme } from '@/components/context/ThemeContext';

interface TextRowProps {
  title: string;
  value: string;
  align?: 'left' | 'right';
  multiline?: boolean;
}

export default function TextRow({ title, value, align = 'left', multiline = false }: TextRowProps) {
  const { colors } = useTheme();

  if (multiline) {
    const isLeft = align === 'left';
    return (
      <View style={styles.multilineRow}>
        <Text style={[styles.label, { color: colors.text }]}>{title}</Text>
        <Text style={[
          styles.multilineValue,
          { color: colors.secondary, textAlign: isLeft ? 'left' : 'right', alignSelf: isLeft ? 'flex-start' : 'stretch' }
        ]}>{value}</Text>
      </View>
    );
  }

  return (
    <View style={styles.row}>
      <Text style={[styles.label, { color: colors.text }]}>{title}</Text>
      <Text style={[styles.value, { color: colors.secondary }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    minHeight: 50,
  },
  column: {
    flexDirection: 'column',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  multilineRow: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  label: { fontSize: 16 },
  value: { fontSize: 16 },
  multilineValue: { fontSize: 16, marginTop: 8, alignSelf: 'stretch', textAlign: 'right' },
});