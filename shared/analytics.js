import { isOverdueTask, todayIso } from './businessRules';
import { fmtMoney } from './chartPalette';
import { formatMoney } from './currency';

/* Farm Analytics & Insights — the numbers behind the dashboard's analytics
   section, shared by the web app (client/src/components/FarmAnalytics.jsx)
   and the mobile app (mobile/src/screens/FarmAnalytics.js) so both show
   exactly the same figures. Pure: takes the farm's record lists and returns
   chart series plus plain-language insight descriptors; each client only
   renders them. */

const DAY_MS = 86400000;
export const PRODUCTION_TYPES = ['Milk', 'Eggs', 'Meat'];
export const PREGNANCY_ORDER = ['Pregnant', 'Not Confirmed', 'Not Pregnant', 'Delivered'];
export const PRIORITY_ORDER = ['High', 'Medium', 'Low'];
export const AGE_BANDS = [
  { key: 'age0_6', max: 6 }, { key: 'age6_12', max: 12 }, { key: 'age1_2', max: 24 }, { key: 'age2_5', max: 60 }, { key: 'age5p', max: Infinity }
];
export const OUTCOME_GROUPS = [
  { key: 'recovered', statuses: ['Recovered', 'Healthy'], statusTone: 'good' },
  { key: 'treatment', statuses: ['Under Treatment'], statusTone: 'warning' },
  { key: 'critical', statuses: ['Critical'], statusTone: 'critical' },
  { key: 'deceased', statuses: ['Deceased'], statusTone: 'neutral' }
];
const VET_CATEGORIES = new Set(['Veterinary', 'Medicine']);

export const ym = (s) => (s ? String(s).slice(0, 7) : '');
const isoDaysFromNow = (n) => new Date(Date.now() + n * DAY_MS).toISOString().slice(0, 10);
const pct = (part, whole) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

/* `past` months ending with the current one, then `future` months after it. */
export function monthBuckets(past, lang, future = 0) {
  const now = new Date();
  const out = [];
  for (let i = past - 1; i >= -future; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: d.toLocaleString(lang, { month: 'short', year: '2-digit' }) });
  }
  return out;
}

function tally(list, keyFn, valueFn = () => 1) {
  const m = new Map();
  list.forEach((x) => {
    const k = keyFn(x);
    if (k === null || k === undefined || k === '') return;
    m.set(k, (m.get(k) || 0) + (Number(valueFn(x)) || 0));
  });
  return m;
}

const sortedEntries = (m, limit) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);

/* Most frequent value of `field` among `list` — used to pick one unit per
   production type, so litres, eggs and kilograms are never summed together. */
function dominant(list, field) {
  const top = sortedEntries(tally(list, (x) => x[field]), 1)[0];
  return top ? top[0] : null;
}

/* data: { animals, health, feeding, breeding, production, finance, tasks }
   opts.enumLabel(group, value): localized label for an enum value (used for
   the few insight sentences that embed one). */
