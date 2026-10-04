import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useApi } from '../lib/api.js';
import FarmAnalytics from '../components/FarmAnalytics.jsx';
import HerdProfile from '../components/dashboard/HerdProfile.jsx';
import { RecentActivity, UpcomingEvents, AlertsCard, QuickActions } from '../components/dashboard/DashboardFeed.jsx';
import { greeting } from '../../../shared/navigation';
import { computeGlance } from '../../../shared/analytics';
import { computeAlerts, computeRecentActivity, computeUpcoming } from '../../../shared/dashboardFeed';
import { accountDisplayName } from '../../../shared/account';
import { useAccount } from '../components/AccountGate.jsx';
import '../dashboard.css';

/* Dashboard, laid out like CropManager's: greeting, the Herd Profile card
   (herd-health ring, "Farm at a glance" tiles, herd by species), Farm
   Analytics & Insights (insight tiles, then chart cards side by side — at
   least two per row, more on wider screens; see components/CardGrid.jsx),
   then Recent Activity, Upcoming Events, Alerts and Quick Actions in pairs
   on wide screens. The mobile app follows the same arrangement. */
export default function Dashboard() {
  const { t, i18n } = useTranslation();
  const api = useApi();
  const navigate = useNavigate();
  const { account } = useAccount();
  const greetName = accountDisplayName(t, account, account.role);

  const [data, setData] = useState(null);
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    (async () => {
      const [r1, r2, r3, r4, r5, r6, r7, r8] = await Promise.all([
        api.list('animals'),
        api.list('health_records'),
        api.list('finance_records'),
        api.list('production_records'),
        api.list('tasks', { order: 'due_date.asc' }),
        api.list('breeding_records'),
        api.list('feeding_records'),
        api.list('profiles')
      ]);
      setData({
        animals: r1.data || [],
        health: r2.data || [],
        finance: r3.data || [],
        production: r4.data || [],
        tasks: r5.data || [],
        breeding: r6.data || [],
        feeding: r7.data || []
      });
      setProfile((r8.data || [])[0] || null);
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const feed = useMemo(() => (data ? {
    alerts: computeAlerts(data, t),
    activity: computeRecentActivity(data, t, { lang: i18n.language }),
    upcoming: computeUpcoming(data, t, i18n.language)
  } : null), [data, t, i18n.language]);

  if (!data) return null;

  const glance = computeGlance(data, { lang: i18n.language });

  return (
    <div className="dashboard">
      <div className="page-header">
        <div><h1>{greeting(t, greetName)}</h1><p>{t('dashboardPage.todaySubtitle')}</p></div>
      </div>

      <HerdProfile animals={data.animals} profile={profile} glance={glance} onOpen={(link) => navigate(link)} />

      <FarmAnalytics data={data} />

      <div className="feed-grid">
        <RecentActivity activity={feed.activity} />
        <UpcomingEvents items={feed.upcoming} />
      </div>
      <div className="feed-grid">
        <AlertsCard items={feed.alerts} />
        <QuickActions />
      </div>
    </div>
  );
}

