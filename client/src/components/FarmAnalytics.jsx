import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCanvasChart } from '../lib/useChart.js';
import { useChartTheme, cartesianOptions, doughnutOptions, barDataset, lineDataset } from '../lib/chartTheme.js';
import { computeFarmAnalytics, AGE_BANDS, OUTCOME_GROUPS, PREGNANCY_ORDER, PRIORITY_ORDER } from '../../../shared/analytics';
import InsightTiles from './dashboard/InsightTiles.jsx';

/* The dashboard's "Farm Analytics & Insights" section: every collection a
   farmer records (herd, health, feeding, breeding, production, finance,
   tasks) turned into charts plus plain-language insights. The numbers come
   from shared/analytics.js — the mobile app renders the very same figures. */

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

  const enumLabel = (group, value) => t(`enums.${group}.${value}`, { defaultValue: value });

  const a = useMemo(() => computeFarmAnalytics(data, { months, lang, enumLabel }), [data, months, lang]); // eslint-disable-line react-hooks/exhaustive-deps
  const { labels, living, species, sexSpecies, ageCounts, ageUnknown, growth, outcomeSeries, conditions, productionPanels, feedCost, feedByType, monthNet, expenseByCat, incomeBySrc, pregnancy, newbornSeries, expectedSeries, overdueByPriority, onTimeByPriority, insights } = a;

  const outcomeLabels = {
    recovered: `${enumLabel('healthRecordStatus', 'Recovered')} / ${enumLabel('healthRecordStatus', 'Healthy')}`,
    treatment: enumLabel('healthRecordStatus', 'Under Treatment'),
    critical: enumLabel('healthRecordStatus', 'Critical'),
    deceased: enumLabel('healthRecordStatus', 'Deceased')
  };
  const moneyH = (entries, group) => ({
    labels: entries.map(([k]) => enumLabel(group, k)),
    values: entries.map(([, v]) => v)
  });
  const expenses = moneyH(expenseByCat, 'financeCategory');
  const income = moneyH(incomeBySrc, 'financeCategory');

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
          {insights.length === 0 ? <p className="text-muted">{t('analytics.noInsights')}</p> : <InsightTiles insights={insights} />}
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
              barDataset(ct, enumLabel('sex', 'Female'), a.females, ct.series[0], { stacked: true }),
              barDataset(ct, enumLabel('sex', 'Male'), a.males, ct.series[1], { stacked: true })
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
        <ChartCard title={t('analytics.herdGrowth')} icon="fa-arrow-trend-up" empty={(data.animals || []).length === 0}>
          <Chart depKey={JSON.stringify([growth, labels])} build={(ct) => ({
            type: 'line',
            data: { labels, datasets: [lineDataset(t('analytics.registered'), growth, ct.brand, { fill: true })] },
            options: cartesianOptions(ct, { integer: true })
          })} />
        </ChartCard>
      </div>

      <SectionTitle icon="fa-stethoscope">{t('analytics.sectionHealth')}</SectionTitle>
      <div className="analytics-grid">
        <ChartCard title={t('analytics.healthEvents')} icon="fa-notes-medical" empty={a.healthInRangeCount === 0}>
          <Chart height={300} depKey={JSON.stringify([outcomeSeries, labels])} build={(ct) => {
            const colors = [ct.status.good, ct.status.warning, ct.status.critical, ct.neutral];
            return {
              type: 'bar',
              data: { labels, datasets: OUTCOME_GROUPS.map((g, i) => barDataset(ct, outcomeLabels[g.key], outcomeSeries[i], colors[i], { stacked: true })) },
              options: cartesianOptions(ct, { stacked: true, legend: true, integer: true })
            };
          }} />
        </ChartCard>
        <ChartCard title={t('analytics.topConditions')} icon="fa-virus" empty={conditions.length === 0}>
          <Chart height={barHeight(conditions.length)} depKey={JSON.stringify(conditions)} build={(ct) => ({
            type: 'bar',
            data: { labels: conditions.map(([k]) => k), datasets: [barDataset(ct, t('analytics.cases'), conditions.map(([, v]) => v), ct.brand)] },
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
        <ChartCard span={2} title={t('analytics.netCashFlow')} icon="fa-scale-balanced" empty={a.financeInRangeCount === 0}>
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
            data: { labels: a.birthLabels, datasets: [
              barDataset(ct, t('analytics.newborns'), newbornSeries, ct.series[0]),
              barDataset(ct, t('analytics.expectedBirths'), expectedSeries, ct.series[1])
            ] },
            options: cartesianOptions(ct, { legend: true, integer: true })
          })} />
        </ChartCard>
        <ChartCard span={2} title={t('analytics.openTasks')} icon="fa-flag" empty={a.openTasksCount === 0}>
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