export function computeFarmAnalytics(data, { months = 12, lang = 'en', enumLabel = (g, v) => v } = {}) {
  const { animals = [], health = [], feeding = [], breeding = [], production = [], finance = [], tasks = [] } = data;
  const buckets = monthBuckets(months, lang);
  const rangeStart = buckets[0].key;
  const inRange = (dateStr) => ym(dateStr) >= rangeStart;
  const labels = buckets.map((b) => b.label);

  const living = animals.filter((a) => a.health_status !== 'Deceased');

  /* ---------- Herd ---------- */
  const species = sortedEntries(tally(living, (a) => a.species || 'Other'));
  const sexSpecies = species.map(([s]) => s);
  const sexCounts = (sex) => sexSpecies.map((s) => living.filter((a) => (a.species || 'Other') === s && a.sex === sex).length);

  const ageCounts = AGE_BANDS.map(() => 0);
  let ageUnknown = 0;
  living.forEach((a) => {
    const dob = a.date_of_birth ? new Date(a.date_of_birth) : null;
    if (!dob || Number.isNaN(dob.getTime())) { ageUnknown++; return; }
    const ageMonths = (Date.now() - dob.getTime()) / (30.44 * DAY_MS);
    ageCounts[AGE_BANDS.findIndex((b) => ageMonths < b.max)]++;
  });

  const growth = buckets.map((b) => animals.filter((a) => ym(a.created_at) && ym(a.created_at) <= b.key).length);

  /* ---------- Health ---------- */
  const healthInRange = health.filter((h) => inRange(h.check_date));
  const outcomeSeries = OUTCOME_GROUPS.map((g) => buckets.map((b) => healthInRange.filter((h) => ym(h.check_date) === b.key && g.statuses.includes(h.status)).length));

  /* Case-insensitive grouping, displayed with the capitalized spelling when
     the same condition was typed both ways. */
  const conditionNames = new Map();
  const conditionKey = (h) => {
    const name = (h.disease || '').trim();
    if (!name) return null;
    const key = name.toLowerCase();
    const seen = conditionNames.get(key);
    if (!seen || (seen === seen.toLowerCase() && name !== name.toLowerCase())) conditionNames.set(key, name);
    return key;
  };
  const conditions = sortedEntries(tally(healthInRange, conditionKey), 8).map(([k, v]) => [conditionNames.get(k), v]);

  /* ---------- Production & feeding ---------- */
  const productionInRange = production.filter((p) => inRange(p.production_date));
  const productionPanels = PRODUCTION_TYPES.map((type, i) => {
    const ofType = productionInRange.filter((p) => p.production_type === type);
    const unit = dominant(ofType, 'unit');
    const rows = ofType.filter((p) => p.unit === unit);
    const series = buckets.map((b) => rows.filter((p) => ym(p.production_date) === b.key).reduce((s, p) => s + (Number(p.quantity) || 0), 0));
    return { type, unit, series, total: series.reduce((s, v) => s + v, 0), slot: i };
  }).filter((p) => p.total > 0);

  const feedingInRange = feeding.filter((f) => inRange(f.feeding_date));
  const feedCost = buckets.map((b) => feedingInRange.filter((f) => ym(f.feeding_date) === b.key).reduce((s, f) => s + (Number(f.cost) || 0), 0));
  const feedByType = sortedEntries(tally(feedingInRange, (f) => (f.feed_type || '').trim(), (f) => f.cost), 8);

  /* ---------- Finance ---------- */
  const financeInRange = finance.filter((f) => inRange(f.date));
  const monthNet = buckets.map((b) => financeInRange.filter((f) => ym(f.date) === b.key).reduce((s, f) => s + (f.type === 'Income' ? 1 : -1) * (Number(f.amount) || 0), 0));
  const expenseByCat = sortedEntries(tally(financeInRange.filter((f) => f.type === 'Expense'), (f) => f.category || 'Other Expense', (f) => f.amount));
  const incomeBySrc = sortedEntries(tally(financeInRange.filter((f) => f.type === 'Income'), (f) => f.category || 'Other Income', (f) => f.amount));

  /* ---------- Breeding ---------- */
  const pregnancy = PREGNANCY_ORDER.map((s) => breeding.filter((b) => b.pregnancy_status === s).length);
  const birthBuckets = monthBuckets(months, lang, 6);
  const birthLabels = birthBuckets.map((b) => b.label);
  const newbornSeries = birthBuckets.map((b) => breeding.filter((r) => r.birth_date && ym(r.birth_date) === b.key).reduce((s, r) => s + (Number(r.newborn_count) || 0), 0));
  const expectedSeries = birthBuckets.map((b) => breeding.filter((r) => !r.birth_date && r.pregnancy_status === 'Pregnant' && ym(r.expected_birth_date) === b.key).length);

  /* ---------- Tasks ---------- */
  const openTasks = tasks.filter((tk) => tk.status !== 'Completed');
  const overdueByPriority = PRIORITY_ORDER.map((p) => openTasks.filter((tk) => (tk.priority || 'Medium') === p && isOverdueTask(tk)).length);
  const onTimeByPriority = PRIORITY_ORDER.map((p) => openTasks.filter((tk) => (tk.priority || 'Medium') === p && !isOverdueTask(tk)).length);

  const insights = computeInsights({ enumLabel, animals, living, health, breeding, production, feedingInRange, financeInRange, tasks, conditionNames, rangeStart });

  return {
    labels, living,
    species, sexSpecies, females: sexCounts('Female'), males: sexCounts('Male'), ageCounts, ageUnknown, growth,
    healthInRangeCount: healthInRange.length, outcomeSeries, conditions,
    productionPanels, feedCost, feedByType,
    financeInRangeCount: financeInRange.length, monthNet, expenseByCat, incomeBySrc,
    pregnancy, birthLabels, newbornSeries, expectedSeries,
    openTasksCount: openTasks.length, overdueByPriority, onTimeByPriority,
    insights
  };
}

