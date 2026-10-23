/* The farm report (web Reports page and the mobile Reports screen), as an
   export document (shared/recordExport.js) the page shows and exports.

   Filtered to one animal, it becomes that animal's report: its profile, then
   only its own health, breeding, production and finance records, with the
   totals worked out for that animal. Without an animal it covers the whole
   farm, feeding and tasks included. Either way, a section with no records
   is left out, and every value is written in full. */

import { recordSection, exportMeta, cellOf } from './recordExport.js';
import { calcAge, fmtDate } from './format.js';
import { formatMoney, moneyOf } from './currency.js';

const inRange = (value, from, to) => {
  if (!from && !to) return true;
  if (!value) return false;
  const d = String(value).slice(0, 10);
  return (!from || d >= from) && (!to || d <= to);
};

const forAnimal = (animal) => (r) => Boolean(animal) && ((r.animal_id && r.animal_id === animal.id) || (r.tag_id && r.tag_id === animal.tag_id));

/* Production totals per type and unit, e.g. "Milk 312.5 L". */
function productionTotals(rows, t) {
  const sums = new Map();
  rows.forEach((p) => {
    const key = `${p.production_type || '—'}|${p.unit || ''}`;
    sums.set(key, (sums.get(key) || 0) + (Number(p.quantity) || 0));
  });
  return [...sums.entries()].map(([key, qty]) => {
    const [type, unit] = key.split('|');
    const unitText = unit ? t(`enums.productionUnit.${unit}`, { defaultValue: unit }) : '';
    return { label: t(`enums.productionType.${type}`, { defaultValue: type }), value: `${Math.round(qty * 100) / 100} ${unitText}`.trim() };
  });
}

function moneySummary(finance, t) {
  const income = finance.filter((r) => r.type === 'Income').reduce((s, r) => s + moneyOf(r), 0);
  const expense = finance.filter((r) => r.type === 'Expense').reduce((s, r) => s + moneyOf(r), 0);
  return [
    { label: t('reportsPage.totalIncome'), value: formatMoney(income) },
    { label: t('reportsPage.totalExpenses'), value: formatMoney(expense) },
    { label: t('reportsPage.netProfit'), value: formatMoney(income - expense) }
  ];
}

/* data: { animals, health_records, breeding_records, feeding_records,
   production_records, finance_records, tasks }. filters: { dateFrom,
   dateTo, animalId }. Returns the document plus `empty` when no section
   has records. */
