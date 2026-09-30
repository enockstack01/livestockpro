import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Icon from '../components/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { Card, CardBody, CardHeader, EmptyState, Segmented } from '../ui/kit';
import { Grid, useBreakpoint } from '../ui/layout';
import { BarChart, DonutChart, LineChart, useChartColors } from '../ui/charts';
import { computeFarmAnalytics, AGE_BANDS, OUTCOME_GROUPS, PREGNANCY_ORDER, PRIORITY_ORDER } from '../../../shared/analytics';

/* Mobile rendering of the web dashboard's "Farm Analytics & Insights"
   section (client/src/components/FarmAnalytics.jsx): same numbers (both
   come from shared/analytics.js), same sections, same card order and the
   same 6-column grid — halves and thirds side by side on wide screens,
   one card per row below 1024px. */

const INSIGHT_ICON = { good: 'circle-check', warn: 'triangle-exclamation', bad: 'circle-exclamation', info: 'circle-info' };
const barHeight = (n) => Math.max(180, n * 34 + 50);

function ChartCard({ title, icon, empty, aside, children }) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader title={title} icon={icon} right={aside} />
      <CardBody>{empty ? <EmptyState icon="chart-simple" title={t('analytics.noData')} compact /> : children}</CardBody>
    </Card>
  );
}

function SectionTitle({ icon, children }) {
  const { colors } = useTheme();
  return (
    <View style={styles.sectionTitle}>
      <Icon name={icon} size={13} color={colors.primary} />
      <Text style={[styles.sectionTitleText, { color: colors.textLight }]}>{children}</Text>
    </View>
  );
}

function Row({ children }) {
  return <Grid columns={6} gap={20} style={{ marginBottom: 24 }}>{children}</Grid>;
}

