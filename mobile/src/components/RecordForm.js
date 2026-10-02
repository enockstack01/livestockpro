import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import DateField from './DateField';
import { FormGroup, Input, Select } from '../ui/kit';
import { useBreakpoint } from '../ui/layout';
import { CURRENCIES, currencyName, getCurrency } from '../../../shared/currency';

/* Renders one input per field from a config/tables.js `fields[]` list,
   already localized by the caller (RecordListScreen.js resolves `label` and
   `options[].label` through i18next). Styled like the web forms
   (.form-group label + .form-control; dropdowns for selects) and, like the
   web's .form-row, pairs short fields two per row on wide screens while
   notes/textareas always take the full width. */
export default function RecordForm({ fields, values, onChange }) {
  const { t, i18n } = useTranslation();
  const { width } = useBreakpoint();
  const twoCol = width > 1024;

  const groups = [];
  fields.forEach((f) => {
    const last = groups[groups.length - 1];
    if (twoCol && f.type !== 'textarea' && last && last.length === 1 && last[0].type !== 'textarea') last.push(f);
    else groups.push([f]);
  });

  return (
    <View>
      {groups.map((group) => (
        <View key={group.map((f) => f.key).join('|')} style={{ flexDirection: 'row', gap: 16 }}>
          {group.map((field) => (
            <FormGroup key={field.key} label={field.label} required={field.required} style={{ flex: 1 }}>
              <FieldInput field={field} value={values[field.key]} onChange={(v) => onChange(field.key, v)} t={t} lang={i18n.language} />
            </FormGroup>
          ))}
        </View>
      ))}
    </View>
  );
}

function FieldInput({ field, value, onChange, t, lang }) {
  /* Each amount is saved in the currency it was paid or received in; the
     Settings currency is pre-selected. */
  if (field.type === 'currency') {
    const options = CURRENCIES.map((c) => ({ value: c.code, label: `${c.code} — ${currencyName(c.code, lang)}` }));
    return <Select value={value || getCurrency()} options={options} onChange={onChange} placeholder={field.label} />;
  }
  if (field.type === 'select') {
    const options = field.required ? field.options : [{ value: '', label: '—' }, ...field.options];
    return <Select value={value ?? ''} options={options} onChange={onChange} placeholder={field.label} />;
  }
  if (field.type === 'date') return <DateField value={value} onChange={onChange} placeholder={field.label} />;
  if (field.type === 'textarea') {
    return <Input multiline numberOfLines={3} value={value || ''} onChangeText={onChange} placeholder={t('common.notesPlaceholder', { defaultValue: field.label })} />;
  }
  if (field.type === 'number') {
    return <Input value={value === null || value === undefined ? '' : String(value)} onChangeText={(v) => onChange(v === '' ? '' : v)} keyboardType="decimal-pad" placeholder={field.label} />;
  }
  return <Input value={value || ''} onChangeText={onChange} placeholder={field.label} autoCapitalize={field.key === 'tag_id' ? 'characters' : 'sentences'} />;
}

/* Fills in each select field's configured default and leaves everything else
   blank — used when opening the "Add" form. */
export function emptyValues(fields) {
  const out = {};
  fields.forEach((f) => { out[f.key] = f.type === 'currency' ? getCurrency() : f.default || ''; });
  return out;
}
