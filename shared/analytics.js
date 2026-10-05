import { isOverdueTask, todayIso } from './businessRules';
import { fmtMoney } from './chartPalette';
import { formatMoney, moneyOf } from './currency';

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
  const feedCost = buckets.map((b) => feedingInRange.filter((f) => ym(f.feeding_date) === b.key).reduce((s, f) => s + moneyOf(f, 'cost'), 0));
  const feedByType = sortedEntries(tally(feedingInRange, (f) => (f.feed_type || '').trim(), (f) => moneyOf(f, 'cost')), 8);

  /* ---------- Finance ---------- */
  const financeInRange = finance.filter((f) => inRange(f.date));
  const monthIncome = buckets.map((b) => financeInRange.filter((f) => f.type === 'Income' && ym(f.date) === b.key).reduce((s, f) => s + moneyOf(f), 0));
  const monthExpense = buckets.map((b) => financeInRange.filter((f) => f.type === 'Expense' && ym(f.date) === b.key).reduce((s, f) => s + moneyOf(f), 0));
  const monthNet = buckets.map((b) => financeInRange.filter((f) => ym(f.date) === b.key).reduce((s, f) => s + (f.type === 'Income' ? 1 : -1) * moneyOf(f), 0));
  const expenseByCat = sortedEntries(tally(financeInRange.filter((f) => f.type === 'Expense'), (f) => f.category || 'Other Expense', (f) => moneyOf(f)));
  const incomeBySrc = sortedEntries(tally(financeInRange.filter((f) => f.type === 'Income'), (f) => f.category || 'Other Income', (f) => moneyOf(f)));

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

  const insights = computeInsights({ enumLabel, animals, living, health, breeding, production, feeding, finance, feedingInRange, financeInRange, tasks, conditionNames, rangeStart, lang });

  return {
    labels, living,
    species, sexSpecies, females: sexCounts('Female'), males: sexCounts('Male'), ageCounts, ageUnknown, growth,
    healthInRangeCount: healthInRange.length, outcomeSeries, conditions,
    productionPanels, feedCost, feedByType,
    financeInRangeCount: financeInRange.length, monthIncome, monthExpense, monthNet, expenseByCat, incomeBySrc,
    outcomeTotals: outcomeSeries.map((series) => series.reduce((s, v) => s + v, 0)),
    taskStatus: ['Pending', 'In Progress', 'Completed'].map((st) => tasks.filter((tk) => tk.status === st).length),
    pregnancy, birthLabels, newbornSeries, expectedSeries,
    openTasksCount: openTasks.length, overdueByPriority, onTimeByPriority,
    insights
  };
}

/* Findings, as { id, tone, key, vars, viz }. The dashboard draws each one
   from viz — a figure, a short label (analytics.insightLabel.<key>) and a
   small chart — and keeps the full sentence, t(`analytics.insight.${key}`,
   vars), for hover text and screen readers. viz.kind:
     ring   — a gauge of viz.pct (0–100)
     meter  — a bar filled viz.value / viz.max
     split  — a two-part bar, viz.parts = [{ key, value }]
     trend  — an up/down arrow (viz.dir)
     stat   — the figure alone
   viz.figure is the headline text; viz.sub an optional short qualifier.
   Each finding only appears when the farm has the data behind it; tone
   (good/warn/bad/info) drives the icon and color. */
