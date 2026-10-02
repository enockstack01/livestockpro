import { isOverdueTask, todayIso } from './businessRules';
import { fmtDate } from './format';
import { formatRecordMoney } from './currency';

/* The dashboard's profile card and activity cards, computed once for both
   clients (web: client/src/components/dashboard/*, mobile:
   mobile/src/screens/dashboard/*) so they always show the same thing.
   Every item carries short structured fields (kind, name, days, value) so
   the cards can show icons, badges and charts instead of sentences; the
   older title/sub sentences stay for the notification bell. */

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

/* Alert kinds, most urgent first. color: red (danger) · orange (warning) ·
   blue/purple (info). label: dashboardFeed.alertKinds.<key>. */
export const ALERT_KINDS = [
  { key: 'taskOverdue', icon: 'clock', color: 'red' },
  { key: 'checkMissed', icon: 'calendar-xmark', color: 'red' },
  { key: 'critical', icon: 'triangle-exclamation', color: 'red' },
  { key: 'treatment', icon: 'stethoscope', color: 'orange' },
  { key: 'checkDue', icon: 'calendar-check', color: 'blue' },
  { key: 'birthSoon', icon: 'paw', color: 'purple' },
];
const KIND_ORDER = Object.fromEntries(ALERT_KINDS.map((k, i) => [k.key, i]));

/* days: whole days until the due date (negative = that many days late). */
export function computeAlerts({ tasks = [], animals = [], health = [], breeding = [] }, t) {
  const out = [];
  const add = (kind, id, name, days, title, sub, link) => {
    const k = ALERT_KINDS[KIND_ORDER[kind]];
    out.push({ id, kind, icon: k.icon, color: k.color, name, days, title, sub, link });
  };
  tasks.forEach((tk) => {
    if (isOverdueTask(tk)) add('taskOverdue', 'task-overdue-' + tk.id, tk.title, daysUntil(tk.due_date), t('layout.notifOverdueTitle', { title: tk.title }), t('layout.notifOverdueSub', { date: new Date(tk.due_date).toLocaleDateString() }), '/tasks');
  });
  animals.forEach((a) => {
    if (a.health_status === 'Critical') add('critical', 'animal-critical-' + a.id, a.tag_id, null, t('layout.notifCriticalTitle', { tag: a.tag_id }), t('layout.notifCriticalSub'), '/health');
  });
  animals.forEach((a) => {
    if (a.health_status === 'Under Treatment') add('treatment', 'animal-treatment-' + a.id, a.tag_id, null, t('layout.notifTreatmentTitle', { tag: a.tag_id }), t('layout.notifTreatmentSub'), '/health');
  });
  health.forEach((h) => {
    if (!h.next_check_date || h.status === 'Recovered') return;
    const d = daysUntil(h.next_check_date);
    if (d <= 3 && d >= 0) add('checkDue', 'health-due-' + h.id, h.tag_id || '—', d, t('layout.notifCheckupDueTitle', { tag: h.tag_id || '—' }), d === 0 ? t('layout.notifToday') : t('layout.notifInDaysWithNote', { count: d, note: h.disease || '' }), '/health');
    if (d < 0) add('checkMissed', 'health-missed-' + h.id, h.tag_id || '—', d, t('layout.notifMissedTitle', { tag: h.tag_id || '—' }), t('layout.notifMissedSub', { count: Math.abs(d) }), '/health');
  });
  breeding.forEach((b) => {
    if (!b.expected_birth_date || b.pregnancy_status !== 'Pregnant') return;
    const d = daysUntil(b.expected_birth_date);
    if (d <= 7 && d >= 0) add('birthSoon', 'breeding-birth-' + b.id, b.tag_id || '—', d, t('layout.notifBirthTitle', { tag: b.tag_id || '—' }), d === 0 ? t('layout.notifToday') : t('layout.notifBirthInDays', { count: d }), '/breeding');
  });
  // Most urgent kind first; within a kind, the longest overdue / soonest due first.
  return out.sort((a, b) => (KIND_ORDER[a.kind] - KIND_ORDER[b.kind]) || ((a.days ?? 0) - (b.days ?? 0)));
}

/* Count per alert kind (only kinds that occur), in urgency order. */
export function summarizeAlerts(alerts) {
  return ALERT_KINDS
    .map((k) => ({ ...k, count: alerts.filter((a) => a.kind === k.key).length }))
    .filter((k) => k.count > 0);
}

