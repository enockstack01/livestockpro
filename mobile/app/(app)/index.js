import { useCallback, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useRepository } from '../../src/db/repository';
import { useSync } from '../../src/sync/SyncProvider';
import { Page, PageHeader, Spinner } from '../../src/ui/kit';
import { Grid } from '../../src/ui/layout';
import FarmAnalytics from '../../src/screens/FarmAnalytics';
import HerdProfileCard from '../../src/screens/dashboard/HerdProfileCard';
import { RecentActivity, UpcomingEvents, AlertsCard, QuickActions } from '../../src/screens/dashboard/DashboardFeed';
import { computeGlance } from '../../../shared/analytics';
import { computeAlerts, computeRecentActivity, computeUpcoming } from '../../../shared/dashboardFeed';
import { greeting } from '../../../shared/navigation';
import { accountDisplayName } from '../../../shared/account';
import { useAccount } from '../../src/account/AccountProvider';

/* Dashboard, laid out like the CropManager dashboard and identical to the
   web's (client/src/pages/Dashboard.jsx): greeting, the Herd Profile card
   (herd-health ring, "Farm at a glance" tiles, herd by species), Farm
   Analytics & Insights (insight tiles, then chart cards at least two per
   row), then Recent Activity, Upcoming Events, Alerts and Quick Actions —
   in pairs on tablets. */
export default function DashboardScreen() {
  const { t, i18n } = useTranslation();
  const repo = useRepository();
  const router = useRouter();
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

  const name = accountDisplayName(t, account, account?.role);

  return (
    <Page refreshing={refreshing || syncing} onRefresh={onRefresh}>
      <PageHeader title={greeting(t, name)} subtitle={t('dashboardPage.todaySubtitle')} />

      <HerdProfileCard animals={data.animals} profile={profile} glance={glance} onOpen={(link) => router.replace(link)} />

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
