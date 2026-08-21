import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';

/* options: array of strings, or {value,label} objects (e.g. an "All" filter
   chip whose value is '' but label reads "All"). */
export default function SelectField({ value, options, onChange }) {
  const { colors, radius } = useTheme();
  const styles = useMemo(() => makeStyles(colors, radius), [colors, radius]);
  const items = options.map((opt) => (typeof opt === 'object' ? opt : { value: opt, label: opt }));

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {items.map((item) => {
        const active = item.value === value;
        return (
          <Pressable key={item.value || '(empty)'} style={[styles.chip, active && styles.chipActive]} onPress={() => onChange(item.value)}>
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{item.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function makeStyles(colors, radius) {
  return StyleSheet.create({
    row: { gap: 8, paddingVertical: 2 },
    chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border },
    chipActive: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
    chipText: { color: colors.textLight, fontSize: 13, fontWeight: '600' },
    chipTextActive: { color: colors.primaryDark },
  });
}