/* ---------- Recent activity (latest records across the farm) ---------- */

/* { items, weeks }: the latest `limit` events (name / sub / optional signed
   value) and how many records were logged in each of the last `weekCount`
   weeks, for the activity chart above the list. */
export function computeRecentActivity(data, t, { limit = 8, weekCount = 12, lang } = {}) {
  const e = (group, v) => (v ? t(`enums.${group}.${v}`, { defaultValue: v }) : '');
  const qty = (r) => (r.quantity ? `${r.quantity} ${r.unit || ''}`.trim() : '');
  const today = todayIso();
  const items = [];
  // Ordered by when the event happened on the farm (check date, birth,
  // sale…), not by when it was typed in; entry time breaks ties.
  const push = (table, r, icon, color, name, sub, date, value = '', valueTone = '') => {
    const when = String(date || r.created_at || '').slice(0, 10);
    if (!when || when > today) return; // future-dated entries belong in Upcoming Events
    items.push({ id: `${table}-${r.id}`, icon, color, name: name || '—', sub, value, valueTone, iso: when, date: fmtDate(date || r.created_at), sort: `${when}|${r.updated_at || r.created_at || ''}`, link: `/${table}` });
  };
  (data.animals || []).forEach((a) => push('animals', a, 'cow', 'green', a.tag_id || a.name, [t('dashboardFeed.actAnimal'), e('species', a.species)].filter(Boolean).join(' · '), a.created_at));
  (data.health || []).forEach((h) => push('health', h, 'stethoscope', h.status === 'Critical' ? 'red' : 'orange', h.tag_id, h.disease || h.treatment || t('dashboardFeed.actHealth'), h.check_date, e('healthRecordStatus', h.status), h.status === 'Critical' ? 'neg' : ''));
  (data.breeding || []).forEach((b) => push('breeding', b, b.birth_date ? 'baby' : 'venus-mars', 'purple', b.tag_id, b.birth_date ? t('dashboardFeed.actBirth') : t('dashboardFeed.actBreeding'), b.birth_date || b.breeding_date, b.birth_date && b.newborn_count ? `+${b.newborn_count}` : e('pregnancyStatus', b.pregnancy_status), b.birth_date ? 'pos' : ''));
  (data.feeding || []).forEach((f) => push('feeding', f, 'wheat-awn', 'orange', f.feed_type, [t('dashboardFeed.actFeeding'), qty(f)].filter(Boolean).join(' · '), f.feeding_date, f.cost ? `-${formatRecordMoney(f, 'cost', { decimals: 0 })}` : '', f.cost ? 'neg' : ''));
  (data.production || []).forEach((p) => push('production', p, 'gauge', 'blue', e('productionType', p.production_type), t('dashboardFeed.actProduction'), p.production_date, qty(p)));
  (data.finance || []).forEach((f) => push('finance', f, f.type === 'Income' ? 'arrow-trend-up' : 'arrow-trend-down', f.type === 'Income' ? 'green' : 'red', e('financeCategory', f.category) || e('financeType', f.type), e('financeType', f.type), f.date, `${f.type === 'Income' ? '+' : '-'}${formatRecordMoney(f, 'amount', { decimals: 0 })}`, f.type === 'Income' ? 'pos' : 'neg'));
  (data.tasks || []).filter((tk) => tk.status === 'Completed').forEach((tk) => push('tasks', tk, 'circle-check', 'green', tk.title, t('dashboardFeed.actTaskDone'), tk.due_date));

  // Weekly totals, oldest first, each week starting on a Monday.
  const start = new Date(today + 'T00:00:00');
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7) - (weekCount - 1) * 7);
  const weeks = Array.from({ length: weekCount }, (_, i) => {
    const from = new Date(start.getTime() + i * 7 * DAY_MS);
    return { from: from.toISOString().slice(0, 10), label: from.toLocaleDateString(lang, { month: 'short', day: 'numeric' }), count: 0 };
  });
  items.forEach((it) => {
    for (let i = weeks.length - 1; i >= 0; i--) {
      if (it.iso >= weeks[i].from) { weeks[i].count++; break; }
    }
  });

  return { items: items.sort((a, b) => String(b.sort).localeCompare(String(a.sort))).slice(0, limit), weeks };
}

