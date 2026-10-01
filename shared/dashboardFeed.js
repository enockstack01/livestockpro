import { isOverdueTask, todayIso } from './businessRules';
import { fmtDate } from './format';
import { fmtMoney } from './chartPalette';

/* The dashboard's profile card and activity cards, computed once for both
   clients (web: client/src/components/dashboard/*, mobile:
   mobile/src/screens/dashboard/*) so they always show the same thing.
   Layout follows the CropManager dashboard: a profile card first, then
   Recent Activity, Upcoming Events, Alerts and Quick Actions. */

const DAY_MS = 86400000;
const daysUntil = (d) => Math.ceil((new Date(d) - new Date()) / DAY_MS);

/* ---------- Herd Profile ---------- */

/* Status colors for the health ring (match the status badges). */
export const HERD_STATUS = [
  { key: 'Healthy', color: '#2E7D32' },
  { key: 'Under Treatment', color: '#F9A825' },
  { key: 'Critical', color: '#D32F2F' },
];

/* Living herd (optionally one species): health ring segments, % healthy,
   and the herd split by species — or by breed once a species is chosen. */
export function computeHerdProfile(animals = [], species = '') {
  const all = animals.filter((a) => !species || (a.species || 'Other') === species);
  const living = all.filter((a) => a.health_status !== 'Deceased');
  const segments = HERD_STATUS.map((s) => ({
    ...s,
    value: living.filter((a) => (a.health_status || 'Healthy') === s.key).length,
  }));
  const healthy = segments[0].value;

  const groupKey = species ? (a) => (a.breed || '').trim() || '—' : (a) => a.species || 'Other';
  const groups = new Map();
  living.forEach((a) => {
    const k = groupKey(a);
    const g = groups.get(k) || { name: k, count: 0, healthy: 0, female: 0 };
    g.count++;
    if ((a.health_status || 'Healthy') === 'Healthy') g.healthy++;
    if (a.sex === 'Female') g.female++;
    groups.set(k, g);
  });
  const byGroup = [...groups.values()].sort((a, b) => b.count - a.count);

  return {
    living: living.length,
    deceased: all.length - living.length,
    segments,
    healthyPct: living.length ? Math.round((healthy / living.length) * 100) : 0,
    groupBy: species ? 'breed' : 'species',
    byGroup,
    maxGroup: Math.max(1, ...byGroup.map((g) => g.count)),
    speciesList: [...new Set(animals.map((a) => a.species || 'Other'))].sort(),
  };
}

/* ---------- Alerts (same rules as the topbar notifications bell) ---------- */

const NOTIF_ORDER = { red: 0, orange: 1, blue: 2, purple: 3, green: 4 };

/* color: red (danger) · orange (warning) · blue/purple (info). */
export function computeAlerts({ tasks = [], animals = [], health = [], breeding = [] }, t) {
  const out = [];
  tasks.forEach((tk) => {
    if (isOverdueTask(tk)) out.push({ id: 'task-overdue-' + tk.id, icon: 'clock', color: 'red', title: t('layout.notifOverdueTitle', { title: tk.title }), sub: t('layout.notifOverdueSub', { date: new Date(tk.due_date).toLocaleDateString() }), link: '/tasks' });
  });
  animals.forEach((a) => {
    if (a.health_status === 'Critical') out.push({ id: 'animal-critical-' + a.id, icon: 'triangle-exclamation', color: 'red', title: t('layout.notifCriticalTitle', { tag: a.tag_id }), sub: t('layout.notifCriticalSub'), link: '/health' });
  });
  animals.forEach((a) => {
    if (a.health_status === 'Under Treatment') out.push({ id: 'animal-treatment-' + a.id, icon: 'stethoscope', color: 'orange', title: t('layout.notifTreatmentTitle', { tag: a.tag_id }), sub: t('layout.notifTreatmentSub'), link: '/health' });
  });
  health.forEach((h) => {
    if (!h.next_check_date || h.status === 'Recovered') return;
    const d = daysUntil(h.next_check_date);
    if (d <= 3 && d >= 0) out.push({ id: 'health-due-' + h.id, icon: 'calendar-check', color: 'blue', title: t('layout.notifCheckupDueTitle', { tag: h.tag_id || '—' }), sub: d === 0 ? t('layout.notifToday') : t('layout.notifInDaysWithNote', { count: d, note: h.disease || '' }), link: '/health' });
    if (d < 0) out.push({ id: 'health-missed-' + h.id, icon: 'calendar-xmark', color: 'red', title: t('layout.notifMissedTitle', { tag: h.tag_id || '—' }), sub: t('layout.notifMissedSub', { count: Math.abs(d) }), link: '/health' });
  });
  breeding.forEach((b) => {
    if (!b.expected_birth_date || b.pregnancy_status !== 'Pregnant') return;
    const d = daysUntil(b.expected_birth_date);
    if (d <= 7 && d >= 0) out.push({ id: 'breeding-birth-' + b.id, icon: 'paw', color: 'purple', title: t('layout.notifBirthTitle', { tag: b.tag_id || '—' }), sub: d === 0 ? t('layout.notifToday') : t('layout.notifBirthInDays', { count: d }), link: '/breeding' });
  });
  return out.sort((a, b) => (NOTIF_ORDER[a.color] ?? 5) - (NOTIF_ORDER[b.color] ?? 5));
}

/* ---------- Recent activity (latest records across the farm) ---------- */

