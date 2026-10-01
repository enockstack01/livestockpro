import { Text, View } from 'react-native';
import { StatusBadge, PriorityBadge, PregnancyBadge } from '../components/Badges';
import { Badge } from '../ui/kit';
import { calcAge, fmtDate, isOverdueTask } from '../lib/shared';
import { formatMoney } from '../../../shared/currency';

/* Page-level presentation for each record screen, lifted from the matching
   web page (client/src/pages/{Animals,Health,Feeding,Breeding,Production,
   Finance,Tasks}.jsx): the page title/subtitle and add-button strings, the
   exact table columns in the web's order, whether the page offers CSV
   export, and which extra block it shows above the table (finance/
   production money cards, task summary + status tabs, feed stock alerts).
   `summary` is what a record shows as a compact list row on phones
   (title / subtitle / badge / meta, like the CropManager app); tapping the
   row opens every field in a details dialog. Form fields stay in
   config/tables.js. */

const dot = (...parts) => parts.filter(Boolean).join(' · ');
const trunc = (s, n) => (!s ? '—' : s.length > n ? s.substring(0, n) + '...' : s);
const TYPE_BADGE = { Milk: 'blue', Eggs: 'orange', Meat: 'red' };
const TYPE_ICON = { Milk: 'bottle-droplet', Eggs: 'egg', Meat: 'drumstick-bite' };