function computeInsights({ enumLabel, animals, living, health, breeding, production, feeding, finance, feedingInRange, financeInRange, tasks, conditionNames, rangeStart, lang }) {
  const out = [];
  const today = todayIso();
  const add = (id, tone, key, vars, viz) => out.push({ id, tone, key, vars, viz });
  /* Small column charts behind single-figure insights (viz.bars):
     [{ label | labelKey, value }], drawn with their values. */
  const lastSix = monthBuckets(6, lang).map((b) => ({ key: b.key, label: new Date(b.key + '-01T00:00:00').toLocaleString(lang, { month: 'short' }) }));
  const perMonth = (fn) => lastSix.map((m) => ({ label: m.label, value: fn(m.key) }));
  const sumFinance = (key, pred) => finance.filter((f) => ym(f.date) === key && pred(f)).reduce((s, f) => s + moneyOf(f), 0);

  if (living.length) {
    const healthy = living.filter((a) => a.health_status === 'Healthy').length;
    const p = pct(healthy, living.length);
    add('herdHealth', p >= 80 ? 'good' : p >= 60 ? 'warn' : 'bad', 'herdHealth', { pct: p, total: living.length },
      { kind: 'ring', pct: p, figure: `${p}%`, sub: `${healthy} / ${living.length}` });
  }

  const deceased = animals.length - living.length;
  if (deceased > 0) {
    const p = pct(deceased, animals.length);
    add('mortality', p > 5 ? 'bad' : 'warn', 'mortality', { count: deceased, pct: p },
      { kind: 'ring', pct: p, figure: `${p}%`, sub: `${deceased} / ${animals.length}` });
  }

  const recovered = health.filter((h) => h.status === 'Recovered').length;
  const died = health.filter((h) => h.status === 'Deceased').length;
  if (recovered + died > 0) {
    const p = pct(recovered, recovered + died);
    add('recovery', p >= 80 ? 'good' : p >= 50 ? 'warn' : 'bad', 'recovery', { pct: p, recovered, died },
      { kind: 'split', parts: [{ key: 'recovered', value: recovered }, { key: 'died', value: died }], figure: `${p}%` });
  }

  const since90 = isoDaysFromNow(-90);
  const health90 = health.filter((h) => (h.check_date || '') >= since90);
  const recent = sortedEntries(tally(health90, (h) => (h.disease || '').trim().toLowerCase() || null), 1)[0];
  if (recent && recent[1] >= 2) {
    const disease = conditionNames.get(recent[0]) || recent[0];
    add('topCondition', 'warn', 'topCondition', { disease, count: recent[1] },
      { kind: 'meter', value: recent[1], max: health90.length, figure: String(recent[1]), sub: disease });
  }

  const followUps = health.filter((h) => h.next_check_date && (h.status === 'Under Treatment' || h.status === 'Critical'));
  const overdueFollowUps = followUps.filter((h) => h.next_check_date < today).length;
  if (overdueFollowUps > 0) add('overdueFollowUps', 'bad', 'overdueFollowUps', { count: overdueFollowUps },
    { kind: 'meter', value: overdueFollowUps, max: followUps.length, figure: String(overdueFollowUps), sub: `/ ${followUps.length}` });

  const notChecked = living.filter((a) => !a.last_check_date || a.last_check_date < since90).length;
  if (living.length && notChecked > 0) add('notChecked', 'warn', 'notChecked', { count: notChecked },
    { kind: 'meter', value: notChecked, max: living.length, figure: String(notChecked), sub: `/ ${living.length}` });

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
      add(`prod-${type}`, change >= 0 ? 'good' : 'warn', change >= 0 ? 'productionUp' : 'productionDown', { type: enumLabel('productionType', type), pct: Math.abs(change) },
        { kind: 'trend', dir: change >= 0 ? 'up' : 'down', figure: `${change >= 0 ? '+' : '−'}${Math.abs(change)}%`, sub: unit || '',
          bars: [{ labelKey: 'analytics.part.prev30', value: Math.round(prev) }, { labelKey: 'analytics.part.last30', value: Math.round(cur) }] });
    }
  });

  const feedSpend = feedingInRange.reduce((s, f) => s + moneyOf(f, 'cost'), 0);
  const litres = production
    .filter((p) => p.production_type === 'Milk' && p.unit === 'liters' && ym(p.production_date) >= rangeStart)
    .reduce((s, p) => s + (Number(p.quantity) || 0), 0);
  if (feedSpend > 0 && litres > 0) {
    const value = formatMoney(feedSpend / litres, { decimals: 2 });
    const milkByMonth = (key) => production.filter((p) => p.production_type === 'Milk' && p.unit === 'liters' && ym(p.production_date) === key).reduce((s, p) => s + (Number(p.quantity) || 0), 0);
    const feedByMonth = (key) => feeding.filter((f) => ym(f.feeding_date) === key).reduce((s, f) => s + moneyOf(f, 'cost'), 0);
    add('feedPerLiter', 'info', 'feedPerLiter', { value }, { kind: 'stat', icon: 'bottle-droplet', figure: value, money: true, decimals: 2,
      bars: perMonth((k) => { const l = milkByMonth(k); return l > 0 ? Math.round((feedByMonth(k) / l) * 100) / 100 : 0; }) });
  }

  const income = financeInRange.filter((f) => f.type === 'Income').reduce((s, f) => s + moneyOf(f), 0);
  const expense = financeInRange.filter((f) => f.type === 'Expense').reduce((s, f) => s + moneyOf(f), 0);
  if (income > 0) {
    const margin = Math.round(((income - expense) / income) * 100);
    add('profitMargin', margin >= 0 ? 'good' : 'bad', 'profitMargin', { pct: margin, net: fmtMoney(income - expense) },
      { kind: 'ring', pct: Math.max(0, Math.min(100, margin)), figure: `${margin}%`, sub: fmtMoney(income - expense) });
  }
  const topExpense = sortedEntries(tally(financeInRange.filter((f) => f.type === 'Expense'), (f) => f.category || 'Other Expense', (f) => moneyOf(f)), 1)[0];
  if (topExpense && expense > 0) {
    const share = pct(topExpense[1], expense);
    const category = enumLabel('financeCategory', topExpense[0]);
    add('topExpense', 'info', 'topExpense', { category, pct: share }, { kind: 'meter', value: share, max: 100, figure: `${share}%`, sub: category });
  }

  if (living.length) {
    const vet = financeInRange.filter((f) => f.type === 'Expense' && VET_CATEGORIES.has(f.category)).reduce((s, f) => s + moneyOf(f), 0);
    if (vet > 0) {
      const value = fmtMoney(vet / living.length);
      add('vetPerAnimal', 'info', 'vetPerAnimal', { value }, { kind: 'stat', icon: 'syringe', figure: value, money: true,
        bars: perMonth((k) => Math.round(sumFinance(k, (f) => f.type === 'Expense' && VET_CATEGORIES.has(f.category)) / living.length)) });
    }
    if (income > 0) {
      const value = fmtMoney(income / living.length);
      add('revenuePerAnimal', 'info', 'revenuePerAnimal', { value }, { kind: 'stat', icon: 'hand-holding-dollar', figure: value, money: true,
        bars: perMonth((k) => Math.round(sumFinance(k, (f) => f.type === 'Income') / living.length)) });
    }
  }

  const in30 = isoDaysFromNow(30);
  const upcoming = breeding.filter((b) => !b.birth_date && b.pregnancy_status === 'Pregnant' && b.expected_birth_date && b.expected_birth_date >= today && b.expected_birth_date <= in30).length;
  if (upcoming > 0) {
    // Expected births per week over the next four weeks.
    const weeks = [0, 1, 2, 3].map((w) => {
      const from = isoDaysFromNow(w * 7);
      const to = w === 3 ? in30 : isoDaysFromNow(w * 7 + 7);
      const value = breeding.filter((b) => !b.birth_date && b.pregnancy_status === 'Pregnant' && b.expected_birth_date && b.expected_birth_date >= from && (w === 3 ? b.expected_birth_date <= to : b.expected_birth_date < to)).length;
      return { label: new Date(from + 'T00:00:00').toLocaleDateString(lang, { day: 'numeric', month: 'short' }), value };
    });
    add('upcomingBirths', 'info', 'upcomingBirths', { count: upcoming }, { kind: 'stat', icon: 'baby', figure: String(upcoming), bars: weeks });
  }

  const females = living.filter((a) => a.sex === 'Female').length;
  const males = living.filter((a) => a.sex === 'Male').length;
  if (females > 0 && males > 0) {
    const ratio = (females / males).toFixed(1);
    add('sexRatio', 'info', 'sexRatio', { ratio }, { kind: 'split', parts: [{ key: 'female', value: females }, { key: 'male', value: males }], figure: `${ratio} : 1` });
  }

  if (tasks.length) {
    const done = tasks.filter((tk) => tk.status === 'Completed').length;
    const overdue = tasks.filter(isOverdueTask).length;
    const p = pct(done, tasks.length);
    add('taskCompletion', overdue > 0 ? 'warn' : 'good', 'taskCompletion', { pct: p, overdue },
      { kind: 'ring', pct: p, figure: `${p}%`, sub: `${done} / ${tasks.length}`, overdue });
  }

  return out;
}

