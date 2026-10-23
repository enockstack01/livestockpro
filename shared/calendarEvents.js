/* Farm calendar events (web Calendar page and the mobile Calendar screen):
   tasks, health checks and follow ups, breeding, expected and actual births,
   and feeding, each on its date, coloured by kind like a Google Calendar
   view. Overdue tasks and missed follow ups are flagged in Alert Red. */

import { isOverdueTask } from './businessRules';

/* Brand colours (shared/chartPalette.js order); `ink` is the text colour
   that reads on the fill. */
export const CALENDAR_KINDS = [
  { key: 'task', icon: 'list-check', color: '#2E7D32', ink: '#FFFFFF' },
  { key: 'overdue', icon: 'clock', color: '#C62828', ink: '#FFFFFF' },
  { key: 'followUp', icon: 'calendar-check', color: '#F9A825', ink: '#1C2B1E' },
  { key: 'healthCheck', icon: 'stethoscope', color: '#5B6B5D', ink: '#FFFFFF' },
  { key: 'breeding', icon: 'venus-mars', color: '#14532D', ink: '#FFFFFF' },
  { key: 'birthDue', icon: 'baby', color: '#B26A2E', ink: '#FFFFFF' },
  { key: 'birth', icon: 'paw', color: '#6B7F2A', ink: '#FFFFFF' },
  { key: 'feeding', icon: 'wheat-awn', color: '#8A948B', ink: '#FFFFFF' }
];
export const KIND = Object.fromEntries(CALENDAR_KINDS.map((k) => [k.key, k]));
const ORDER = Object.fromEntries(CALENDAR_KINDS.map((k, i) => [k.key, i]));

const day = (v) => (v ? String(v).slice(0, 10) : '');
const today = () => new Date().toISOString().slice(0, 10);

/* data: { tasks, health_records, breeding_records, feeding_records }.
   Returns events { id, date (YYYY-MM-DD), kind, title, sub, path, done }. */
export function buildCalendarEvents(data, t) {
  const e = (group, v) => (v ? t(`enums.${group}.${v}`, { defaultValue: v }) : '');
  const now = today();
  const out = [];
  const push = (ev) => { if (ev.date) out.push(ev); };

  (data.tasks || []).forEach((tk) => push({
    id: `task-${tk.id}`,
    date: day(tk.due_date),
    kind: isOverdueTask(tk) ? 'overdue' : 'task',
    title: tk.title || t('tables.tasks.singular'),
    sub: [e('taskPriority', tk.priority), e('taskStatus', tk.status), tk.description].filter(Boolean).join(' · '),
    path: `/tasks?search=${encodeURIComponent(tk.title || '')}`,
    done: tk.status === 'Completed'
  }));

  (data.health_records || []).forEach((h) => {
    const tag = h.tag_id || '—';
    push({
      id: `check-${h.id}`,
      date: day(h.check_date),
      kind: 'healthCheck',
      title: t('calendar.events.healthCheck', { tag }),
      sub: [h.disease, h.treatment, e('healthRecordStatus', h.status)].filter(Boolean).join(' · '),
      path: `/health?search=${encodeURIComponent(h.tag_id || h.disease || '')}`,
      done: true
    });
    if (h.next_check_date && h.status !== 'Recovered') {
      const missed = day(h.next_check_date) < now;
      push({
        id: `follow-${h.id}`,
        date: day(h.next_check_date),
        kind: missed ? 'overdue' : 'followUp',
        title: missed ? t('calendar.events.followUpMissed', { tag }) : t('calendar.events.followUp', { tag }),
        sub: [h.disease, h.medicine, h.vet_name].filter(Boolean).join(' · '),
        path: `/health?search=${encodeURIComponent(h.tag_id || h.disease || '')}`,
        done: false
      });
    }
  });

  (data.breeding_records || []).forEach((b) => {
    const tag = b.tag_id || '—';
    const path = `/breeding?search=${encodeURIComponent(b.tag_id || '')}`;
    push({ id: `breed-${b.id}`, date: day(b.breeding_date), kind: 'breeding', title: t('calendar.events.breeding', { tag }), sub: e('pregnancyStatus', b.pregnancy_status), path, done: true });
    if (b.expected_birth_date && !b.birth_date && b.pregnancy_status === 'Pregnant') {
      push({ id: `due-${b.id}`, date: day(b.expected_birth_date), kind: 'birthDue', title: t('calendar.events.birthDue', { tag }), sub: b.notes || '', path, done: false });
    }
    if (b.birth_date) {
      push({ id: `birth-${b.id}`, date: day(b.birth_date), kind: 'birth', title: t('calendar.events.birth', { tag }), sub: [b.newborn_count ? t('calendar.events.newborns', { count: Number(b.newborn_count) }) : '', b.newborn_details].filter(Boolean).join(' · '), path, done: true });
    }
  });

  (data.feeding_records || []).forEach((f) => push({
    id: `feed-${f.id}`,
    date: day(f.feeding_date),
    kind: 'feeding',
    title: [f.feed_type, f.animal_group].filter(Boolean).join(' · ') || t('tables.feeding_records.singular'),
    sub: f.quantity ? `${f.quantity} ${f.unit || ''}`.trim() : '',
    path: `/feeding?search=${encodeURIComponent(f.feed_type || '')}`,
    done: true
  }));

  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : ORDER[a.kind] - ORDER[b.kind]));
}

/* Events grouped by day: { 'YYYY-MM-DD': [events] }. */
export function eventsByDay(events, kinds) {
  const map = {};
  events.forEach((ev) => {
    if (kinds && !kinds.has(ev.kind)) return;
    (map[ev.date] = map[ev.date] || []).push(ev);
  });
  return map;
}

const pad = (n) => String(n).padStart(2, '0');
export const isoDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/* The 6-week grid for a month, weeks starting on Monday:
   [{ date: 'YYYY-MM-DD', day: 1..31, inMonth, today }]. */
export function monthGrid(year, month) {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7; // Monday = 0
  const start = new Date(year, month, 1 - offset);
  const now = isoDay(new Date());
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const iso = isoDay(d);
    cells.push({ date: iso, day: d.getDate(), inMonth: d.getMonth() === month, today: iso === now });
  }
  return cells;
}

/* Short weekday names from Monday, in the user's language. */
export function weekdayNames(lang, style = 'short') {
  const monday = new Date(2024, 0, 1); // a Monday
  return Array.from({ length: 7 }, (_, i) => new Date(monday.getFullYear(), 0, 1 + i).toLocaleDateString(lang, { weekday: style }));
}
