import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';

export default function DateField({ value, onChange, placeholder = 'Select date' }) {
  const [open, setOpen] = useState(false);
  const dateValue = value ? new Date(value + 'T00:00:00') : new Date();

  function handleChange(event, selected) {
    if (Platform.OS === 'android') setOpen(false); // Android's dialog closes itself either way
    if (event.type === 'dismissed') return;
    if (selected) onChange(selected.toISOString().slice(0, 10));
  }

  return (
    <View>
      <Pressable style={styles.input} onPress={() => setOpen(true)}>
        <Text style={value ? styles.value : styles.placeholder}>{value || placeholder}</Text>
        <Ionicons name="calendar-outline" size={18} color="#546E7A" />
      </Pressable>
      {open && Platform.OS === 'ios' && (
        <View style={styles.iosPicker}>
          <DateTimePicker value={dateValue} mode="date" display="spinner" onChange={handleChange} />
          <Pressable style={styles.doneBtn} onPress={() => setOpen(false)}>
            <Text style={styles.doneText}>Done</Text>
          </Pressable>
        </View>
      )}
      {open && Platform.OS === 'android' && (
        <DateTimePicker value={dateValue} mode="date" display="default" onChange={handleChange} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderColor: '#CFD8DC', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14, backgroundColor: '#fff',
  },
  value: { fontSize: 15, color: '#263238' },
  placeholder: { fontSize: 15, color: '#90A4AE' },
  iosPicker: { backgroundColor: '#fff', borderRadius: 10, marginTop: 6, borderWidth: 1, borderColor: '#ECEFF1' },
  doneBtn: { alignSelf: 'flex-end', paddingVertical: 8, paddingHorizontal: 16 },
  doneText: { color: '#2E7D32', fontWeight: '700' },
});