/* Plain-language findings, as { id, tone, key, vars } — render with
   t(`analytics.insight.${key}`, vars). Each only appears when the farm has
   the data behind it; tone (good/warn/bad/info) drives icon + accent. */
function computeInsights({ enumLabel, animals, living, health, breeding, production, feedingInRange, financeInRange, tasks, conditionNames, rangeStart }) {
  const out = [];
  const today = todayIso();
  const add = (id, tone, key, vars) => out.push({ id, tone, key, vars });

  if (living.length) {
    const healthy = living.filter((a) => a.health_status === 'Healthy').length;
    const p = pct(healthy, living.length);
    add('herdHealth', p >= 80 ? 'good' : p >= 60 ? 'warn' : 'bad', 'herdHealth', { pct: p, total: living.length });
  }

  const deceased = animals.length - living.length;
  if (deceased > 0) {
    const p = pct(deceased, animals.length);
    add('mortality', p > 5 ? 'bad' : 'warn', 'mortality', { count: deceased, pct: p });
  }

  const recovered = health.filter((h) => h.status === 'Recovered').length;
  const died = health.filter((h) => h.status === 'Deceased').length;
  if (recovered + died > 0) {
    const p = pct(recovered, recovered + died);
    add('recovery', p >= 80 ? 'good' : p >= 50 ? 'warn' : 'bad', 'recovery', { pct: p, recovered, died });
  }

  const since90 = isoDaysFromNow(-90);
  const recent = sortedEntries(tally(health.filter((h) => (h.check_date || '') >= since90), (h) => (h.disease || '').trim().toLowerCase() || null), 1)[0];
  if (recent && recent[1] >= 2) add('topCondition', 'warn', 'topCondition', { disease: conditionNames.get(recent[0]) || recent[0], count: recent[1] });

  const overdueFollowUps = health.filter((h) => h.next_check_date && h.next_check_date < today && (h.status === 'Under Treatment' || h.status === 'Critical')).length;
  if (overdueFollowUps > 0) add('overdueFollowUps', 'bad', 'overdueFollowUps', { count: overdueFollowUps });

  const notChecked = living.filter((a) => !a.last_check_date || a.last_check_date < since90).length;
  if (living.length && notChecked > 0) add('notChecked', 'warn', 'notChecked', { count: notChecked });

  /* Rolling 30-day windows, so a half-finished calendar month never reads as
     a drop; needs a few records in both windows to mean anything. */
  const since30 = isoDaysFromNow(-30);
  const since60 = isoDaysFromNow(-60);
  PRODUCTION_TYPES.forEach((type) => {
    const ofType = production.filter((p) => p.production_type === type);
    const unit = dominant(ofType, 'unit');
    const window = (from, to) => ofType.filter((p) => p.unit === unit && p.production_date >= from && p.production_date < to);
    const total = (rows) => rows.reduce((s, p) => s + (Number(p.quantity) || 0), 0);
    const curRows = window(since30, '9999');
    const prevRows = window(since60, since30);
    const cur = total(curRows);
    const prev = total(prevRows);
    if (curRows.length >= 3 && prevRows.length >= 3 && prev > 0 && cur !== prev) {
      const change = Math.round(((cur - prev) / prev) * 100);
      add(`prod-${type}`, change >= 0 ? 'good' : 'warn', change >= 0 ? 'productionUp' : 'productionDown', { type: enumLabel('productionType', type), pct: Math.abs(change) });
    }
  });

  const feedSpend = feedingInRange.reduce((s, f) => s + (Number(f.cost) || 0), 0);
  const litres = production
    .filter((p) => p.production_type === 'Milk' && p.unit === 'liters' && ym(p.production_date) >= rangeStart)
    .reduce((s, p) => s + (Number(p.quantity) || 0), 0);
  if (feedSpend > 0 && litres > 0) add('feedPerLiter', 'info', 'feedPerLiter', { value: formatMoney(feedSpend / litres, { decimals: 2 }) });

  const income = financeInRange.filter((f) => f.type === 'Income').reduce((s, f) => s + (Number(f.amount) || 0), 0);
  const expense = financeInRange.filter((f) => f.type === 'Expense').reduce((s, f) => s + (Number(f.amount) || 0), 0);
  if (income > 0) {
    const margin = Math.round(((income - expense) / income) * 100);
    add('profitMargin', margin >= 0 ? 'good' : 'bad', 'profitMargin', { pct: margin, net: fmtMoney(income - expense) });
  }
  const topExpense = sortedEntries(tally(financeInRange.filter((f) => f.type === 'Expense'), (f) => f.category || 'Other Expense', (f) => f.amount), 1)[0];
  if (topExpense && expense > 0) add('topExpense', 'info', 'topExpense', { category: enumLabel('financeCategory', topExpense[0]), pct: pct(topExpense[1], expense) });

  if (living.length) {
    const vet = financeInRange.filter((f) => f.type === 'Expense' && VET_CATEGORIES.has(f.category)).reduce((s, f) => s + (Number(f.amount) || 0), 0);
    if (vet > 0) add('vetPerAnimal', 'info', 'vetPerAnimal', { value: fmtMoney(vet / living.length) });
    if (income > 0) add('revenuePerAnimal', 'info', 'revenuePerAnimal', { value: fmtMoney(income / living.length) });
  }

  const in30 = isoDaysFromNow(30);
  const upcoming = breeding.filter((b) => !b.birth_date && b.pregnancy_status === 'Pregnant' && b.expected_birth_date && b.expected_birth_date >= today && b.expected_birth_date <= in30).length;
  if (upcoming > 0) add('upcomingBirths', 'info', 'upcomingBirths', { count: upcoming });

  const females = living.filter((a) => a.sex === 'Female').length;
  const males = living.filter((a) => a.sex === 'Male').length;
  if (females > 0 && males > 0) add('sexRatio', 'info', 'sexRatio', { ratio: (females / males).toFixed(1) });

  if (tasks.length) {
    const done = tasks.filter((tk) => tk.status === 'Completed').length;
    const overdue = tasks.filter(isOverdueTask).length;
    add('taskCompletion', overdue > 0 ? 'warn' : 'good', 'taskCompletion', { pct: pct(done, tasks.length), overdue });
  }

  return out;
}

