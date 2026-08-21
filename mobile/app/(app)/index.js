import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { PieChart } from 'react-native-chart-kit';
import { useTranslation } from 'react-i18next';
import { useRepository } from '../../src/db/repository';
import { useSync } from '../../src/sync/SyncProvider';
import { fmtDate, isOverdueTask, isThisMonth } from '../../src/lib/shared';
import { StatusBadge } from '../../src/components/Badges';
import Icon from '../../src/components/Icon';
import ResponsiveScreen from '../../src/components/ResponsiveScreen';
import { useTheme } from '../../src/theme/ThemeProvider';

export default function DashboardScreen() {
  const { t } = useTranslation();
  const { colors, radius, shadow } = useTheme();
  const styles = useMemo(() => makeStyles(colors, radius, shadow), [colors, radius, shadow]);
  const CHART_COLORS = useMemo(() => ({ green: colors.primary, orange: colors.orange, red: colors.red, gray: colors.textLight, blue: colors.blue }), [colors]);

  const repo = useRepository();
  const router = useRouter();
  const { syncing, lastSyncedAt, triggerSync } = useSync();
  const { width: windowWidth } = useWindowDimensions();
  const [data, setData] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [animals, health, breeding, production, finance, tasks] = await Promise.all([
      repo.list('animals'),
      repo.list('health_records'),
      repo.list('breeding_records'),
      repo.list('production_records'),
      repo.list('finance_records'),
      repo.list('tasks'),
    ]);
    setData({ animals, health, breeding, production, finance, tasks });
  }, [repo]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => { if (lastSyncedAt) load(); }, [lastSyncedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await triggerSync();
    await load();
    setRefreshing(false);
  }, [triggerSync, load]);

  const kpis = useMemo(() => computeKpis(data, CHART_COLORS, colors), [data, CHART_COLORS, colors]);

  if (!data) {
    return <View style={styles.container} />;
  }

  return (
    <ResponsiveScreen>
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={refreshing || syncing} onRefresh={onRefresh} colors={[colors.primary]} />}
    >
      <View style={styles.grid}>
        <KpiCard styles={styles} label={t('dashboard.totalAnimals')} value={kpis.totalAnimals} icon="cow" color={CHART_COLORS.green} onPress={() => router.push('/animals')} />
        <KpiCard styles={styles} label={t('dashboard.critical')} value={kpis.critical} icon="triangle-exclamation" color={CHART_COLORS.red} onPress={() => router.push('/health')} />
        <KpiCard styles={styles} label={t('dashboard.pregnant')} value={kpis.pregnant} icon="venus-mars" color={CHART_COLORS.blue} onPress={() => router.push('/breeding')} />
        <KpiCard styles={styles} label={t('dashboard.pendingTasks')} value={kpis.pendingTasks} sub={kpis.overdueTasks ? t('dashboard.overdueCount', { count: kpis.overdueTasks }) : null} icon="list-check" color={kpis.overdueTasks ? CHART_COLORS.red : CHART_COLORS.orange} onPress={() => router.push('/tasks')} />
        <KpiCard styles={styles} label={t('dashboard.incomeMonth')} value={`$${kpis.monthlyIncome.toFixed(0)}`} icon="arrow-trend-up" color={CHART_COLORS.green} onPress={() => router.push('/finance')} />
        <KpiCard styles={styles} label={t('dashboard.expenseMonth')} value={`$${kpis.monthlyExpense.toFixed(0)}`} icon="arrow-trend-down" color={CHART_COLORS.red} onPress={() => router.push('/finance')} />
      </View>

      <View style={[styles.card, { alignItems: 'center' }]}>
        <Text style={styles.cardTitle}>{t('dashboard.herdHealth')}</Text>
        {kpis.totalAnimals > 0 ? (
          <PieChart
            data={kpis.healthChartData}
            width={Math.min(windowWidth, 640) - 64}
            height={160}
            accessor="value"
            backgroundColor="transparent"
            paddingLeft="8"
            chartConfig={{ color: () => colors.text }}
            hasLegend
          />
        ) : (
          <Text style={styles.emptyText}>{t('dashboard.noAnimalsYet')}</Text>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t('dashboard.recentAnimals')}</Text>
        {data.animals.slice(0, 5).map((a) => (
          <View key={a.id} style={styles.listRow}>
            <Text style={styles.listRowTitle}>{a.tag_id} {a.name ? `· ${a.name}` : ''}</Text>
            <StatusBadge status={a.health_status} />
          </View>
        ))}
        {data.animals.length === 0 && <Text style={styles.emptyText}>{t('dashboard.noAnimalsYet')}</Text>}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t('dashboard.upcomingTasks')}</Text>
        {kpis.upcomingTasks.map((task) => (
          <View key={task.id} style={styles.listRow}>
            <Text style={styles.listRowTitle} numberOfLines={1}>{task.title}</Text>
            <Text style={styles.listRowMeta}>{fmtDate(task.due_date)}</Text>
          </View>
        ))}
        {kpis.upcomingTasks.length === 0 && <Text style={styles.emptyText}>{t('dashboard.nothingPending')}</Text>}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t('dashboard.recentHealthAlerts')}</Text>
        {kpis.healthAlerts.map((h) => (
          <View key={h.id} style={styles.listRow}>
            <Text style={styles.listRowTitle} numberOfLines={1}>{h.tag_id} — {h.disease || t('dashboard.checkup')}</Text>
            <StatusBadge status={h.status} />
          </View>
        ))}
        {kpis.healthAlerts.length === 0 && <Text style={styles.emptyText}>{t('dashboard.noActiveAlerts')}</Text>}
      </View>
    </ScrollView>
    </ResponsiveScreen>
  );
}

