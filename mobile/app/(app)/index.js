import { useCallback, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useRepository } from '../../src/db/repository';
import { useSync } from '../../src/sync/SyncProvider';
import { Card, CardBody, CardHeader, EmptyState, Page, PageHeader, Spinner } from '../../src/ui/kit';
import { Grid } from '../../src/ui/layout';
import { BarChart, DonutChart, useChartColors } from '../../src/ui/charts';
import { useTheme } from '../../src/theme/ThemeProvider';
import FarmAnalytics from '../../src/screens/FarmAnalytics';
import HerdProfileCard from '../../src/screens/dashboard/HerdProfileCard';
import { RecentActivity, UpcomingEvents, AlertsCard, QuickActions } from '../../src/screens/dashboard/DashboardFeed';
import { computeDashboardSummary, monthBuckets, ym } from '../../../shared/analytics';
import { computeAlerts, computeRecentActivity, computeUpcoming } from '../../../shared/dashboardFeed';
import { fmtMoney } from '../../../shared/chartPalette';
import { greeting } from '../../../shared/navigation';
import { accountDisplayName } from '../../../shared/account';
import { useAccount } from '../../src/account/AccountProvider';

/* Dashboard, laid out like the CropManager dashboard and identical to the
   web's (client/src/pages/Dashboard.jsx): greeting, the Herd Profile card
   (herd-health ring, "Farm at a glance" figures, herd by species), the
   headline charts, Farm Analytics & Insights, then Recent Activity,
   Upcoming Events, Alerts and Quick Actions. */
export default function DashboardScreen() {
  const { t, i18n } = useTranslation();
  const repo = useRepository();
  const router = useRouter();
  const cc = useChartColors();
  const { colors } = useTheme();
  const { account } = useAccount();
  const { syncing, lastSyncedAt, triggerSync } = useSync();
  const [data, setData] = useState(null);
  const [profile, setProfile] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [animals, health, finance, production, tasks, breeding, feeding, profiles] = await Promise.all([
      repo.list('animals'), repo.list('health_records'), repo.list('finance_records'), repo.list('production_records'),
      repo.list('tasks', { order: 'due_date ASC' }), repo.list('breeding_records'), repo.list('feeding_records'), repo.list('profiles'),
    ]);
    setData({ animals, health, finance, production, tasks, breeding, feeding });
    setProfile(profiles[0] || null);
  }, [repo]);

  useEffect(() => { load(); }, [load, lastSyncedAt]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await triggerSync();
    await load();
    setRefreshing(false);
  }, [triggerSync, load]);

  const feed = useMemo(() => (data ? {
    alerts: computeAlerts(data, t),
    recent: computeRecentActivity(data, t),
    upcoming: computeUpcoming(data, t, i18n.language),
  } : null), [data, t, i18n.language]);

  if (!data) return <Spinner />;

  const sum = computeDashboardSummary(data);
  const kpis = [
    { icon: 'cow', color: 'green', label: t('dashboardPage.totalAnimals'), value: sum.totalAnimals, link: '/animals' },
    { icon: 'heart-pulse', color: 'green', label: t('dashboardPage.healthy'), value: sum.healthy, link: '/animals' },
    { icon: 'stethoscope', color: 'orange', label: t('dashboardPage.underTreatment'), value: sum.underTreatment, link: '/health' },
    { icon: 'triangle-exclamation', color: 'red', label: t('dashboardPage.criticalCases'), value: sum.critical, link: '/health' },
    { icon: 'paw', color: 'purple', label: t('dashboardPage.pregnant'), value: sum.pregnant, link: '/breeding' },
    { icon: 'egg', color: 'blue', label: t('dashboardPage.newborns'), value: sum.newborns, link: '/breeding' },
    { icon: 'list-check', color: sum.overdueTasks > 0 ? 'red' : 'orange', label: t('dashboardPage.pendingTasks'), value: sum.pendingTasks, link: '/tasks' },
    { icon: 'arrow-trend-up', color: 'green', label: t('dashboardPage.monthlyIncome'), value: fmtMoney(sum.monthIncome), link: '/finance' },
    { icon: 'arrow-trend-down', color: 'red', label: t('dashboardPage.monthlyExpenses'), value: fmtMoney(sum.monthExpense), link: '/finance' },
    { icon: 'chart-line', color: sum.profitLoss >= 0 ? 'blue' : 'red', label: t('dashboardPage.profitLoss'), value: fmtMoney(sum.profitLoss), link: '/finance' },
  ];

  // Income vs expenses, last 6 months.
  const months = monthBuckets(6, i18n.language);
  const monthTotal = (type, key) => data.finance.filter((f) => f.type === type && ym(f.date) === key).reduce((s, f) => s + (Number(f.amount) || 0), 0);
  const incomeSeries = months.map((m) => monthTotal('Income', m.key));
  const expenseSeries = months.map((m) => monthTotal('Expense', m.key));
  const taskCounts = ['Pending', 'In Progress', 'Completed'].map((st) => data.tasks.filter((tk) => tk.status === st).length);
  const name = accountDisplayName(t, account, account?.role);

  return (
    <Page refreshing={refreshing || syncing} onRefresh={onRefresh}>
      <PageHeader title={greeting(t, name)} subtitle={t('dashboardPage.todaySubtitle')} />

      <HerdProfileCard animals={data.animals} profile={profile} kpis={kpis} onKpiPress={(link) => router.replace(link)} />

      <Grid minItemWidth={340} gap={20} fillLast style={{ marginBottom: 24 }}>
        <Card>
          <CardHeader title={t('dashboardPage.chartIncomeExpenses')} icon="chart-column" />
          <CardBody>
            {incomeSeries.every((v) => v === 0) && expenseSeries.every((v) => v === 0)
              ? <EmptyState icon="chart-column" title={t('dashboardPage.chartNoFinanceData')} message={t('dashboardPage.chartAddFinance')} compact />
              : <BarChart money legend labels={months.map((m) => m.label)} datasets={[{ label: t('enums.financeType.Income'), data: incomeSeries, color: cc.positive }, { label: t('enums.financeType.Expense'), data: expenseSeries, color: cc.negative }]} />}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title={t('dashboardPage.chartTaskStatus')} icon="list-check" iconColor={colors.blue} />
          <CardBody>
            {taskCounts.every((v) => v === 0)
              ? <EmptyState icon="clipboard-list" title={t('dashboardPage.chartNoTasksYet')} message={t('dashboardPage.chartAddTasks')} compact />
              : <DonutChart labels={[t('enums.taskStatus.Pending'), t('enums.taskStatus.In Progress'), t('enums.taskStatus.Completed')]} data={taskCounts} colors={[cc.series[3], cc.series[0], cc.brand]} />}
          </CardBody>
        </Card>
      </Grid>

      <FarmAnalytics data={data} />

      <Grid minItemWidth={340} gap={20} style={{ marginBottom: 20 }}>
        <RecentActivity items={feed.recent} />
        <UpcomingEvents items={feed.upcoming} />
      </Grid>
      <Grid minItemWidth={340} gap={20}>
        <AlertsCard items={feed.alerts} />
        <QuickActions />
      </Grid>
      <View style={{ height: 8 }} />
    </Page>
  );
}
