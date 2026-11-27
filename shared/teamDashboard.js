/* Figures for the data collector dashboard, shared by the web and mobile
   apps. A collector's entries are the records they recorded themselves:
   `by(row)` says who recorded a row (recorded_by in both apps; mobile keeps
   a temporary user_id fallback for older local rows during the auth transition). */

export const COLLECTOR_KINDS = [
  { key: 'animals', kind: 'animal', icon: 'cow', path: '/animals', labelKey: 'nav.animals', tone: 'green' },
  { key: 'health', kind: 'health', icon: 'stethoscope', path: '/health', labelKey: 'nav.health', tone: 'orange' },
  { key: 'breeding', kind: 'breeding', icon: 'venus-mars', path: '/breeding', labelKey: 'nav.breeding', tone: 'purple' },
  { key: 'feeding', kind: 'feeding', icon: 'wheat-awn', path: '/feeding', labelKey: 'nav.feeding', tone: 'orange' },
  { key: 'production', kind: 'production', icon: 'gauge', path: '/production', labelKey: 'nav.production', tone: 'blue' },
  { key: 'tasks', kind: 'task', icon: 'list-check', path: '/tasks', labelKey: 'nav.tasks', tone: 'blue' }
];

const pad = (n) => String(n).padStart(2, '0');
export const localDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const labelOf = (r) => r.tag_id || r.name || r.title || r.disease || r.feed_type || r.production_type || '';

/* `days` is the number of days charted, ending today. */
export function computeCollectorStats(data, myId, { by = (r) => r.recorded_by, days = 7, recentLimit = 8 } = {}) {
  const today = localDay(new Date());
  const perDay = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    perDay.push({ date: localDay(d), weekday: d.getDay(), count: 0 });
  }
  const index = new Map(perDay.map((p, i) => [p.date, i]));
  const byKind = {};
  const mine = [];
  COLLECTOR_KINDS.forEach((k) => {
    (data[k.key] || []).forEach((r) => {
      if (!r.created_at || by(r) !== myId) return;
      const day = localDay(new Date(r.created_at));
      const slot = index.get(day);
      if (slot === undefined) return;
      perDay[slot].count += 1;
      if (day === today) byKind[k.kind] = (byKind[k.kind] || 0) + 1;
      mine.push({ id: `${k.key}-${r.id}`, kind: k.kind, icon: k.icon, tone: k.tone, labelKey: k.labelKey, path: k.path, name: labelOf(r), iso: r.created_at });
    });
  });
  mine.sort((a, b) => (a.iso < b.iso ? 1 : -1));
  const todayCount = perDay[perDay.length - 1].count;
  const week = perDay.reduce((s, p) => s + p.count, 0);
  /* Days in a row, up to today, with at least one entry (today not yet
     recorded does not break yesterday's run). */
  let streak = 0;
  for (let i = perDay.length - 1; i >= 0; i--) {
    if (perDay[i].count > 0) streak++;
    else if (i === perDay.length - 1) continue;
    else break;
  }
  return { today: todayCount, week, perDay, byKind, streak, recent: mine.slice(0, recentLimit) };
}

/* Tasks still to do, soonest due first. */
export function openTasks(tasks, limit = 5) {
  return (tasks || [])
    .filter((t) => t.status !== 'Completed')
    .sort((a, b) => String(a.due_date || '9999').localeCompare(String(b.due_date || '9999')))
    .slice(0, limit);
}

/* Animals the collector should look at first: critical, then those under treatment. */
export function animalsToCheck(animals, limit = 5) {
  const rank = { Critical: 0, 'Under Treatment': 1 };
  return (animals || [])
    .filter((a) => rank[a.health_status] !== undefined)
    .sort((a, b) => rank[a.health_status] - rank[b.health_status])
    .slice(0, limit);
}