export function buildFarmReport(data, filters, t, { farmName, livestockId } = {}) {
  const { dateFrom = '', dateTo = '', animalId = '' } = filters || {};
  const animals = data.animals || [];
  const animal = animalId ? animals.find((a) => a.id === animalId) : null;
  const pick = (rows, dateField, animalOnly) => (rows || []).filter((r) => inRange(r[dateField], dateFrom, dateTo) && (!animalOnly || forAnimal(animal)(r)));

  const health = pick(data.health_records, 'check_date', Boolean(animal));
  const breeding = pick(data.breeding_records, 'breeding_date', Boolean(animal));
  const production = pick(data.production_records, 'production_date', Boolean(animal));
  const finance = pick(data.finance_records, 'date', Boolean(animal));
  const feeding = animal ? [] : pick(data.feeding_records, 'feeding_date', false);
  const tasks = animal ? [] : pick(data.tasks, 'due_date', false);
  const herd = animal ? [] : animals;

  const range = dateFrom || dateTo
    ? `${dateFrom ? fmtDate(dateFrom) : '…'} ${t('reportsPage.to')} ${dateTo ? fmtDate(dateTo) : '…'}`
    : '';
  const filtersText = [range, animal ? `${t('reportsPage.animalTag')}: ${animal.tag_id}` : ''].filter(Boolean).join(' · ');

  const sections = [
    herd.length ? recordSection('animals', herd, t) : null,
    health.length ? recordSection('health_records', health, t) : null,
    breeding.length ? recordSection('breeding_records', breeding, t) : null,
    production.length ? recordSection('production_records', production, t) : null,
    feeding.length ? recordSection('feeding_records', feeding, t) : null,
    finance.length ? recordSection('finance_records', finance, t) : null,
    tasks.length ? recordSection('tasks', tasks, t) : null
  ].filter(Boolean);
  /* An animal report does not repeat the animal's tag in every row. */
  if (animal) {
    sections.forEach((s) => {
      const i = s.columns.findIndex((c) => c.key === 'tag_id');
      if (i >= 0) { s.columns.splice(i, 1); s.rows.forEach((r) => r.splice(i, 1)); }
    });
  }

  let summary;
  let profile = null;
  let title;
  if (animal) {
    title = t('reportsPage.animalReportTitle', { tag: animal.tag_id });
    const age = animal.date_of_birth ? calcAge(animal.date_of_birth) : '';
    const e = (group, v) => (v ? t(`enums.${group}.${v}`, { defaultValue: v }) : '');
    profile = [
      { label: t('tables.animals.fields.tag_id'), value: animal.tag_id },
      animal.name ? { label: t('tables.animals.fields.name'), value: animal.name } : null,
      { label: t('tables.animals.fields.species'), value: e('species', animal.species) || '—' },
      animal.breed ? { label: t('tables.animals.fields.breed'), value: animal.breed } : null,
      animal.sex ? { label: t('tables.animals.fields.sex'), value: e('sex', animal.sex) } : null,
      animal.date_of_birth ? { label: t('tables.animals.fields.date_of_birth'), value: `${fmtDate(animal.date_of_birth)}${age ? ` (${age})` : ''}` } : null,
      animal.location || animal.district ? { label: t('tables.animals.fields.location'), value: [animal.location, animal.district].filter(Boolean).join(', ') } : null,
      { label: t('tables.animals.fields.health_status'), value: e('animalHealthStatus', animal.health_status) || '—' },
      animal.last_check_date ? { label: t('exports.fields.last_check_date'), value: fmtDate(animal.last_check_date) } : null,
      animal.notes ? { label: t('tables.animals.fields.notes'), value: animal.notes, wide: true } : null
    ].filter(Boolean);
    const open = health.filter((h) => h.status && h.status !== 'Recovered').length;
    const births = breeding.filter((b) => b.birth_date).length;
    summary = [
      health.length ? { label: t('reportsPage.healthChecks'), value: String(health.length) } : null,
      health.length ? { label: t('reportsPage.openCases'), value: String(open) } : null,
      breeding.length ? { label: t('reportsPage.breedingEvents'), value: String(breeding.length) } : null,
      births ? { label: t('reportsPage.births'), value: String(births) } : null,
      ...productionTotals(production, t),
      ...(finance.length ? moneySummary(finance, t) : [])
    ].filter(Boolean);
  } else {
    title = t('reportsPage.farmReportTitle');
    const count = (status) => animals.filter((a) => a.health_status === status).length;
    summary = [
      { label: t('reportsPage.totalAnimals'), value: String(animals.length) },
      { label: t('reports.healthy'), value: String(count('Healthy')) },
      { label: t('reports.underTreatment'), value: String(count('Under Treatment')) },
      { label: t('reports.criticalStatus'), value: String(count('Critical')) },
      { label: t('dashboardPage.pregnant'), value: String((data.breeding_records || []).filter((b) => b.pregnancy_status === 'Pregnant').length) },
      ...moneySummary(finance, t),
      ...productionTotals(production, t)
    ];
  }

  return {
    title,
    subtitle: animal ? [animal.name, animal.species && t(`enums.species.${animal.species}`, { defaultValue: animal.species })].filter(Boolean).join(' · ') : '',
    meta: exportMeta(t, { farmName, livestockId, filtersText }),
    profile,
    summary,
    summaryTitle: t('reportsPage.summary'),
    sections,
    empty: sections.length === 0
  };
}

export { cellOf };