export const RECORD_PAGES = {
  animals: {
    page: 'animalsPage', addKey: 'animalsPage.addAnimal', emptyIcon: 'cow', exportable: true, importable: true,
    summary: (t) => (a) => ({ title: dot(a.tag_id, a.name), subtitle: dot(t(`enums.species.${a.species}`, a.species), a.breed, a.sex ? t(`enums.sex.${a.sex}`, a.sex) : null, a.date_of_birth ? calcAge(a.date_of_birth) : null), badge: <StatusBadge status={a.health_status} />, meta: a.location }),
    exportFields: ['tag_id', 'name', 'species', 'breed', 'sex', 'date_of_birth', 'location', 'health_status', 'last_check_date', 'notes'],
    columns: (t) => [
      { key: 'tag_id', label: t('tables.animals.fields.tag_id'), strong: true },
      { key: 'name', label: t('tables.animals.fields.name') },
      { key: 'species', label: t('tables.animals.fields.species'), render: (a) => t(`enums.species.${a.species}`, a.species) },
      { key: 'breed', label: t('tables.animals.fields.breed') },
      { key: 'sex', label: t('tables.animals.fields.sex'), render: (a) => (a.sex ? t(`enums.sex.${a.sex}`, a.sex) : '—') },
      { key: 'age', label: t('common.age'), render: (a) => calcAge(a.date_of_birth) },
      { key: 'location', label: t('tables.animals.fields.location') },
      { key: 'health_status', label: t('tables.animals.fields.health_status'), render: (a) => <StatusBadge status={a.health_status} /> },
      { key: 'last_check_date', label: t('common.lastCheck'), render: (a) => fmtDate(a.last_check_date) },
    ],
    filters: [
      { key: 'species', allKey: 'animalsPage.allSpecies', enumGroup: 'species', fromData: true },
      { key: 'health_status', allKey: 'animalsPage.allStatuses', enumGroup: 'animalHealthStatus', options: ['Healthy', 'Under Treatment', 'Critical', 'Deceased'] },
    ],
  },
  health_records: {
    page: 'healthPage', addKey: 'healthPage.addRecord', emptyIcon: 'stethoscope', exportable: true,
    summary: (t) => (h) => ({ title: dot(h.tag_id, h.disease), subtitle: dot(h.treatment, h.medicine, h.vet_name), badge: <StatusBadge status={h.status} />, meta: dot(fmtDate(h.check_date), h.next_check_date ? '→ ' + fmtDate(h.next_check_date) : null) }),
    exportFields: ['tag_id', 'disease', 'treatment', 'medicine', 'vet_name', 'check_date', 'next_check_date', 'status', 'notes'],
    columns: (t) => [
      { key: 'tag_id', label: t('tables.animals.fields.tag_id'), strong: true },
      { key: 'disease', label: t('tables.health_records.fields.disease') },
      { key: 'treatment', label: t('tables.health_records.fields.treatment') },
      { key: 'medicine', label: t('tables.health_records.fields.medicine') },
      { key: 'vet_name', label: t('tables.health_records.fields.vet_name') },
      { key: 'check_date', label: t('tables.health_records.fields.check_date'), render: (h) => fmtDate(h.check_date) },
      { key: 'next_check_date', label: t('tables.health_records.fields.next_check_date'), render: (h) => fmtDate(h.next_check_date) },
      { key: 'status', label: t('tables.health_records.fields.status'), render: (h) => <StatusBadge status={h.status} /> },
    ],
    filters: [],
  },
  feeding_records: {
    page: 'feedingPage', addKey: 'feedingPage.addRecord', emptyIcon: 'wheat-awn', extra: 'feedAlerts',
    summary: (t) => (f) => ({ title: f.feed_type, subtitle: dot(`${f.quantity || '—'} ${f.unit ? t(`enums.feedingUnit.${f.unit}`, f.unit) : ''}`.trim(), f.animal_group), meta: dot(formatMoney(f.cost, { decimals: 2 }), fmtDate(f.feeding_date)) }),
    columns: (t) => [
      { key: 'feed_type', label: t('tables.feeding_records.fields.feed_type'), strong: true },
      { key: 'quantity', label: t('tables.feeding_records.fields.quantity'), render: (f) => `${f.quantity || '—'} ${f.unit ? t(`enums.feedingUnit.${f.unit}`, f.unit) : ''}` },
      { key: 'cost', label: t('tables.feeding_records.fields.cost'), render: (f) => formatMoney(f.cost, { decimals: 2 }) },
      { key: 'feeding_date', label: t('tables.feeding_records.fields.feeding_date'), render: (f) => fmtDate(f.feeding_date) },
      { key: 'animal_group', label: t('tables.feeding_records.fields.animal_group') },
      { key: 'notes', label: t('tables.feeding_records.fields.notes') },
    ],
    filters: [],
  },
  breeding_records: {
    page: 'breedingPage', addKey: 'breedingPage.addRecord', emptyIcon: 'venus-mars',
    summary: (t) => (b) => ({ title: b.tag_id, subtitle: dot(fmtDate(b.breeding_date), b.expected_birth_date ? '→ ' + fmtDate(b.expected_birth_date) : null), badge: <PregnancyBadge status={b.pregnancy_status} />, meta: b.newborn_count ? String(b.newborn_count) + ' ×' : null }),
    columns: (t) => [
      { key: 'tag_id', label: t('tables.breeding_records.fields.tag_id'), strong: true },
      { key: 'breeding_date', label: t('tables.breeding_records.fields.breeding_date'), render: (b) => fmtDate(b.breeding_date) },
      { key: 'pregnancy_status', label: t('tables.breeding_records.fields.pregnancy_status'), render: (b) => <PregnancyBadge status={b.pregnancy_status} /> },
      { key: 'expected_birth_date', label: t('tables.breeding_records.fields.expected_birth_date'), render: (b) => fmtDate(b.expected_birth_date) },
      { key: 'birth_date', label: t('tables.breeding_records.fields.birth_date'), render: (b) => fmtDate(b.birth_date) },
      { key: 'newborn_count', label: t('tables.breeding_records.fields.newborn_count'), render: (b) => (b.newborn_count ? String(b.newborn_count) : '—') },
      { key: 'newborn_details', label: t('tables.breeding_records.fields.newborn_details'), render: (b) => trunc(b.newborn_details, 40) },
    ],
    filters: [
      { key: 'pregnancy_status', allKey: 'breedingPage.allStatuses', enumGroup: 'pregnancyStatus', options: ['Pregnant', 'Not Confirmed', 'Not Pregnant', 'Delivered'] },
    ],
  },
  production_records: {
    page: 'productionPage', addKey: 'productionPage.addRecord', emptyIcon: 'gauge-high', exportable: true, extra: 'productionSummary',
    summary: (t) => (p) => ({ title: `${p.quantity || 0} ${p.unit ? t(`enums.productionUnit.${p.unit}`, p.unit) : ''}`.trim(), subtitle: dot(p.tag_id, trunc(p.notes, 50) === '—' ? null : trunc(p.notes, 50)), badge: <Badge color={TYPE_BADGE[p.production_type] || 'green'} icon={TYPE_ICON[p.production_type] || 'box'} label={t(`enums.productionType.${p.production_type}`, p.production_type)} />, meta: fmtDate(p.production_date) }),
    exportFields: ['production_type', 'tag_id', 'quantity', 'unit', 'production_date', 'notes'],
    columns: (t) => [
      { key: 'production_type', label: t('tables.production_records.fields.production_type'), render: (p) => <Badge color={TYPE_BADGE[p.production_type] || 'green'} icon={TYPE_ICON[p.production_type] || 'box'} label={t(`enums.productionType.${p.production_type}`, p.production_type)} /> },
      { key: 'tag_id', label: t('tables.production_records.fields.tag_id') },
      { key: 'quantity', label: t('tables.production_records.fields.quantity'), strong: true, render: (p) => `${p.quantity || 0} ${p.unit ? t(`enums.productionUnit.${p.unit}`, p.unit) : ''}` },
      { key: 'production_date', label: t('tables.production_records.fields.production_date'), render: (p) => fmtDate(p.production_date) },
      { key: 'notes', label: t('tables.production_records.fields.notes'), render: (p) => trunc(p.notes, 35) },
    ],
    filters: [
      { key: 'production_type', allKey: 'productionPage.allTypes', enumGroup: 'productionType', options: ['Milk', 'Eggs', 'Meat'] },
    ],
  },
  finance_records: {
    page: 'financePage', addKey: 'financePage.addRecord', emptyIcon: 'receipt', exportable: true, extra: 'financeSummary',
    summary: (t) => (f) => ({ title: `${f.type === 'Income' ? '+' : '-'}${formatMoney(f.amount)}`, subtitle: dot(f.category ? t(`enums.financeCategory.${f.category}`, f.category) : null, trunc(f.description, 50) === '—' ? null : trunc(f.description, 50)), badge: <Badge color={f.type === 'Income' ? 'green' : 'red'} icon={f.type === 'Income' ? 'arrow-up' : 'arrow-down'} label={t(`enums.financeType.${f.type}`, f.type)} />, meta: fmtDate(f.date) }),
    exportFields: ['type', 'category', 'amount', 'date', 'description'],
    tabs: { key: 'type', values: ['Income', 'Expense'], labelKey: (v) => `enums.financeType.${v}` },
    columns: (t, colors) => [
      { key: 'type', label: t('tables.finance_records.fields.type'), render: (f) => <Badge color={f.type === 'Income' ? 'green' : 'red'} icon={f.type === 'Income' ? 'arrow-up' : 'arrow-down'} label={t(`enums.financeType.${f.type}`, f.type)} /> },
      { key: 'category', label: t('tables.finance_records.fields.category'), render: (f) => (f.category ? t(`enums.financeCategory.${f.category}`, f.category) : '—') },
      { key: 'amount', label: t('tables.finance_records.fields.amount'), render: (f) => <Text style={{ fontSize: 13, fontWeight: '600', color: f.type === 'Income' ? colors.primary : colors.red }}>{f.type === 'Income' ? '+' : '-'}{formatMoney(f.amount)}</Text> },
      { key: 'date', label: t('tables.finance_records.fields.date'), render: (f) => fmtDate(f.date) },
      { key: 'description', label: t('tables.finance_records.fields.description'), render: (f) => trunc(f.description, 40) },
    ],
    filters: [],
  },
  tasks: {
    page: 'tasksPage', addKey: 'tasksPage.addTask', emptyIcon: 'clipboard-check', extra: 'taskSummary',
    summary: (t) => (tk) => ({ title: tk.title, subtitle: trunc(tk.description, 70) === '—' ? null : trunc(tk.description, 70), badge: <View style={{ flexDirection: 'row', gap: 6 }}><PriorityBadge priority={tk.priority} /><StatusBadge status={tk.status} /></View>, meta: tk.due_date ? fmtDate(tk.due_date) + (isOverdueTask(tk) ? t('tasksPage.overdueSuffix') : '') : null }),
    tabs: { key: 'status', values: ['Pending', 'In Progress', 'Completed'], labelKey: (v) => `enums.taskStatus.${v}` },
    columns: (t, colors) => [
      { key: 'title', label: t('tables.tasks.fields.title'), render: (tk) => <Text style={{ fontSize: 13, fontWeight: '600', color: tk.status === 'Completed' ? colors.textLight : colors.text, textDecorationLine: tk.status === 'Completed' ? 'line-through' : 'none' }}>{tk.title}</Text> },
      { key: 'description', label: t('tables.tasks.fields.description'), render: (tk) => trunc(tk.description, 60) },
      { key: 'due_date', label: t('tables.tasks.fields.due_date'), render: (tk) => (isOverdueTask(tk) ? <Text style={{ fontSize: 13, fontWeight: '600', color: colors.red }}>{fmtDate(tk.due_date)}{t('tasksPage.overdueSuffix')}</Text> : fmtDate(tk.due_date)) },
      { key: 'priority', label: t('tables.tasks.fields.priority'), render: (tk) => <PriorityBadge priority={tk.priority} /> },
      { key: 'status', label: t('tables.tasks.fields.status'), render: (tk) => <StatusBadge status={tk.status} /> },
    ],
    filters: [],
  },
};
