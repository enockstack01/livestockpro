import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useApi } from '../lib/api.js';
import { useCanvasChart } from '../lib/useChart.js';
import { useChartTheme, cartesianOptions, doughnutOptions, barDataset } from '../lib/chartTheme.js';
import FarmAnalytics from '../components/FarmAnalytics.jsx';
import HerdProfile from '../components/dashboard/HerdProfile.jsx';
import { RecentActivity, UpcomingEvents, AlertsCard, QuickActions } from '../components/dashboard/DashboardFeed.jsx';
import { greeting } from '../../../shared/navigation';
import { computeGlance } from '../../../shared/analytics';
import { moneyOf } from '../../../shared/currency';
import { computeAlerts, computeRecentActivity, computeUpcoming } from '../../../shared/dashboardFeed';
import { accountDisplayName } from '../../../shared/account';
import { useAccount } from '../components/AccountGate.jsx';
import '../dashboard.css';

/* Dashboard, arranged exactly like the mobile app's dashboard on a phone,
   at every screen size (see .dashboard-stack in dashboard.css): one column
   of full-width cards — greeting, the Herd Profile card (herd-health ring,
   "Farm at a glance" tiles two per row, herd by species), Income vs
   Expenses, Task Status, Farm Analytics & Insights (insights one per row,
   then each chart card), Recent Activity, Upcoming Events, Alerts and
   Quick Actions (two per row). */
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
    <div className="dashboard-stack">
      <div className="page-header">
        <div><h1>{greeting(t, greetName)}</h1><p>{t('dashboardPage.todaySubtitle')}</p></div>
      </div>

      <HerdProfile animals={data.animals} profile={profile} glance={glance} onOpen={(link) => navigate(link)} />

      <div className="charts-grid">
        <div className="card">
          <div className="card-header"><h3><i className="fas fa-chart-column" style={{ color: 'var(--primary)', marginRight: 8 }}></i>{t('dashboardPage.chartIncomeExpenses')}</h3></div>
          <div className="card-body"><FinanceChart finance={data.finance} /></div>
        </div>
        <div className="card">
          <div className="card-header"><h3><i className="fas fa-list-check" style={{ color: 'var(--blue)', marginRight: 8 }}></i>{t('dashboardPage.chartTaskStatus')}</h3></div>
          <div className="card-body"><TaskChart tasks={data.tasks} /></div>
        </div>
      </div>

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

function FinanceChart({ finance }) {
  const { t } = useTranslation();
  const ct = useChartTheme();
  const now = new Date();
  const months = [], incomeData = [], expenseData = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(d.toLocaleString('default', { month: 'short' }));
    const mf = finance.filter((f) => { const fd = new Date(f.date); return fd.getMonth() === d.getMonth() && fd.getFullYear() === d.getFullYear(); });
    incomeData.push(mf.filter((f) => f.type === 'Income').reduce((s, f) => s + moneyOf(f), 0));
    expenseData.push(mf.filter((f) => f.type === 'Expense').reduce((s, f) => s + moneyOf(f), 0));
  }
  const hasData = incomeData.some((v) => v > 0) || expenseData.some((v) => v > 0);
  const canvasRef = useCanvasChart(() => {
    if (!hasData) return null;
    return {
      type: 'bar',
      data: { labels: months, datasets: [barDataset(ct, t('enums.financeType.Income'), incomeData, ct.positive), barDataset(ct, t('enums.financeType.Expense'), expenseData, ct.negative)] },
      options: cartesianOptions(ct, { legend: true, money: true })
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(incomeData), JSON.stringify(expenseData), t, ct.scheme]);

  if (!hasData) return <div className="empty-state" style={{ padding: '30px 10px' }}><i className="fas fa-chart-column"></i><h3>{t('dashboardPage.chartNoFinanceData')}</h3><p>{t('dashboardPage.chartAddFinance')}</p></div>;
  return <div className="chart-container"><canvas ref={canvasRef}></canvas></div>;
}

function TaskChart({ tasks }) {
  const { t } = useTranslation();
  const ct = useChartTheme();
  const pending = tasks.filter((tk) => tk.status === 'Pending').length;
  const inProgress = tasks.filter((tk) => tk.status === 'In Progress').length;
  const completed = tasks.filter((tk) => tk.status === 'Completed').length;
  const total = pending + inProgress + completed;

  const canvasRef = useCanvasChart(() => {
    if (total === 0) return null;
    return {
      type: 'doughnut',
      data: { labels: [t('enums.taskStatus.Pending'), t('enums.taskStatus.In Progress'), t('enums.taskStatus.Completed')], datasets: [{ data: [pending, inProgress, completed], backgroundColor: [ct.series[3], ct.series[0], ct.brand], borderColor: ct.surface, borderWidth: 2 }] },
      options: doughnutOptions(ct)
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, inProgress, completed, t, ct.scheme]);

  if (total === 0) return <div className="empty-state" style={{ padding: '30px 10px' }}><i className="fas fa-clipboard-list"></i><h3>{t('dashboardPage.chartNoTasksYet')}</h3><p>{t('dashboardPage.chartAddTasks')}</p></div>;
  return <div className="chart-container"><canvas ref={canvasRef}></canvas></div>;
}
