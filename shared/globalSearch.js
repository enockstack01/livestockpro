/* Search across every farm record, for the search box in the web top bar
   and the mobile header. Matches any word of the query (all words must
   appear somewhere in the record), ranks records whose title starts with
   the query first, and groups the results by section. Each group links to
   its page with ?search=, which pre-fills that page's own filter. */

import { recordCurrency } from './currency';

const lower = (v) => (v === null || v === undefined ? '' : String(v).toLowerCase());

/* key: the data table; path: the page; fields: what is searched;
   title / sub: how a result reads. `e(group, value)` translates enum values. */
export const SEARCH_SECTIONS = [
  {
    key: 'animals', path: '/animals', icon: 'cow', labelKey: 'tables.animals.label',
    fields: ['tag_id', 'name', 'species', 'breed', 'sex', 'location', 'district', 'health_status', 'notes'],
    title: (r) => [r.tag_id, r.name].filter(Boolean).join(' · '),
    sub: (r, e) => [e('species', r.species), r.breed, e('animalHealthStatus', r.health_status)].filter(Boolean).join(' · ')
  },
  {
    key: 'health_records', path: '/health', icon: 'stethoscope', labelKey: 'healthPage.title',
    fields: ['tag_id', 'disease', 'treatment', 'medicine', 'vet_name', 'status', 'district', 'notes'],
    title: (r) => [r.disease || r.treatment, r.tag_id].filter(Boolean).join(' · '),
    sub: (r, e) => [r.check_date, e('healthRecordStatus', r.status), r.vet_name].filter(Boolean).join(' · ')
  },
  {
    key: 'feeding_records', path: '/feeding', icon: 'wheat-awn', labelKey: 'tables.feeding_records.label',
    fields: ['feed_type', 'animal_group', 'district', 'notes'],
    title: (r) => [r.feed_type, r.animal_group].filter(Boolean).join(' · '),
    sub: (r) => [r.feeding_date, r.quantity ? `${r.quantity} ${r.unit || ''}`.trim() : ''].filter(Boolean).join(' · ')
  },
  {
    key: 'breeding_records', path: '/breeding', icon: 'venus-mars', labelKey: 'tables.breeding_records.label',
    fields: ['tag_id', 'pregnancy_status', 'newborn_details', 'district', 'notes'],
    title: (r, e) => [r.tag_id, e('pregnancyStatus', r.pregnancy_status)].filter(Boolean).join(' · '),
    sub: (r) => [r.breeding_date, r.expected_birth_date].filter(Boolean).join(' · ')
  },
  {
    key: 'production_records', path: '/production', icon: 'gauge', labelKey: 'tables.production_records.label',
    fields: ['production_type', 'tag_id', 'unit', 'district', 'notes'],
    title: (r, e) => [e('productionType', r.production_type), r.tag_id].filter(Boolean).join(' · '),
    sub: (r) => [r.production_date, r.quantity ? `${r.quantity} ${r.unit || ''}`.trim() : ''].filter(Boolean).join(' · ')
  },
  {
    key: 'finance_records', path: '/finance', icon: 'coins', labelKey: 'tables.finance_records.label',
    fields: ['type', 'category', 'description', 'tag_id', 'district'],
    title: (r, e) => [e('financeCategory', r.category), e('financeType', r.type)].filter(Boolean).join(' · '),
    sub: (r) => [r.date, r.amount !== undefined && r.amount !== null ? `${Number(r.amount).toLocaleString()} ${recordCurrency(r)}` : '', r.description].filter(Boolean).join(' · ')
  },
  {
    key: 'tasks', path: '/tasks', icon: 'list-check', labelKey: 'tables.tasks.label',
    fields: ['title', 'description', 'priority', 'status', 'district'],
    title: (r) => r.title || '',
    sub: (r, e) => [r.due_date, e('taskStatus', r.status), e('taskPriority', r.priority)].filter(Boolean).join(' · ')
  }
];

export const SEARCH_TABLES = SEARCH_SECTIONS.map((s) => s.key);

/* The page path a section lives on, and back. */
export const sectionForPath = (pathname) => SEARCH_SECTIONS.find((s) => pathname === s.path) || null;

/* data: { animals: [...], health_records: [...], ... }.
   Returns [{ key, path, icon, labelKey, total, items: [{ id, title, sub }] }]
   for sections with matches, at most `perSection` items each. */
export function searchRecords(data, query, t, { perSection = 4, exclude = null } = {}) {
  const words = lower(query).split(/\s+/).filter(Boolean);
  if (!words.length || lower(query).trim().length < 2) return [];
  const e = (group, v) => (v ? (t ? t(`enums.${group}.${v}`, { defaultValue: v }) : v) : '');
  const q = lower(query).trim();
  const out = [];
  for (const s of SEARCH_SECTIONS) {
    if (s.key === exclude) continue;
    const rows = (data && data[s.key]) || [];
    const hits = [];
    for (const r of rows) {
      const hay = s.fields.map((f) => lower(r[f])).join(' \u0001 ');
      if (!words.every((w) => hay.includes(w))) continue;
      const title = s.title(r, e) || '—';
      const rank = lower(title).startsWith(q) ? 0 : lower(title).includes(q) ? 1 : 2;
      hits.push({ id: r.id, title, sub: s.sub(r, e), rank });
    }
    if (!hits.length) continue;
    hits.sort((a, b) => a.rank - b.rank || a.title.localeCompare(b.title));
    out.push({ key: s.key, path: s.path, icon: s.icon, labelKey: s.labelKey, total: hits.length, items: hits.slice(0, perSection) });
  }
  return out;
}

/* Link that opens a section's page filtered by the query. */
export const searchLink = (section, query) => `${section.path}?search=${encodeURIComponent(query.trim())}`;