function computeKpis(data, CHART_COLORS, colors) {
  if (!data) return null;
  const { animals, health, breeding, finance, tasks } = data;

  const healthy = animals.filter((a) => a.health_status === 'Healthy').length;
  const underTreatment = animals.filter((a) => a.health_status === 'Under Treatment').length;
  const critical = animals.filter((a) => a.health_status === 'Critical').length;
  const deceased = animals.filter((a) => a.health_status === 'Deceased').length;

  const pregnant = breeding.filter((b) => b.pregnancy_status === 'Pregnant').length;

  const pendingTasks = tasks.filter((t) => t.status !== 'Completed').length;
  const overdueTasks = tasks.filter(isOverdueTask).length;
  const upcomingTasks = tasks
    .filter((t) => t.status !== 'Completed' && t.due_date)
    .sort((a, b) => (a.due_date > b.due_date ? 1 : -1))
    .slice(0, 5);

  const monthlyIncome = finance.filter((f) => f.type === 'Income' && isThisMonth(f.date)).reduce((sum, f) => sum + (Number(f.amount) || 0), 0);
  const monthlyExpense = finance.filter((f) => f.type === 'Expense' && isThisMonth(f.date)).reduce((sum, f) => sum + (Number(f.amount) || 0), 0);

  const healthAlerts = health
    .filter((h) => h.status === 'Under Treatment' || h.status === 'Critical')
    .sort((a, b) => (b.check_date || '').localeCompare(a.check_date || ''))
    .slice(0, 5);

  const healthChartData = [
    { name: 'Healthy', value: healthy, color: CHART_COLORS.green, legendFontColor: colors.textLight, legendFontSize: 12 },
    { name: 'Under Treatment', value: underTreatment, color: CHART_COLORS.orange, legendFontColor: colors.textLight, legendFontSize: 12 },
    { name: 'Critical', value: critical, color: CHART_COLORS.red, legendFontColor: colors.textLight, legendFontSize: 12 },
    { name: 'Deceased', value: deceased, color: CHART_COLORS.gray, legendFontColor: colors.textLight, legendFontSize: 12 },
  ].filter((d) => d.value > 0);

  return {
    totalAnimals: animals.length,
    critical,
    pregnant,
    pendingTasks,
    overdueTasks,
    upcomingTasks,
    monthlyIncome,
    monthlyExpense,
    healthAlerts,
    healthChartData,
  };
}

function KpiCard({ styles, label, value, sub, icon, color, onPress }) {
  return (
    <Pressable style={styles.kpiCard} onPress={onPress}>
      <View style={[styles.kpiIcon, { backgroundColor: color + '1A' }]}>
        <Icon name={icon} size={16} color={color} />
      </View>
      <Text style={styles.kpiValue}>{value}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
      {sub ? <Text style={[styles.kpiSub, { color }]}>{sub}</Text> : null}
    </Pressable>
  );
}

function makeStyles(colors, radius, shadow) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    kpiCard: {
      width: '31%', backgroundColor: colors.card, borderRadius: radius.card, padding: 12, gap: 4,
      shadowColor: shadow.color, shadowOpacity: shadow.opacity, shadowRadius: shadow.radius, shadowOffset: shadow.offset, elevation: shadow.elevation,
    },
    kpiIcon: { width: 30, height: 30, borderRadius: radius.button, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
    kpiValue: { fontSize: 18, fontWeight: '800', color: colors.primaryDark },
    kpiLabel: { fontSize: 11, color: colors.textLight },
    kpiSub: { fontSize: 10, fontWeight: '700' },
    card: {
      backgroundColor: colors.card, borderRadius: radius.card, padding: 16, gap: 10,
      shadowColor: shadow.color, shadowOpacity: shadow.opacity, shadowRadius: shadow.radius, shadowOffset: shadow.offset, elevation: shadow.elevation,
    },
    cardTitle: { fontSize: 15, fontWeight: '700', color: colors.primaryDark },
    listRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.bg },
    listRowTitle: { flex: 1, fontSize: 13, color: colors.text, marginRight: 8 },
    listRowMeta: { fontSize: 12, color: colors.textLight },
    emptyText: { color: colors.textLight, fontSize: 13 },
  });
}
