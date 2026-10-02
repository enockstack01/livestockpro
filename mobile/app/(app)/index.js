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
import { computeGlance, monthBuckets, ym } from '../../../shared/analytics';
import { moneyOf } from '../../../shared/currency';
import { computeAlerts, computeRecentActivity, computeUpcoming } from '../../../shared/dashboardFeed';
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
    activity: computeRecentActivity(data, t, { lang: i18n.language }),
    upcoming: computeUpcoming(data, t, i18n.language),
  } : null), [data, t, i18n.language]);

  if (!data) return <Spinner />;

  const glance = computeGlance(data, { lang: i18n.language });

  // Income vs expenses, last 6 months.
  const months = monthBuckets(6, i18n.language);
  const monthTotal = (type, key) => data.finance.filter((f) => f.type === type && ym(f.date) === key).reduce((s, f) => s + moneyOf(f), 0);
  const incomeSeries = months.map((m) => monthTotal('Income', m.key));
  const expenseSeries = months.map((m) => monthTotal('Expense', m.key));
  const taskCounts = ['Pending', 'In Progress', 'Completed'].map((st) => data.tasks.filter((tk) => tk.status === st).length);
  const name = accountDisplayName(t, account, account?.role);

  return (
    <Page refreshing={refreshing || syncing} onRefresh={onRefresh}>
      <PageHeader title={greeting(t, name)} subtitle={t('dashboardPage.todaySubtitle')} />

      <HerdProfileCard animals={data.animals} profile={profile} glance={glance} onOpen={(link) => router.replace(link)} />

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
        <RecentActivity activity={feed.activity} />
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
