import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

/* options: array of strings, or {value,label} objects (e.g. an "All" filter
   chip whose value is '' but label reads "All"). */
export default function SelectField({ value, options, onChange }) {
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

const styles = StyleSheet.create({
  row: { gap: 8, paddingVertical: 2 },
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, backgroundColor: '#ECEFF1', borderWidth: 1, borderColor: '#ECEFF1' },
  chipActive: { backgroundColor: '#E8F5E9', borderColor: '#2E7D32' },
  chipText: { color: '#546E7A', fontSize: 13, fontWeight: '600' },
  chipTextActive: { color: '#1B5E20' },
});
