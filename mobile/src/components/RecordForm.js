import { useMemo } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import DateField from './DateField';
import SelectField from './SelectField';
import { useTheme } from '../theme/ThemeProvider';

/* Renders one input per field from a config/tables.js `fields[]` list,
   already localized by the caller (RecordListScreen.js resolves `label` and
   `options[].label` through i18next before handing fields to this component
   — this component itself stays presentation-only, no i18n awareness needed
   here). Config-driven so all 7 record-type screens share one form
   implementation instead of 7 hand-written ones. */
export default function RecordForm({ fields, values, onChange }) {
  const { colors, radius } = useTheme();
  const styles = useMemo(() => makeStyles(colors, radius), [colors, radius]);

  return (
    <View style={{ gap: 16 }}>
      {fields.map((field) => (
        <View key={field.key}>
          <Text style={styles.label}>
            {field.label}
            {field.required ? <Text style={styles.required}> *</Text> : null}
          </Text>
          <FieldInput field={field} value={values[field.key]} onChange={(v) => onChange(field.key, v)} styles={styles} colors={colors} />
        </View>
      ))}
    </View>
  );
}

function FieldInput({ field, value, onChange, styles, colors }) {
  if (field.type === 'select') {
    return <SelectField value={value} options={field.options} onChange={onChange} />;
  }
  if (field.type === 'date') {
    return <DateField value={value} onChange={onChange} placeholder={field.label} />;
  }
  if (field.type === 'textarea') {
    return (
      <TextInput
        style={[styles.input, styles.textarea]}
        value={value || ''}
        onChangeText={onChange}
        multiline
        numberOfLines={3}
        placeholder={field.label}
        placeholderTextColor={colors.placeholder}
      />
    );
  }
  if (field.type === 'number') {
    return (
      <TextInput
        style={styles.input}
        value={value === null || value === undefined ? '' : String(value)}
        onChangeText={(t) => onChange(t === '' ? '' : t)}
        keyboardType="decimal-pad"
        placeholder={field.label}
        placeholderTextColor={colors.placeholder}
      />
    );
  }
  return (
    <TextInput
      style={styles.input}
      value={value || ''}
      onChangeText={onChange}
      placeholder={field.label}
      placeholderTextColor={colors.placeholder}
      autoCapitalize={field.key === 'tag_id' ? 'characters' : 'sentences'}
    />
  );
}

/* Fills in each select field's configured default and leaves everything else
   blank — used when opening the "Add" form. */
export function emptyValues(fields) {
  const out = {};
  fields.forEach((f) => { out[f.key] = f.default || ''; });
  return out;
}

function makeStyles(colors, radius) {
  return StyleSheet.create({
    label: { fontSize: 13, fontWeight: '600', color: colors.textLight, marginBottom: 6 },
    required: { color: colors.red },
    input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.card, paddingVertical: 12, paddingHorizontal: 14, fontSize: 15, color: colors.text, backgroundColor: colors.card },
    textarea: { minHeight: 80, textAlignVertical: 'top' },
  });
}