/* "Farm at a glance": each headline number with the last `months` months
   behind it, so the tile can show a trend instead of a lone figure.
   Series are oldest → newest; the last point is the current month. */
export function computeGlance({ animals = [], breeding = [], finance = [], tasks = [] }, { months = 6, lang = 'en' } = {}) {
  const buckets = monthBuckets(months, lang);
  const living = animals.filter((a) => a.health_status !== 'Deceased');
  const monthSum = (type) => buckets.map((b) => finance.filter((f) => f.type === type && ym(f.date) === b.key).reduce((s, f) => s + moneyOf(f), 0));
  const income = monthSum('Income');
  const expense = monthSum('Expense');
  const net = income.map((v, i) => v - expense[i]);
  const last = months - 1;
  const done = tasks.filter((tk) => tk.status === 'Completed').length;
  return {
    labels: buckets.map((b) => b.label),
    monthNames: buckets.map((b) => new Date(b.key + '-01T00:00:00').toLocaleString(lang, { month: 'short' })),
    animals: {
      total: animals.length,
      series: buckets.map((b) => animals.filter((a) => ym(a.created_at) && ym(a.created_at) <= b.key).length),
      addedThisMonth: animals.filter((a) => ym(a.created_at) === buckets[last].key).length
    },
    pregnant: {
      count: breeding.filter((b) => b.pregnancy_status === 'Pregnant').length,
      females: living.filter((a) => a.sex === 'Female').length
    },
    newborns: {
      total: breeding.filter((b) => b.birth_date).reduce((s, b) => s + (Number(b.newborn_count) || 0), 0),
      series: buckets.map((bk) => breeding.filter((b) => b.birth_date && ym(b.birth_date) === bk.key).reduce((s, b) => s + (Number(b.newborn_count) || 0), 0))
    },
    tasks: {
      pending: tasks.filter((tk) => tk.status === 'Pending').length,
      open: tasks.filter((tk) => tk.status !== 'Completed').length,
      done,
      total: tasks.length,
      overdue: tasks.filter(isOverdueTask).length
    },
    income: { month: income[last], series: income },
    expense: { month: expense[last], series: expense },
    net: { month: net[last], series: net, total: net.reduce((s, v) => s + v, 0) }
  };
}

/* Headline numbers for the dashboard's summary cards — same on both clients. */
export function computeDashboardSummary({ animals = [], breeding = [], finance = [], tasks = [] }) {
  const isThisMonth = (d) => ym(d) === ym(todayIso());
  const monthIncome = finance.filter((x) => x.type === 'Income' && isThisMonth(x.date)).reduce((s, x) => s + moneyOf(x), 0);
  const monthExpense = finance.filter((x) => x.type === 'Expense' && isThisMonth(x.date)).reduce((s, x) => s + moneyOf(x), 0);
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
