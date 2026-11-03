import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Icon from '../components/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { Card, CardBody, CardHeader, EmptyState, Segmented } from '../ui/kit';
import { CardGrid, useCardSize } from '../ui/cardGrid';
import { BarChart, DonutChart, LineChart, useChartColors } from '../ui/charts';
import { computeFarmAnalytics, AGE_BANDS, OUTCOME_GROUPS, PREGNANCY_ORDER, PRIORITY_ORDER } from '../../../shared/analytics';
import InsightTiles from './dashboard/InsightTiles';
import { useAccount } from '../account/AccountProvider';
import { formatMoneyCompact } from '../../../shared/currency';

/* Mobile rendering of the web dashboard's "Farm Analytics & Insights"
   section (client/src/components/FarmAnalytics.jsx): same numbers (both
   come from shared/analytics.js), same sections and card order, and the
   same card grid — at least two charts per row, more on tablets; dense
   12-month series take a whole row on phones (ui/cardGrid.js). */

const barHeight = (n) => Math.max(180, n * 34 + 50);

/* `wide` is read by CardGrid: a time series that gets two columns.
   `figure` and `caption` put the chart's headline number in the header
   (twin of the web's ChartCard). */
function ChartCard({ title, icon, empty, aside, figure, caption, children }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { narrow } = useCardSize();
  const head = aside || (figure != null && !empty ? (
    <View style={{ alignItems: 'flex-end' }}>
      <Text style={{ fontSize: narrow ? 14 : 17, fontWeight: '800', color: colors.text }} numberOfLines={1}>{String(figure)}</Text>
      {caption ? <Text style={{ fontSize: 10.5, fontWeight: '600', color: colors.textLight }} numberOfLines={1}>{caption}</Text> : null}
    </View>
  ) : null);
  return (
    <Card style={{ flex: 1, borderRadius: 10, overflow: 'hidden' }}>
      <CardHeader title={title} icon={icon} right={head} compact={narrow} tiled />
      <CardBody style={narrow ? { paddingVertical: 10, paddingHorizontal: 6 } : null}>{empty ? <EmptyState icon="chart-simple" title={t('analytics.noData')} compact /> : children}</CardBody>
    </Card>
  );
}

function SectionTitle({ icon, children }) {
  const { colors } = useTheme();
  return (
    <View style={styles.sectionTitle}>
      <View style={[styles.sectionIcon, { backgroundColor: colors.leaf }]}><Icon name={icon} size={12} color="#FFFFFF" /></View>
      <Text style={[styles.sectionTitleText, { color: colors.text }]}>{children}</Text>
      <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
    </View>
  );
}