export function computeRecentActivity(data, t, limit = 8) {
  const e = (group, v) => (v ? t(`enums.${group}.${v}`, { defaultValue: v }) : '');
  const items = [];
  // Ordered by when the event happened on the farm (check date, birth,
  // sale…), not by when it was typed in; entry time breaks ties.
  const push = (table, r, icon, color, title, text, date) => {
    const when = String(date || r.created_at || '').slice(0, 10);
    if (when > todayIso()) return; // future-dated entries belong in Upcoming Events
    items.push({ id: `${table}-${r.id}`, icon, color, title, text, date: fmtDate(date || r.created_at), sort: `${when}|${r.updated_at || r.created_at || ''}`, link: `/${table}` });
  };
  (data.animals || []).forEach((a) => push('animals', a, 'cow', 'green', t('dashboardFeed.actAnimal'), [a.tag_id, a.name, e('species', a.species)].filter(Boolean).join(' · '), a.created_at));
  (data.health || []).forEach((h) => push('health', h, 'stethoscope', h.status === 'Critical' ? 'red' : 'orange', t('dashboardFeed.actHealth'), [h.tag_id, h.disease || h.treatment].filter(Boolean).join(' — '), h.check_date));
  (data.breeding || []).forEach((b) => push('breeding', b, 'venus-mars', 'purple', b.birth_date ? t('dashboardFeed.actBirth') : t('dashboardFeed.actBreeding'), [b.tag_id, e('pregnancyStatus', b.pregnancy_status)].filter(Boolean).join(' · '), b.birth_date || b.breeding_date));
  (data.feeding || []).forEach((f) => push('feeding', f, 'wheat-awn', 'orange', t('dashboardFeed.actFeeding'), [f.feed_type, f.quantity ? `${f.quantity} ${f.unit || ''}`.trim() : null].filter(Boolean).join(' · '), f.feeding_date));
  (data.production || []).forEach((p) => push('production', p, 'gauge', 'blue', t('dashboardFeed.actProduction'), [e('productionType', p.production_type), p.quantity ? `${p.quantity} ${p.unit || ''}`.trim() : null].filter(Boolean).join(' · '), p.production_date));
  (data.finance || []).forEach((f) => push('finance', f, f.type === 'Income' ? 'arrow-trend-up' : 'arrow-trend-down', f.type === 'Income' ? 'green' : 'red', e('financeType', f.type), [e('financeCategory', f.category), fmtMoney(f.amount)].filter(Boolean).join(' · '), f.date));
  (data.tasks || []).filter((tk) => tk.status === 'Completed').forEach((tk) => push('tasks', tk, 'circle-check', 'green', t('dashboardFeed.actTaskDone'), tk.title, tk.due_date));
  return items.sort((a, b) => String(b.sort).localeCompare(String(a.sort))).slice(0, limit);
}

/* ---------- Upcoming events (next 30 days) ---------- */

export function computeUpcoming({ tasks = [], breeding = [], health = [] }, t, lang, limit = 6) {
  const today = todayIso();
  const until = new Date(Date.now() + 30 * DAY_MS).toISOString().slice(0, 10);
  const within = (d) => d && d >= today && d <= until;
  const items = [];
  tasks.filter((tk) => tk.status !== 'Completed' && within(tk.due_date)).forEach((tk) => items.push({ id: 'task-' + tk.id, date: tk.due_date, title: t('dashboardFeed.evTask', { title: tk.title }), meta: t(`enums.taskPriority.${tk.priority || 'Medium'}`), link: '/tasks' }));
  breeding.filter((b) => !b.birth_date && b.pregnancy_status === 'Pregnant' && within(b.expected_birth_date)).forEach((b) => items.push({ id: 'birth-' + b.id, date: b.expected_birth_date, title: t('dashboardFeed.evBirth', { tag: b.tag_id || '—' }), meta: t('nav.breeding'), link: '/breeding' }));
  health.filter((h) => h.status !== 'Recovered' && within(h.next_check_date)).forEach((h) => items.push({ id: 'check-' + h.id, date: h.next_check_date, title: t('dashboardFeed.evCheck', { tag: h.tag_id || '—' }), meta: h.disease || t('nav.health'), link: '/health' }));
  return items
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, limit)
    .map((it) => {
      const d = new Date(it.date + 'T00:00:00');
      return { ...it, day: d.getDate(), month: d.toLocaleString(lang, { month: 'short' }) };
    });
}

/* ---------- Quick actions (open a page with its Add form) ---------- */
export const QUICK_ACTIONS = [
  { key: 'animal', icon: 'cow', path: '/animals', labelKey: 'dashboardFeed.qaAnimal' },
  { key: 'health', icon: 'stethoscope', path: '/health', labelKey: 'dashboardFeed.qaHealth' },
  { key: 'breeding', icon: 'venus-mars', path: '/breeding', labelKey: 'dashboardFeed.qaBreeding' },
  { key: 'feeding', icon: 'wheat-awn', path: '/feeding', labelKey: 'dashboardFeed.qaFeeding' },
  { key: 'production', icon: 'gauge', path: '/production', labelKey: 'dashboardFeed.qaProduction' },
  { key: 'finance', icon: 'coins', path: '/finance', labelKey: 'dashboardFeed.qaFinance' },
  { key: 'task', icon: 'list-check', path: '/tasks', labelKey: 'dashboardFeed.qaTask' },
  { key: 'reports', icon: 'chart-bar', path: '/reports', labelKey: 'dashboardFeed.qaReports', noAdd: true },
];
