import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCanvasChart } from '../lib/useChart.js';
import { useChartTheme, cartesianOptions, doughnutOptions, barDataset, lineDataset, fmtMoney } from '../lib/chartTheme.js';
import { isOverdueTask, todayIso } from '../../../shared/businessRules';

/* The dashboard's "Farm Analytics & Insights" section: every collection a
   farmer records (herd, health, feeding, breeding, production, finance,
   tasks) turned into charts plus plain-language insights. Everything is
   computed client-side from the lists Dashboard.jsx already fetched. */

const DAY_MS = 86400000;
const PRODUCTION_TYPES = ['Milk', 'Eggs', 'Meat'];
const PREGNANCY_ORDER = ['Pregnant', 'Not Confirmed', 'Not Pregnant', 'Delivered'];
const PRIORITY_ORDER = ['High', 'Medium', 'Low'];
const VET_CATEGORIES = new Set(['Veterinary', 'Medicine']);

const ym = (s) => (s ? String(s).slice(0, 7) : '');
const isoDaysFromNow = (n) => new Date(Date.now() + n * DAY_MS).toISOString().slice(0, 10);
const pct = (part, whole) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

/* `past` months ending with the current one, then `future` months after it. */
function monthBuckets(past, lang, future = 0) {
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

function Chart({ build, depKey, height = 280 }) {
  const ct = useChartTheme();
  const { t } = useTranslation();
  const canvasRef = useCanvasChart(() => build(ct), [depKey, ct.scheme, t]);
  return <div className="chart-container" style={{ height }}><canvas ref={canvasRef}></canvas></div>;
}

function ChartCard({ title, icon, empty, children, aside, span = 3 }) {
  const { t } = useTranslation();
  return (
    <div className="card" style={{ gridColumn: `span ${span}` }}>
      <div className="card-header">
        <h3>{icon && <i className={`fas ${icon}`} style={{ color: 'var(--primary)', marginRight: 6 }}></i>}{title}</h3>
        {aside}
      </div>
      <div className="card-body">
        {empty ? <div className="empty-state" style={{ padding: '30px 10px' }}><i className="fas fa-chart-simple"></i><h3>{t('analytics.noData')}</h3></div> : children}
      </div>
    </div>
  );
}

function SectionTitle({ icon, children }) {
  return <h2 className="analytics-section-title"><i className={`fas ${icon}`}></i> {children}</h2>;
}

const barHeight = (n) => Math.max(180, n * 34 + 50);

export default function FarmAnalytics({ data }) {
  const { t, i18n } = useTranslation();
  const [months, setMonths] = useState(12);
  const lang = i18n.language;

  const { animals, health, feeding, breeding, production, finance, tasks } = data;
  const enumLabel = (group, value) => t(`enums.${group}.${value}`, { defaultValue: value });

  const buckets = useMemo(() => monthBuckets(months, lang), [months, lang]);
  const rangeStart = buckets[0].key;
  const inRange = (dateStr) => ym(dateStr) >= rangeStart;

  const living = useMemo(() => animals.filter((a) => a.health_status !== 'Deceased'), [animals]);

  /* ---------- Herd ---------- */
  const species = sortedEntries(tally(living, (a) => a.species || 'Other'));
  const sexSpecies = species.map(([s]) => s);
  const sexCounts = (sex) => sexSpecies.map((s) => living.filter((a) => (a.species || 'Other') === s && a.sex === sex).length);

  const AGE_BANDS = [
    { key: 'age0_6', max: 6 }, { key: 'age6_12', max: 12 }, { key: 'age1_2', max: 24 }, { key: 'age2_5', max: 60 }, { key: 'age5p', max: Infinity }
  ];
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
  const outcomeGroups = [
    { key: 'recovered', statuses: ['Recovered', 'Healthy'], label: `${enumLabel('healthRecordStatus', 'Recovered')} / ${enumLabel('healthRecordStatus', 'Healthy')}` },
    { key: 'treatment', statuses: ['Under Treatment'], label: enumLabel('healthRecordStatus', 'Under Treatment') },
    { key: 'critical', statuses: ['Critical'], label: enumLabel('healthRecordStatus', 'Critical') },
    { key: 'deceased', statuses: ['Deceased'], label: enumLabel('healthRecordStatus', 'Deceased') }
  ];
  const outcomeSeries = outcomeGroups.map((g) => buckets.map((b) => healthInRange.filter((h) => ym(h.check_date) === b.key && g.statuses.includes(h.status)).length));

  const conditionNames = new Map();
  const conditions = sortedEntries(tally(healthInRange, (h) => {
    const name = (h.disease || '').trim();
    if (!name) return null;
    const key = name.toLowerCase();
    const seen = conditionNames.get(key);
    if (!seen || (seen === seen.toLowerCase() && name !== name.toLowerCase())) conditionNames.set(key, name);
    return key;
  }), 8);

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
  const birthBuckets = useMemo(() => monthBuckets(months, lang, 6), [months, lang]);
  const newbornSeries = birthBuckets.map((b) => breeding.filter((r) => r.birth_date && ym(r.birth_date) === b.key).reduce((s, r) => s + (Number(r.newborn_count) || 0), 0));
  const expectedSeries = birthBuckets.map((b) => breeding.filter((r) => !r.birth_date && r.pregnancy_status === 'Pregnant' && ym(r.expected_birth_date) === b.key).length);

  /* ---------- Tasks ---------- */
  const openTasks = tasks.filter((tk) => tk.status !== 'Completed');
  const overdueByPriority = PRIORITY_ORDER.map((p) => openTasks.filter((tk) => (tk.priority || 'Medium') === p && isOverdueTask(tk)).length);
  const onTimeByPriority = PRIORITY_ORDER.map((p) => openTasks.filter((tk) => (tk.priority || 'Medium') === p && !isOverdueTask(tk)).length);

  const insights = computeInsights({ t, enumLabel, animals, living, health, breeding, production, feedingInRange, financeInRange, tasks, conditionNames, rangeStart });

  const moneyH = (entries, group) => ({
    labels: entries.map(([k]) => enumLabel(group, k)),
    values: entries.map(([, v]) => v)
  });
  const expenses = moneyH(expenseByCat, 'financeCategory');
  const income = moneyH(incomeBySrc, 'financeCategory');
  const labels = buckets.map((b) => b.label);

  return (
    <section className="analytics">
      <div className="analytics-header">
        <div>
          <h2><i className="fas fa-chart-line" style={{ color: 'var(--primary)' }}></i> {t('analytics.title')}</h2>
          <p className="text-muted">{t('analytics.subtitle')}</p>
        </div>
        <div className="segmented" role="group" aria-label={t('analytics.range')}>
          {[6, 12].map((m) => (
            <button key={m} type="button" className={months === m ? 'active' : ''} onClick={() => setMonths(m)}>{t(m === 6 ? 'analytics.last6' : 'analytics.last12')}</button>
          ))}
        </div>
      </div>

      <div className="card mb-24">
        <div className="card-header"><h3><i className="fas fa-lightbulb" style={{ color: 'var(--orange)', marginRight: 6 }}></i>{t('analytics.keyInsights')}</h3></div>
        <div className="card-body">
          {insights.length === 0 ? <p className="text-muted">{t('analytics.noInsights')}</p> : (
            <div className="insights-grid">
              {insights.map((ins) => (
                <div key={ins.id} className={`insight-card insight-${ins.tone}`}>
                  <i className={`fas ${INSIGHT_ICON[ins.tone]}`}></i>
                  <span>{ins.text}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <SectionTitle icon="fa-cow">{t('analytics.sectionHerd')}</SectionTitle>
      <div className="analytics-grid">
        <ChartCard title={t('analytics.herdBySpecies')} icon="fa-layer-group" empty={species.length === 0}>
          <Chart height={barHeight(species.length)} depKey={JSON.stringify(species)} build={(ct) => ({
            type: 'bar',
            data: { labels: species.map(([s]) => enumLabel('species', s)), datasets: [barDataset(ct, t('analytics.animalsLabel'), species.map(([, v]) => v), ct.brand)] },
            options: cartesianOptions(ct, { horizontal: true, integer: true })
          })} />
        </ChartCard>
        <ChartCard title={t('analytics.sexBySpecies')} icon="fa-venus-mars" empty={species.length === 0}>
          <Chart height={barHeight(species.length) + 30} depKey={JSON.stringify(species)} build={(ct) => ({
            type: 'bar',
            data: { labels: sexSpecies.map((s) => enumLabel('species', s)), datasets: [
              barDataset(ct, enumLabel('sex', 'Female'), sexCounts('Female'), ct.series[0], { stacked: true }),
              barDataset(ct, enumLabel('sex', 'Male'), sexCounts('Male'), ct.series[1], { stacked: true })
            ] },
            options: cartesianOptions(ct, { horizontal: true, stacked: true, legend: true, integer: true })
          })} />
        </ChartCard>
        <ChartCard title={t('analytics.ageStructure')} icon="fa-hourglass-half" empty={living.length === 0}>
          <Chart depKey={JSON.stringify([ageCounts, ageUnknown])} build={(ct) => ({
            type: 'bar',
            data: {
              labels: [...AGE_BANDS.map((b) => t(`analytics.${b.key}`)), ...(ageUnknown ? [t('analytics.ageUnknown')] : [])],
              datasets: [{ ...barDataset(ct, t('analytics.animalsLabel'), [...ageCounts, ...(ageUnknown ? [ageUnknown] : [])], null), backgroundColor: [...ct.ramp, ct.neutral] }]
            },
            options: cartesianOptions(ct, { integer: true })
          })} />
        </ChartCard>
        <ChartCard title={t('analytics.herdGrowth')} icon="fa-arrow-trend-up" empty={animals.length === 0}>
          <Chart depKey={JSON.stringify([growth, labels])} build={(ct) => ({
            type: 'line',
            data: { labels, datasets: [lineDataset(t('analytics.registered'), growth, ct.brand, { fill: true })] },
            options: cartesianOptions(ct, { integer: true })
          })} />
        </ChartCard>
      </div>

      <SectionTitle icon="fa-stethoscope">{t('analytics.sectionHealth')}</SectionTitle>
      <div className="analytics-grid">
        <ChartCard title={t('analytics.healthEvents')} icon="fa-notes-medical" empty={healthInRange.length === 0}>
          <Chart height={300} depKey={JSON.stringify([outcomeSeries, labels])} build={(ct) => {
            const colors = [ct.status.good, ct.status.warning, ct.status.critical, ct.neutral];
            return {
              type: 'bar',
              data: { labels, datasets: outcomeGroups.map((g, i) => barDataset(ct, g.label, outcomeSeries[i], colors[i], { stacked: true })) },
              options: cartesianOptions(ct, { stacked: true, legend: true, integer: true })
            };
          }} />
        </ChartCard>
        <ChartCard title={t('analytics.topConditions')} icon="fa-virus" empty={conditions.length === 0}>
          <Chart height={barHeight(conditions.length)} depKey={JSON.stringify(conditions)} build={(ct) => ({
            type: 'bar',
            data: { labels: conditions.map(([k]) => conditionNames.get(k)), datasets: [barDataset(ct, t('analytics.cases'), conditions.map(([, v]) => v), ct.brand)] },
            options: cartesianOptions(ct, { horizontal: true, integer: true })
          })} />
        </ChartCard>
      </div>

      <SectionTitle icon="fa-wheat-awn">{t('analytics.sectionProduction')}</SectionTitle>
      <div className="analytics-grid">
        {productionPanels.length === 0 ? (
          <ChartCard title={t('analytics.productionTrend')} icon="fa-gauge" empty span={6} />
        ) : productionPanels.map((p) => (
          <ChartCard
            key={p.type}
            span={6 / productionPanels.length}
            title={t('analytics.productionOf', { type: enumLabel('productionType', p.type), unit: enumLabel('productionUnit', p.unit) })}
            icon={p.type === 'Milk' ? 'fa-bottle-droplet' : p.type === 'Eggs' ? 'fa-egg' : 'fa-drumstick-bite'}
            aside={<span className="analytics-total">{t('analytics.total')}: <strong>{Math.round(p.total).toLocaleString()}</strong></span>}
          >
            <Chart height={230} depKey={JSON.stringify([p.series, labels])} build={(ct) => ({
              type: 'line',
              data: { labels, datasets: [lineDataset(enumLabel('productionType', p.type), p.series, ct.series[p.slot], { fill: true })] },
              options: cartesianOptions(ct)
            })} />
          </ChartCard>
        ))}
        <ChartCard title={t('analytics.feedCost')} icon="fa-sack-dollar" empty={feedCost.every((v) => v === 0)}>
          <Chart depKey={JSON.stringify([feedCost, labels])} build={(ct) => ({
            type: 'bar',
            data: { labels, datasets: [barDataset(ct, t('analytics.feedCost'), feedCost, ct.brand)] },
            options: cartesianOptions(ct, { money: true })
          })} />
        </ChartCard>
        <ChartCard title={t('analytics.feedByType')} icon="fa-wheat-awn" empty={feedByType.length === 0}>
          <Chart height={barHeight(feedByType.length)} depKey={JSON.stringify(feedByType)} build={(ct) => ({
            type: 'bar',
            data: { labels: feedByType.map(([k]) => k), datasets: [barDataset(ct, t('analytics.feedByType'), feedByType.map(([, v]) => v), ct.brand)] },
            options: cartesianOptions(ct, { horizontal: true, money: true })
          })} />
        </ChartCard>
      </div>

      <SectionTitle icon="fa-coins">{t('analytics.sectionFinance')}</SectionTitle>
      <div className="analytics-grid">
        <ChartCard span={2} title={t('analytics.netCashFlow')} icon="fa-scale-balanced" empty={financeInRange.length === 0}>
          <Chart depKey={JSON.stringify([monthNet, labels])} build={(ct) => ({
            type: 'bar',
            data: { labels, datasets: [{ ...barDataset(ct, t('analytics.net'), monthNet, null), backgroundColor: monthNet.map((v) => (v >= 0 ? ct.positive : ct.negative)) }] },
            options: cartesianOptions(ct, { money: true })
          })} />
        </ChartCard>
        <ChartCard span={2} title={t('analytics.expenseByCategory')} icon="fa-receipt" empty={expenses.values.length === 0}>
          <Chart height={barHeight(expenses.values.length)} depKey={JSON.stringify(expenseByCat)} build={(ct) => ({
            type: 'bar',
            data: { labels: expenses.labels, datasets: [barDataset(ct, t('analytics.expenseByCategory'), expenses.values, ct.brand)] },
            options: cartesianOptions(ct, { horizontal: true, money: true })
          })} />
        </ChartCard>
        <ChartCard span={2} title={t('analytics.incomeBySource')} icon="fa-hand-holding-dollar" empty={income.values.length === 0}>
          <Chart height={barHeight(income.values.length)} depKey={JSON.stringify(incomeBySrc)} build={(ct) => ({
            type: 'bar',
            data: { labels: income.labels, datasets: [barDataset(ct, t('analytics.incomeBySource'), income.values, ct.brand)] },
            options: cartesianOptions(ct, { horizontal: true, money: true })
          })} />
        </ChartCard>
      </div>

      <SectionTitle icon="fa-venus-mars">{t('analytics.sectionBreedingTasks')}</SectionTitle>
      <div className="analytics-grid">
        <ChartCard span={2} title={t('analytics.pregnancyStatus')} icon="fa-paw" empty={pregnancy.every((v) => v === 0)}>
          <Chart depKey={JSON.stringify(pregnancy)} build={(ct) => ({
            type: 'doughnut',
            data: { labels: PREGNANCY_ORDER.map((s) => enumLabel('pregnancyStatus', s)), datasets: [{ data: pregnancy, backgroundColor: ct.series.slice(0, 4), borderColor: ct.surface, borderWidth: 2 }] },
            options: doughnutOptions(ct)
          })} />
        </ChartCard>
        <ChartCard span={2} title={t('analytics.births')} icon="fa-baby-carriage" empty={newbornSeries.every((v) => v === 0) && expectedSeries.every((v) => v === 0)}>
          <Chart height={300} depKey={JSON.stringify([newbornSeries, expectedSeries, months])} build={(ct) => ({
            type: 'bar',
            data: { labels: birthBuckets.map((b) => b.label), datasets: [
              barDataset(ct, t('analytics.newborns'), newbornSeries, ct.series[0]),
              barDataset(ct, t('analytics.expectedBirths'), expectedSeries, ct.series[1])
            ] },
            options: cartesianOptions(ct, { legend: true, integer: true })
          })} />
        </ChartCard>
        <ChartCard span={2} title={t('analytics.openTasks')} icon="fa-flag" empty={openTasks.length === 0}>
          <Chart height={300} depKey={JSON.stringify([overdueByPriority, onTimeByPriority])} build={(ct) => ({
            type: 'bar',
            data: { labels: PRIORITY_ORDER.map((p) => enumLabel('taskPriority', p)), datasets: [
              barDataset(ct, t('analytics.overdue'), overdueByPriority, ct.status.critical, { stacked: true }),
              barDataset(ct, t('analytics.onSchedule'), onTimeByPriority, ct.series[0], { stacked: true })
            ] },
            options: cartesianOptions(ct, { horizontal: true, stacked: true, legend: true, integer: true })
          })} />
        </ChartCard>
      </div>
    </section>
  );
}

const INSIGHT_ICON = { good: 'fa-circle-check', warn: 'fa-triangle-exclamation', bad: 'fa-circle-exclamation', info: 'fa-circle-info' };

/* Plain-language findings. Each one only appears when the farm has the data
   behind it; "tone" drives the icon + accent color (never color alone). */
function computeInsights({ t, enumLabel, animals, living, health, breeding, production, feedingInRange, financeInRange, tasks, conditionNames, rangeStart }) {
  const out = [];
  const today = todayIso();
  const add = (id, tone, key, vars) => out.push({ id, tone, text: t(`analytics.insight.${key}`, vars) });

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

  /* Rolling 30-day windows, so a half-finished calendar month never reads as a drop. */
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
  if (feedSpend > 0 && litres > 0) add('feedPerLiter', 'info', 'feedPerLiter', { value: '$' + (feedSpend / litres).toFixed(2) });

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
