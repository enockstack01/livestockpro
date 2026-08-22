import { useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useTranslation } from 'react-i18next';
import Icon from './Icon';
import { useTheme } from '../theme/ThemeProvider';

export default function DateField({ value, onChange, placeholder = '' }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { colors, radius, scheme } = useTheme();
  const styles = useMemo(() => makeStyles(colors, radius), [colors, radius]);
  const dateValue = value ? new Date(value + 'T00:00:00') : new Date();

  function handleChange(event, selected) {
    if (Platform.OS === 'android') setOpen(false); // Android's dialog closes itself either way
    if (event.type === 'dismissed') return;
    if (selected) onChange(selected.toISOString().slice(0, 10));
  }

  // @react-native-community/datetimepicker has no web implementation, so the
  // native picker below never renders on web — without this branch, tapping
  // the field silently did nothing on every date field in the app. The
  // browser's own <input type="date"> already gives a full picker UI here.
  if (Platform.OS === 'web') {
    return (
      <View style={styles.input}>
        <input
          type="date"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 15, color: colors.text, fontFamily: 'inherit', colorScheme: scheme }}
        />
      </View>
    );
  }

  return (
    <View>
      <Pressable style={styles.input} onPress={() => setOpen(true)}>
        <Text style={value ? styles.value : styles.placeholder}>{value || placeholder}</Text>
        <Icon name="calendar-days" size={16} color={colors.textLight} />
      </Pressable>
      {open && Platform.OS === 'ios' && (
        <View style={styles.iosPicker}>
          <DateTimePicker value={dateValue} mode="date" display="spinner" onChange={handleChange} />
          <Pressable style={styles.doneBtn} onPress={() => setOpen(false)}>
            <Text style={styles.doneText}>{t('common.done')}</Text>
          </Pressable>
        </View>
      )}
      {open && Platform.OS === 'android' && (
        <DateTimePicker value={dateValue} mode="date" display="default" onChange={handleChange} />
      )}
    </View>
  );
}

function makeStyles(colors, radius) {
  return StyleSheet.create({
    input: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      borderWidth: 1, borderColor: colors.border, borderRadius: radius.card, paddingVertical: 12, paddingHorizontal: 14, backgroundColor: colors.card,
    },
    value: { fontSize: 15, color: colors.text },
    placeholder: { fontSize: 15, color: colors.placeholder },
    iosPicker: { backgroundColor: colors.card, borderRadius: radius.card, marginTop: 6, borderWidth: 1, borderColor: colors.border },
    doneBtn: { alignSelf: 'flex-end', paddingVertical: 8, paddingHorizontal: 16 },
    doneText: { color: colors.primary, fontWeight: '700' },
  });
}