export default function FarmAnalytics({ data }) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const cc = useChartColors();
  const { width } = useBreakpoint();
  const [months, setMonths] = useState(12);
  const enumLabel = (group, value) => t(`enums.${group}.${value}`, { defaultValue: value });

  const a = useMemo(() => computeFarmAnalytics(data, { months, lang: i18n.language, enumLabel }), [data, months, i18n.language]); // eslint-disable-line react-hooks/exhaustive-deps
  const { labels } = a;
  const outcomeLabels = {
    recovered: `${enumLabel('healthRecordStatus', 'Recovered')} / ${enumLabel('healthRecordStatus', 'Healthy')}`,
    treatment: enumLabel('healthRecordStatus', 'Under Treatment'),
    critical: enumLabel('healthRecordStatus', 'Critical'),
    deceased: enumLabel('healthRecordStatus', 'Deceased'),
  };
  const outcomeColors = [cc.status.good, cc.status.warning, cc.status.critical, cc.neutral];
  const ageLabels = [...AGE_BANDS.map((b) => t(`analytics.${b.key}`)), ...(a.ageUnknown ? [t('analytics.ageUnknown')] : [])];
  const ageValues = [...a.ageCounts, ...(a.ageUnknown ? [a.ageUnknown] : [])];
  const tones = { good: '#0ca30c', warn: '#e39b00', bad: '#d03b3b', info: colors.blue };

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
            <Grid minItemWidth={width <= 480 ? 240 : 280} gap={12}>
              {a.insights.map((ins) => (
                <View key={ins.id} style={[styles.insight, { borderColor: colors.border, borderLeftColor: tones[ins.tone] }]}>
                  <Icon name={INSIGHT_ICON[ins.tone]} size={15} color={tones[ins.tone]} style={{ marginTop: 1 }} />
                  <Text style={[styles.insightText, { color: colors.text }]}>{t(`analytics.insight.${ins.key}`, ins.vars)}</Text>
                </View>
              ))}
            </Grid>
          )}
        </CardBody>
      </Card>

      <SectionTitle icon="cow">{t('analytics.sectionHerd')}</SectionTitle>
      <Row>
        <View span={3}>
          <ChartCard title={t('analytics.herdBySpecies')} icon="layer-group" empty={a.species.length === 0}>
            <BarChart horizontal integer height={barHeight(a.species.length)} labels={a.species.map(([s]) => enumLabel('species', s))}
              datasets={[{ label: t('analytics.animalsLabel'), data: a.species.map(([, v]) => v), color: cc.brand }]} />
          </ChartCard>
        </View>
        <View span={3}>
          <ChartCard title={t('analytics.sexBySpecies')} icon="venus-mars" empty={a.species.length === 0}>
            <BarChart horizontal stacked integer legend height={barHeight(a.species.length) + 30} labels={a.sexSpecies.map((s) => enumLabel('species', s))}
              datasets={[{ label: enumLabel('sex', 'Female'), data: a.females, color: cc.series[0] }, { label: enumLabel('sex', 'Male'), data: a.males, color: cc.series[1] }]} />
          </ChartCard>
        </View>
        <View span={3}>
          <ChartCard title={t('analytics.ageStructure')} icon="hourglass-half" empty={a.living.length === 0}>
            <BarChart integer labels={ageLabels} datasets={[{ label: t('analytics.animalsLabel'), data: ageValues, colors: [...cc.ramp, cc.neutral], color: cc.ramp[2] }]} />
          </ChartCard>
        </View>
        <View span={3}>
          <ChartCard title={t('analytics.herdGrowth')} icon="arrow-trend-up" empty={(data.animals || []).length === 0}>
            <LineChart integer labels={labels} datasets={[{ label: t('analytics.registered'), data: a.growth, color: cc.brand, fill: true }]} />
          </ChartCard>
        </View>
      </Row>

      <SectionTitle icon="stethoscope">{t('analytics.sectionHealth')}</SectionTitle>
      <Row>
        <View span={3}>
          <ChartCard title={t('analytics.healthEvents')} icon="notes-medical" empty={a.healthInRangeCount === 0}>
            <BarChart stacked integer legend height={320} labels={labels}
              datasets={OUTCOME_GROUPS.map((g, i) => ({ label: outcomeLabels[g.key], data: a.outcomeSeries[i], color: outcomeColors[i] }))} />
          </ChartCard>
        </View>
        <View span={3}>
          <ChartCard title={t('analytics.topConditions')} icon="virus" empty={a.conditions.length === 0}>
            <BarChart horizontal integer height={barHeight(a.conditions.length)} labels={a.conditions.map(([k]) => k)}
              datasets={[{ label: t('analytics.cases'), data: a.conditions.map(([, v]) => v), color: cc.brand }]} />
          </ChartCard>
        </View>
      </Row>

      <SectionTitle icon="wheat-awn">{t('analytics.sectionProduction')}</SectionTitle>
      <Row>
        {a.productionPanels.length === 0 ? (
          <View span={6}><ChartCard title={t('analytics.productionTrend')} icon="gauge" empty /></View>
        ) : a.productionPanels.map((p) => (
          <View key={p.type} span={6 / a.productionPanels.length}>
            <ChartCard
              title={t('analytics.productionOf', { type: enumLabel('productionType', p.type), unit: enumLabel('productionUnit', p.unit) })}
              icon={p.type === 'Milk' ? 'bottle-droplet' : p.type === 'Eggs' ? 'egg' : 'drumstick-bite'}
              aside={<Text style={{ fontSize: 12, color: colors.textLight }}>{t('analytics.total')}: <Text style={{ fontWeight: '700', color: colors.text }}>{Math.round(p.total).toLocaleString()}</Text></Text>}
            >
              <LineChart height={230} labels={labels} datasets={[{ label: enumLabel('productionType', p.type), data: p.series, color: cc.series[p.slot], fill: true }]} />
            </ChartCard>
          </View>
        ))}
      </Row>
      <Row>
        <View span={3}>
          <ChartCard title={t('analytics.feedCost')} icon="sack-dollar" empty={a.feedCost.every((v) => v === 0)}>
            <BarChart money labels={labels} datasets={[{ label: t('analytics.feedCost'), data: a.feedCost, color: cc.brand }]} />
          </ChartCard>
        </View>
        <View span={3}>
          <ChartCard title={t('analytics.feedByType')} icon="wheat-awn" empty={a.feedByType.length === 0}>
            <BarChart horizontal money height={barHeight(a.feedByType.length)} labels={a.feedByType.map(([k]) => k)}
              datasets={[{ label: t('analytics.feedByType'), data: a.feedByType.map(([, v]) => v), color: cc.brand }]} />
          </ChartCard>
        </View>
      </Row>

      <SectionTitle icon="coins">{t('analytics.sectionFinance')}</SectionTitle>
      <Row>
        <View span={2}>
          <ChartCard title={t('analytics.netCashFlow')} icon="scale-balanced" empty={a.financeInRangeCount === 0}>
            <BarChart money labels={labels} datasets={[{ label: t('analytics.net'), data: a.monthNet, color: cc.positive, colors: a.monthNet.map((v) => (v >= 0 ? cc.positive : cc.negative)) }]} />
          </ChartCard>
        </View>
        <View span={2}>
          <ChartCard title={t('analytics.expenseByCategory')} icon="receipt" empty={a.expenseByCat.length === 0}>
            <BarChart horizontal money height={barHeight(a.expenseByCat.length)} labels={a.expenseByCat.map(([k]) => enumLabel('financeCategory', k))}
              datasets={[{ label: t('analytics.expenseByCategory'), data: a.expenseByCat.map(([, v]) => v), color: cc.brand }]} />
          </ChartCard>
        </View>
        <View span={2}>
          <ChartCard title={t('analytics.incomeBySource')} icon="hand-holding-dollar" empty={a.incomeBySrc.length === 0}>
            <BarChart horizontal money height={barHeight(a.incomeBySrc.length)} labels={a.incomeBySrc.map(([k]) => enumLabel('financeCategory', k))}
              datasets={[{ label: t('analytics.incomeBySource'), data: a.incomeBySrc.map(([, v]) => v), color: cc.brand }]} />
          </ChartCard>
        </View>
      </Row>

      <SectionTitle icon="venus-mars">{t('analytics.sectionBreedingTasks')}</SectionTitle>
      <Row>
        <View span={2}>
          <ChartCard title={t('analytics.pregnancyStatus')} icon="paw" empty={a.pregnancy.every((v) => v === 0)}>
            <DonutChart labels={PREGNANCY_ORDER.map((s) => enumLabel('pregnancyStatus', s))} data={a.pregnancy} colors={cc.series.slice(0, 4)} />
          </ChartCard>
        </View>
        <View span={2}>
          <ChartCard title={t('analytics.births')} icon="baby-carriage" empty={a.newbornSeries.every((v) => v === 0) && a.expectedSeries.every((v) => v === 0)}>
            <BarChart integer legend height={300} labels={a.birthLabels}
              datasets={[{ label: t('analytics.newborns'), data: a.newbornSeries, color: cc.series[0] }, { label: t('analytics.expectedBirths'), data: a.expectedSeries, color: cc.series[1] }]} />
          </ChartCard>
        </View>
        <View span={2}>
          <ChartCard title={t('analytics.openTasks')} icon="flag" empty={a.openTasksCount === 0}>
            <BarChart horizontal stacked integer legend height={300} labels={PRIORITY_ORDER.map((p) => enumLabel('taskPriority', p))}
              datasets={[{ label: t('analytics.overdue'), data: a.overdueByPriority, color: cc.status.critical }, { label: t('analytics.onSchedule'), data: a.onTimeByPriority, color: cc.series[0] }]} />
          </ChartCard>
        </View>
      </Row>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, marginTop: 8, marginBottom: 16 },
  headerTitle: { fontSize: 20, fontWeight: '700' },
  headerSub: { fontSize: 13, marginTop: 2 },
  sectionTitle: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, marginBottom: 12 },
  sectionTitleText: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  insight: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 8, borderWidth: 1, borderLeftWidth: 4 },
  insightText: { flex: 1, fontSize: 13, lineHeight: 19 },
});