export default function FarmAnalytics({ data }) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const cc = useChartColors();
  const [months, setMonths] = useState(12);
  const enumLabel = (group, value) => t(`enums.${group}.${value}`, { defaultValue: value });

  // ratesVersion / currency: re-total when exchange rates or the display currency change.
  const { ratesVersion, account } = useAccount();
  const a = useMemo(() => computeFarmAnalytics(data, { months, lang: i18n.language, enumLabel }), [data, months, i18n.language, ratesVersion, account?.currency]); // eslint-disable-line react-hooks/exhaustive-deps
  const { labels } = a;

  /* Headline numbers for the chart headers and doughnut centres. */
  const sum = (list) => list.reduce((s, v) => s + (Number(v) || 0), 0);
  const money = (v) => formatMoneyCompact(v);
  const pct = (part, whole) => (whole ? Math.round((part / whole) * 100) : 0);
  const outcomeSum = sum(a.outcomeTotals);
  const net = sum(a.monthIncome) - sum(a.monthExpense);
  const outcomeLabels = {
    recovered: `${enumLabel('healthRecordStatus', 'Recovered')} / ${enumLabel('healthRecordStatus', 'Healthy')}`,
    treatment: enumLabel('healthRecordStatus', 'Under Treatment'),
    critical: enumLabel('healthRecordStatus', 'Critical'),
    deceased: enumLabel('healthRecordStatus', 'Deceased'),
  };
  const outcomeColors = [cc.status.good, cc.status.warning, cc.status.critical, cc.neutral];
  const ageLabels = [...AGE_BANDS.map((b) => t(`analytics.${b.key}`)), ...(a.ageUnknown ? [t('analytics.ageUnknown')] : [])];
  const ageValues = [...a.ageCounts, ...(a.ageUnknown ? [a.ageUnknown] : [])];

  return (
    <View style={{ marginBottom: 24 }}>
      <View style={styles.header}>
        <View style={{ flexShrink: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Icon name="chart-line" size={18} color={colors.primary} />
            <Text style={[styles.headerTitle, { color: colors.text }]}>{t('analytics.title')}</Text>
          </View>
          <Text style={[styles.headerSub, { color: colors.textLight }]}>{t('analytics.subtitle')}</Text>
        </View>
        <Segmented value={months} onChange={setMonths} items={[{ value: 6, label: t('analytics.last6') }, { value: 12, label: t('analytics.last12') }]} />
      </View>

      <Card style={{ marginBottom: 24 }}>
        <CardHeader title={t('analytics.keyInsights')} icon="lightbulb" iconColor={colors.orange} />
        <CardBody>
          {a.insights.length === 0 ? <Text style={{ color: colors.textLight, fontSize: 13 }}>{t('analytics.noInsights')}</Text> : (
            <InsightTiles insights={a.insights} />
          )}
        </CardBody>
      </Card>

      <SectionTitle icon="cow">{t('analytics.sectionHerd')}</SectionTitle>
      <CardGrid>
        <ChartCard title={t('analytics.herdBySpecies')} figure={a.living.length} caption={t('analytics.animalsLabel')} icon="layer-group" empty={a.species.length === 0}>
          <BarChart horizontal integer height={barHeight(a.species.length)} labels={a.species.map(([s]) => enumLabel('species', s))}
            datasets={[{ label: t('analytics.animalsLabel'), data: a.species.map(([, v]) => v), color: cc.brand }]} />
        </ChartCard>
        <ChartCard title={t('analytics.sexBySpecies')} figure={`${sum(a.females)} / ${sum(a.males)}`} caption={`${t('analytics.part.female')} / ${t('analytics.part.male')}`} icon="venus-mars" empty={a.species.length === 0}>
          <BarChart horizontal stacked integer legend height={barHeight(a.species.length) + 30} labels={a.sexSpecies.map((s) => enumLabel('species', s))}
            datasets={[{ label: enumLabel('sex', 'Female'), data: a.females, color: cc.series[0] }, { label: enumLabel('sex', 'Male'), data: a.males, color: cc.series[1] }]} />
        </ChartCard>
        <ChartCard title={t('analytics.ageStructure')} figure={a.living.length} caption={t('analytics.animalsLabel')} icon="hourglass-half" empty={a.living.length === 0}>
          <BarChart integer labels={ageLabels} datasets={[{ label: t('analytics.animalsLabel'), data: ageValues, colors: [...cc.ramp, cc.neutral], color: cc.ramp[2] }]} />
        </ChartCard>
        <ChartCard title={t('analytics.pregnancyStatus')} figure={a.pregnancy[PREGNANCY_ORDER.indexOf('Pregnant')] || 0} caption={enumLabel('pregnancyStatus', 'Pregnant')} icon="paw" empty={a.pregnancy.every((v) => v === 0)}>
          <DonutChart center={{ value: sum(a.pregnancy), label: t('analytics.records') }} labels={PREGNANCY_ORDER.map((s) => enumLabel('pregnancyStatus', s))} data={a.pregnancy} colors={cc.series.slice(0, 4)} />
        </ChartCard>
        <ChartCard wide="soft" title={t('analytics.herdGrowth')} figure={a.growth[a.growth.length - 1] || 0} caption={t('analytics.animalsLabel')} icon="arrow-trend-up" empty={(data.animals || []).length === 0}>
          <LineChart integer labels={labels} datasets={[{ label: t('analytics.registered'), data: a.growth, color: cc.brand, fill: true }]} />
        </ChartCard>
      </CardGrid>

      <SectionTitle icon="stethoscope">{t('analytics.sectionHealth')}</SectionTitle>
      <CardGrid>
        <ChartCard wide title={t('analytics.healthEvents')} figure={a.healthInRangeCount} caption={t('analytics.records')} icon="notes-medical" empty={a.healthInRangeCount === 0}>
          <BarChart stacked integer legend height={320} labels={labels}
            datasets={OUTCOME_GROUPS.map((g, i) => ({ label: outcomeLabels[g.key], data: a.outcomeSeries[i], color: outcomeColors[i] }))} />
        </ChartCard>
        <ChartCard title={t('analytics.caseOutcomes')} figure={outcomeSum} caption={t('analytics.cases')} icon="heart-pulse" empty={a.outcomeTotals.every((v) => v === 0)}>
          <DonutChart center={{ value: `${pct(a.outcomeTotals[0], outcomeSum)}%`, label: enumLabel('healthRecordStatus', 'Recovered') }} labels={OUTCOME_GROUPS.map((g) => outcomeLabels[g.key])} data={a.outcomeTotals} colors={outcomeColors} />
        </ChartCard>
        <ChartCard title={t('analytics.topConditions')} figure={sum(a.conditions.map(([, v]) => v))} caption={t('analytics.cases')} icon="virus" empty={a.conditions.length === 0}>
          <BarChart horizontal integer height={barHeight(a.conditions.length)} labels={a.conditions.map(([k]) => k)}
            datasets={[{ label: t('analytics.cases'), data: a.conditions.map(([, v]) => v), color: cc.brand }]} />
        </ChartCard>
      </CardGrid>

      <SectionTitle icon="wheat-awn">{t('analytics.sectionProduction')}</SectionTitle>
      <CardGrid>
        {a.productionPanels.length === 0 ? <ChartCard title={t('analytics.productionTrend')} icon="gauge" empty /> : null}
        {a.productionPanels.map((p) => (
          <ChartCard
            key={p.type}
            wide="soft"
            title={t('analytics.productionOf', { type: enumLabel('productionType', p.type), unit: enumLabel('productionUnit', p.unit) })}
            icon={p.type === 'Milk' ? 'bottle-droplet' : p.type === 'Eggs' ? 'egg' : 'drumstick-bite'}
            figure={Math.round(p.total).toLocaleString()}
            caption={t('analytics.total')}
          >
            <LineChart height={230} labels={labels} datasets={[{ label: enumLabel('productionType', p.type), data: p.series, color: cc.series[p.slot], fill: true }]} />
          </ChartCard>
        ))}
        <ChartCard wide="soft" title={t('analytics.feedCost')} figure={money(sum(a.feedCost))} caption={t('analytics.total')} icon="sack-dollar" empty={a.feedCost.every((v) => v === 0)}>
          <BarChart money labels={labels} datasets={[{ label: t('analytics.feedCost'), data: a.feedCost, color: cc.brand }]} />
        </ChartCard>
        <ChartCard title={t('analytics.feedByType')} figure={money(sum(a.feedByType.map(([, v]) => v)))} caption={t('analytics.total')} icon="wheat-awn" empty={a.feedByType.length === 0}>
          <BarChart horizontal money height={barHeight(a.feedByType.length)} labels={a.feedByType.map(([k]) => k)}
            datasets={[{ label: t('analytics.feedByType'), data: a.feedByType.map(([, v]) => v), color: cc.brand }]} />
        </ChartCard>
      </CardGrid>

      <SectionTitle icon="coins">{t('analytics.sectionFinance')}</SectionTitle>
      <CardGrid>
        {/* Months run down the chart, each with its income and expense bar
            and the amount beside it, so every figure stays readable. */}
        <ChartCard wide="full" title={t('analytics.incomeVsExpenses')} figure={money(net)} caption={t('analytics.net')} icon="chart-column" empty={a.financeInRangeCount === 0}>
          <BarChart horizontal money legend height={labels.length * 44 + 80} labels={labels} datasets={[{ label: enumLabel('financeType', 'Income'), data: a.monthIncome, color: cc.positive }, { label: enumLabel('financeType', 'Expense'), data: a.monthExpense, color: cc.negative }]} />
        </ChartCard>
        <ChartCard wide="full" title={t('analytics.netCashFlow')} figure={money(net)} caption={t('analytics.net')} icon="scale-balanced" empty={a.financeInRangeCount === 0}>
          <BarChart money labels={labels} datasets={[{ label: t('analytics.net'), data: a.monthNet, color: cc.positive, colors: a.monthNet.map((v) => (v >= 0 ? cc.positive : cc.negative)) }]} />
        </ChartCard>
        <ChartCard title={t('analytics.expenseByCategory')} figure={money(sum(a.expenseByCat.map(([, v]) => v)))} caption={enumLabel('financeType', 'Expense')} icon="receipt" empty={a.expenseByCat.length === 0}>
          <BarChart horizontal money height={barHeight(a.expenseByCat.length)} labels={a.expenseByCat.map(([k]) => enumLabel('financeCategory', k))}
            datasets={[{ label: t('analytics.expenseByCategory'), data: a.expenseByCat.map(([, v]) => v), color: cc.brand }]} />
        </ChartCard>
        <ChartCard title={t('analytics.incomeBySource')} figure={money(sum(a.incomeBySrc.map(([, v]) => v)))} caption={enumLabel('financeType', 'Income')} icon="hand-holding-dollar" empty={a.incomeBySrc.length === 0}>
          <BarChart horizontal money height={barHeight(a.incomeBySrc.length)} labels={a.incomeBySrc.map(([k]) => enumLabel('financeCategory', k))}
            datasets={[{ label: t('analytics.incomeBySource'), data: a.incomeBySrc.map(([, v]) => v), color: cc.brand }]} />
        </ChartCard>
      </CardGrid>

      <SectionTitle icon="venus-mars">{t('analytics.sectionBreedingTasks')}</SectionTitle>
      <CardGrid>
        <ChartCard wide title={t('analytics.births')} figure={sum(a.newbornSeries)} caption={t('analytics.newborns')} icon="baby-carriage" empty={a.newbornSeries.every((v) => v === 0) && a.expectedSeries.every((v) => v === 0)}>
          <BarChart integer legend height={300} labels={a.birthLabels}
            datasets={[{ label: t('analytics.newborns'), data: a.newbornSeries, color: cc.series[0] }, { label: t('analytics.expectedBirths'), data: a.expectedSeries, color: cc.series[1] }]} />
        </ChartCard>
        <ChartCard title={t('dashboardPage.chartTaskStatus')} figure={(a.taskStatus[0] || 0) + (a.taskStatus[1] || 0)} caption={enumLabel('taskStatus', 'Pending')} icon="list-check" empty={a.taskStatus.every((v) => v === 0)}>
          <DonutChart center={{ value: `${pct(a.taskStatus[2] || 0, sum(a.taskStatus))}%`, label: enumLabel('taskStatus', 'Completed') }} labels={['Pending', 'In Progress', 'Completed'].map((st) => enumLabel('taskStatus', st))} data={a.taskStatus} colors={[cc.series[3], cc.series[1], cc.brand]} />
        </ChartCard>
        <ChartCard title={t('analytics.openTasks')} figure={sum(a.overdueByPriority)} caption={t('analytics.overdue')} icon="flag" empty={a.openTasksCount === 0}>
          <BarChart horizontal stacked integer legend height={300} labels={PRIORITY_ORDER.map((p) => enumLabel('taskPriority', p))}
            datasets={[{ label: t('analytics.overdue'), data: a.overdueByPriority, color: cc.status.critical }, { label: t('analytics.onSchedule'), data: a.onTimeByPriority, color: cc.series[0] }]} />
        </ChartCard>
      </CardGrid>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, marginTop: 8, marginBottom: 16 },
  headerTitle: { fontSize: 20, fontWeight: '700' },
  headerSub: { fontSize: 13, marginTop: 2 },
  sectionTitle: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14, marginBottom: 12 },
  sectionIcon: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  sectionTitleText: { fontSize: 12.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
});
