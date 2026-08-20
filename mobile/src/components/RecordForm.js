import { StyleSheet, Text, TextInput, View } from 'react-native';
import DateField from './DateField';
import SelectField from './SelectField';

/* Renders one input per field from a config/tables.js `fields[]` list.
   Config-driven so all 7 record-type screens share one form implementation
   instead of 7 hand-written ones. */
export default function RecordForm({ fields, values, onChange }) {
  return (
    <View style={{ gap: 16 }}>
      {fields.map((field) => (
        <View key={field.key}>
          <Text style={styles.label}>
            {field.label}
            {field.required ? <Text style={styles.required}> *</Text> : null}
          </Text>
          <FieldInput field={field} value={values[field.key]} onChange={(v) => onChange(field.key, v)} />
        </View>
      ))}
    </View>
  );
}

function FieldInput({ field, value, onChange }) {
  if (field.type === 'select') {
    return <SelectField value={value} options={field.options} onChange={onChange} />;
  }
  if (field.type === 'date') {
    return <DateField value={value} onChange={onChange} />;
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
        placeholderTextColor="#90A4AE"
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
        placeholderTextColor="#90A4AE"
      />
    );
  }
  return (
    <TextInput
      style={styles.input}
      value={value || ''}
      onChangeText={onChange}
      placeholder={field.label}
      placeholderTextColor="#90A4AE"
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

const styles = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '600', color: '#37474F', marginBottom: 6 },
  required: { color: '#D32F2F' },
  input: { borderWidth: 1, borderColor: '#CFD8DC', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14, fontSize: 15, color: '#263238', backgroundColor: '#fff' },
  textarea: { minHeight: 80, textAlignVertical: 'top' },
});
