import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { Dimensions, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { PieChart } from 'react-native-chart-kit';
import { Ionicons } from '@expo/vector-icons';
import { useRepository } from '../../src/db/repository';
import { useSync } from '../../src/sync/SyncProvider';
import { fmtDate, isOverdueTask, isThisMonth } from '../../src/lib/shared';
import { StatusBadge } from '../../src/components/Badges';

const CHART_COLORS = { green: '#2E7D32', orange: '#E65100', red: '#D32F2F', gray: '#90A4AE', blue: '#1976D2' };

export default function DashboardScreen() {
  const repo = useRepository();
  const router = useRouter();
  const { syncing, lastSyncedAt, triggerSync } = useSync();
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

  const kpis = useMemo(() => computeKpis(data), [data]);

  if (!data) {
    return <View style={styles.container} />;
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={refreshing || syncing} onRefresh={onRefresh} colors={['#2E7D32']} />}
    >
      <View style={styles.grid}>
        <KpiCard label="Total Animals" value={kpis.totalAnimals} icon="paw" color={CHART_COLORS.green} onPress={() => router.push('/animals')} />
        <KpiCard label="Critical" value={kpis.critical} icon="alert-circle" color={CHART_COLORS.red} onPress={() => router.push('/health')} />
        <KpiCard label="Pregnant" value={kpis.pregnant} icon="heart" color={CHART_COLORS.blue} onPress={() => router.push('/breeding')} />
        <KpiCard label="Pending Tasks" value={kpis.pendingTasks} sub={kpis.overdueTasks ? `${kpis.overdueTasks} overdue` : null} icon="checkbox" color={kpis.overdueTasks ? CHART_COLORS.red : CHART_COLORS.orange} onPress={() => router.push('/tasks')} />
        <KpiCard label="Income (mo.)" value={`$${kpis.monthlyIncome.toFixed(0)}`} icon="trending-up" color={CHART_COLORS.green} onPress={() => router.push('/finance')} />
        <KpiCard label="Expense (mo.)" value={`$${kpis.monthlyExpense.toFixed(0)}`} icon="trending-down" color={CHART_COLORS.red} onPress={() => router.push('/finance')} />
      </View>

      <View style={[styles.card, { alignItems: 'center' }]}>
        <Text style={styles.cardTitle}>Herd Health</Text>
        {kpis.totalAnimals > 0 ? (
          <PieChart
            data={kpis.healthChartData}
            width={Dimensions.get('window').width - 64}
            height={160}
            accessor="value"
            backgroundColor="transparent"
            paddingLeft="8"
            chartConfig={{ color: () => '#263238' }}
            hasLegend
          />
        ) : (
          <Text style={styles.emptyText}>No animals yet.</Text>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Recent Animals</Text>
        {data.animals.slice(0, 5).map((a) => (
          <View key={a.id} style={styles.listRow}>
            <Text style={styles.listRowTitle}>{a.tag_id} {a.name ? `· ${a.name}` : ''}</Text>
            <StatusBadge status={a.health_status} />
          </View>
        ))}
        {data.animals.length === 0 && <Text style={styles.emptyText}>No animals yet.</Text>}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Upcoming Tasks</Text>
        {kpis.upcomingTasks.map((t) => (
          <View key={t.id} style={styles.listRow}>
            <Text style={styles.listRowTitle} numberOfLines={1}>{t.title}</Text>
            <Text style={styles.listRowMeta}>{fmtDate(t.due_date)}</Text>
          </View>
        ))}
        {kpis.upcomingTasks.length === 0 && <Text style={styles.emptyText}>Nothing pending.</Text>}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Recent Health Alerts</Text>
        {kpis.healthAlerts.map((h) => (
          <View key={h.id} style={styles.listRow}>
            <Text style={styles.listRowTitle} numberOfLines={1}>{h.tag_id} — {h.disease || 'Check-up'}</Text>
            <StatusBadge status={h.status} />
          </View>
        ))}
        {kpis.healthAlerts.length === 0 && <Text style={styles.emptyText}>No active alerts.</Text>}
      </View>
    </ScrollView>
  );
}

function computeKpis(data) {
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
    { name: 'Healthy', value: healthy, color: CHART_COLORS.green, legendFontColor: '#37474F', legendFontSize: 12 },
    { name: 'Under Treatment', value: underTreatment, color: CHART_COLORS.orange, legendFontColor: '#37474F', legendFontSize: 12 },
    { name: 'Critical', value: critical, color: CHART_COLORS.red, legendFontColor: '#37474F', legendFontSize: 12 },
    { name: 'Deceased', value: deceased, color: CHART_COLORS.gray, legendFontColor: '#37474F', legendFontSize: 12 },
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

function KpiCard({ label, value, sub, icon, color, onPress }) {
  return (
    <Pressable style={styles.kpiCard} onPress={onPress}>
      <View style={[styles.kpiIcon, { backgroundColor: color + '1A' }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <Text style={styles.kpiValue}>{value}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
      {sub ? <Text style={[styles.kpiSub, { color }]}>{sub}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7F5' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  kpiCard: { width: '31%', backgroundColor: '#fff', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: '#ECEFF1', gap: 4 },
  kpiIcon: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  kpiValue: { fontSize: 18, fontWeight: '800', color: '#1B5E20' },
  kpiLabel: { fontSize: 11, color: '#607D8B' },
  kpiSub: { fontSize: 10, fontWeight: '700' },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#ECEFF1', gap: 10 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#1B5E20' },
  listRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#F5F7F5' },
  listRowTitle: { flex: 1, fontSize: 13, color: '#263238', marginRight: 8 },
  listRowMeta: { fontSize: 12, color: '#90A4AE' },
  emptyText: { color: '#90A4AE', fontSize: 13 },
});