/* Headline numbers for the dashboard's summary cards — same on both clients. */
export function computeDashboardSummary({ animals = [], breeding = [], finance = [], tasks = [] }) {
  const isThisMonth = (d) => ym(d) === ym(todayIso());
  const monthIncome = finance.filter((x) => x.type === 'Income' && isThisMonth(x.date)).reduce((s, x) => s + (Number(x.amount) || 0), 0);
  const monthExpense = finance.filter((x) => x.type === 'Expense' && isThisMonth(x.date)).reduce((s, x) => s + (Number(x.amount) || 0), 0);
  return {
    totalAnimals: animals.length,
    healthy: animals.filter((x) => x.health_status === 'Healthy').length,
    underTreatment: animals.filter((x) => x.health_status === 'Under Treatment').length,
    critical: animals.filter((x) => x.health_status === 'Critical').length,
    pregnant: breeding.filter((x) => x.pregnancy_status === 'Pregnant').length,
    newborns: breeding.filter((x) => x.birth_date).reduce((s, x) => s + (Number(x.newborn_count) || 0), 0),
    pendingTasks: tasks.filter((x) => x.status === 'Pending').length,
    overdueTasks: tasks.filter(isOverdueTask).length,
    monthIncome,
    monthExpense,
    profitLoss: monthIncome - monthExpense
  };
}