/* "Today", "Yesterday", "3d", "5w" — compact relative time for list rows. */
export function relativeDay(iso, t) {
  if (!iso) return '';
  const days = Math.round((new Date(todayIso() + 'T00:00:00') - new Date(String(iso).slice(0, 10) + 'T00:00:00')) / DAY_MS);
  if (days <= 0) return t('dashboardFeed.today');
  if (days === 1) return t('dashboardFeed.yesterday');
  if (days < 14) return t('dashboardFeed.daysAgo', { count: days });
  if (days < 90) return t('dashboardFeed.weeksAgo', { count: Math.round(days / 7) });
  return fmtDate(iso);
}

/* ---------- Upcoming events (next 30 days) ---------- */

export const UPCOMING_KINDS = {
  task: { icon: 'list-check', color: 'blue', labelKey: 'nav.tasks' },
  birth: { icon: 'baby', color: 'purple', labelKey: 'dashboardFeed.actBirth' },
  check: { icon: 'stethoscope', color: 'orange', labelKey: 'dashboardFeed.actHealth' },
};
export const UPCOMING_WINDOW_DAYS = 30;

export function computeUpcoming({ tasks = [], breeding = [], health = [] }, t, lang, limit = 12) {
  const today = todayIso();
  const until = new Date(Date.now() + UPCOMING_WINDOW_DAYS * DAY_MS).toISOString().slice(0, 10);
  const within = (d) => d && d >= today && d <= until;
  const items = [];
  tasks.filter((tk) => tk.status !== 'Completed' && within(tk.due_date)).forEach((tk) => items.push({ id: 'task-' + tk.id, kind: 'task', name: tk.title, date: tk.due_date, title: t('dashboardFeed.evTask', { title: tk.title }), meta: t(`enums.taskPriority.${tk.priority || 'Medium'}`), link: '/tasks' }));
  breeding.filter((b) => !b.birth_date && b.pregnancy_status === 'Pregnant' && within(b.expected_birth_date)).forEach((b) => items.push({ id: 'birth-' + b.id, kind: 'birth', name: b.tag_id || '—', date: b.expected_birth_date, title: t('dashboardFeed.evBirth', { tag: b.tag_id || '—' }), meta: t('nav.breeding'), link: '/breeding' }));
  health.filter((h) => h.status !== 'Recovered' && within(h.next_check_date)).forEach((h) => items.push({ id: 'check-' + h.id, kind: 'check', name: h.tag_id || '—', date: h.next_check_date, title: t('dashboardFeed.evCheck', { tag: h.tag_id || '—' }), meta: h.disease || t('nav.health'), link: '/health' }));
  const base = new Date(today + 'T00:00:00');
  return items
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, limit)
    .map((it) => {
      const d = new Date(it.date + 'T00:00:00');
      return { ...it, ...UPCOMING_KINDS[it.kind], daysLeft: Math.round((d - base) / DAY_MS), day: d.getDate(), month: d.toLocaleString(lang, { month: 'short' }), weekday: d.toLocaleString(lang, { weekday: 'short' }) };
    });
}

/* ---------- Quick actions (open a page with its Add form) ---------- */
/* label: the page name (nav.*); tone: the chip color, one per area. */
export const QUICK_ACTIONS = [
  { key: 'animal', icon: 'cow', path: '/animals', labelKey: 'nav.animals', fullKey: 'dashboardFeed.qaAnimal', tone: 'green' },
  { key: 'health', icon: 'stethoscope', path: '/health', labelKey: 'nav.health', fullKey: 'dashboardFeed.qaHealth', tone: 'orange' },
  { key: 'breeding', icon: 'venus-mars', path: '/breeding', labelKey: 'nav.breeding', fullKey: 'dashboardFeed.qaBreeding', tone: 'purple' },
  { key: 'feeding', icon: 'wheat-awn', path: '/feeding', labelKey: 'nav.feeding', fullKey: 'dashboardFeed.qaFeeding', tone: 'orange' },
  { key: 'production', icon: 'gauge', path: '/production', labelKey: 'nav.production', fullKey: 'dashboardFeed.qaProduction', tone: 'blue' },
  { key: 'finance', icon: 'coins', path: '/finance', labelKey: 'nav.finance', fullKey: 'dashboardFeed.qaFinance', tone: 'green' },
  { key: 'task', icon: 'list-check', path: '/tasks', labelKey: 'nav.tasks', fullKey: 'dashboardFeed.qaTask', tone: 'blue' },
  { key: 'reports', icon: 'chart-bar', path: '/reports', labelKey: 'nav.reports', fullKey: 'dashboardFeed.qaReports', tone: 'purple', noAdd: true },
];
