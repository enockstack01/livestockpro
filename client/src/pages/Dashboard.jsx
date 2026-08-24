import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useApi } from '../lib/api.js';
import { useToast } from '../lib/toast.jsx';
import { StatusBadge, PriorityBadge, fmtDate } from '../lib/badges.jsx';
import { useCanvasChart } from '../lib/useChart.js';
import Modal from '../components/Modal.jsx';
import { isOverdueTask } from '../../../shared/businessRules';

export default function Dashboard() {
  const { t } = useTranslation();
  const api = useApi();
  const showToast = useToast();

  const [data, setData] = useState({ animals: [], health: [], finance: [], production: [], tasks: [], breeding: [] });
  const [loading, setLoading] = useState(true);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [taskForm, setTaskForm] = useState({ title: '', description: '', due_date: '', priority: 'Medium' });

  async function fetchAll() {
    const [r1, r2, r3, r4, r5, r6] = await Promise.all([
      api.list('animals'),
      api.list('health_records'),
      api.list('finance_records'),
      api.list('production_records'),
      api.list('tasks', { order: 'due_date.asc' }),
      api.list('breeding_records')
    ]);
    setData({
      animals: r1.data || [],
      health: r2.data || [],
      finance: r3.data || [],
      production: r4.data || [],
      tasks: r5.data || [],
      breeding: r6.data || []
    });
    setLoading(false);
  }

  useEffect(() => { fetchAll(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function saveQuickTask() {
    const title = taskForm.title.trim();
    if (!title) { showToast(t('tasksPage.taskTitleRequired'), 'error'); return; }
    const result = await api.insert('tasks', [{
      title,
      description: taskForm.description.trim(),
      due_date: taskForm.due_date || null,
      priority: taskForm.priority,
      status: 'Pending'
    }]);
    if (result.error) { showToast(t('records.saveFailed', { message: result.error.message }), 'error'); return; }
    showToast(t('records.added', { item: t('tables.tasks.singular') }), 'success');
    setTaskModalOpen(false);
    const taskResult = await api.list('tasks', { order: 'due_date.asc' });
    setData((d) => ({ ...d, tasks: taskResult.data || [] }));
  }

  if (loading) return null;

  const a = data.animals, h = data.health, tasksArr = data.tasks, b = data.breeding, f = data.finance;
  const healthyCount = a.filter((x) => x.health_status === 'Healthy').length;
  const treatmentCount = a.filter((x) => x.health_status === 'Under Treatment').length;
  const criticalCount = a.filter((x) => x.health_status === 'Critical').length;
  const pregnantCount = b.filter((x) => x.pregnancy_status === 'Pregnant').length;
  const newbornCount = b.filter((x) => x.birth_date).reduce((s, x) => s + (x.newborn_count || 0), 0);
  const pendingTasks = tasksArr.filter((x) => x.status === 'Pending').length;
  const overdueTasks = tasksArr.filter(isOverdueTask).length;

  const now = new Date();
  const monthFinance = f.filter((x) => { const d = new Date(x.date); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); });
  const monthIncome = monthFinance.filter((x) => x.type === 'Income').reduce((s, x) => s + (x.amount || 0), 0);
  const monthExpense = monthFinance.filter((x) => x.type === 'Expense').reduce((s, x) => s + (x.amount || 0), 0);
  const profitLoss = monthIncome - monthExpense;

  const summaryItems = [
    { icon: 'fa-cow', color: 'green', label: t('dashboardPage.totalAnimals'), value: a.length, link: '/animals' },
    { icon: 'fa-heart-pulse', color: 'green', label: t('dashboardPage.healthy'), value: healthyCount, link: '/animals' },
    { icon: 'fa-stethoscope', color: 'orange', label: t('dashboardPage.underTreatment'), value: treatmentCount, link: '/health' },
    { icon: 'fa-triangle-exclamation', color: 'red', label: t('dashboardPage.criticalCases'), value: criticalCount, link: '/health' },
    { icon: 'fa-paw', color: 'purple', label: t('dashboardPage.pregnant'), value: pregnantCount, link: '/breeding' },
    { icon: 'fa-egg', color: 'blue', label: t('dashboardPage.newborns'), value: newbornCount, link: '/breeding' },
    { icon: 'fa-list-check', color: overdueTasks > 0 ? 'red' : 'orange', label: t('dashboardPage.pendingTasks'), value: pendingTasks, link: '/tasks' },
    { icon: 'fa-arrow-trend-up', color: 'green', label: t('dashboardPage.monthlyIncome'), value: '$' + monthIncome.toLocaleString(), link: '/finance' },
    { icon: 'fa-arrow-trend-down', color: 'red', label: t('dashboardPage.monthlyExpenses'), value: '$' + monthExpense.toLocaleString(), link: '/finance' },
    { icon: 'fa-chart-line', color: profitLoss >= 0 ? 'blue' : 'red', label: t('dashboardPage.profitLoss'), value: '$' + profitLoss.toLocaleString(), link: '/finance' }
  ];

  const recentAnimals = a.slice().sort((x, y) => new Date(y.created_at) - new Date(x.created_at)).slice(0, 5);
  const pendingTasksList = tasksArr.filter((x) => x.status !== 'Completed').slice(0, 5);
  const alerts = h.filter((x) => x.status === 'Under Treatment' || x.status === 'Critical')
    .sort((x, y) => new Date(y.check_date) - new Date(x.check_date)).slice(0, 5);

  return (
    <>
      <div className="page-header">
        <div><h1>{t('dashboardPage.title')}</h1><p>{t('dashboardPage.subtitle')}</p></div>
      </div>

      <div className="summary-grid">
        {summaryItems.map((s) => (
          <Link key={s.label} to={s.link} className="summary-card" style={{ textDecoration: 'none', color: 'inherit' }}>
            <div className={`summary-icon ${s.color}`}><i className={`fas ${s.icon}`}></i></div>
            <div className="summary-info"><h4>{s.value}</h4><p>{s.label}</p></div>
          </Link>
        ))}
      </div>

      <div className="charts-grid">
        <div className="card">
          <div className="card-header"><h3>{t('dashboardPage.chartAnimalHealth')}</h3></div>
          <div className="card-body"><HealthChart healthy={healthyCount} treatment={treatmentCount} critical={criticalCount} /></div>
        </div>
        <div className="card">
          <div className="card-header"><h3>{t('dashboardPage.chartIncomeExpenses')}</h3></div>
          <div className="card-body"><FinanceChart finance={f} /></div>
        </div>
        <div className="card">
          <div className="card-header"><h3>{t('dashboardPage.chartProductionTrend')}</h3></div>
          <div className="card-body"><ProductionChart production={data.production} /></div>
        </div>
        <div className="card">
          <div className="card-header"><h3>{t('dashboardPage.chartTaskStatus')}</h3></div>
          <div className="card-body"><TaskChart tasks={tasksArr} /></div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div className="card">
          <div className="card-header"><h3>{t('dashboardPage.recentAnimals')}</h3><Link to="/animals" className="btn btn-sm btn-secondary">{t('common.viewAll')}</Link></div>
          <div className="card-body" style={{ padding: 0 }}>
            {recentAnimals.length === 0 ? (
              <div className="empty-state"><i className="fas fa-cow"></i><h3>{t('dashboardPage.noAnimalsYet')}</h3><p><Link to="/animals" style={{ color: 'var(--primary)', fontWeight: 600 }}>{t('dashboardPage.addFirstAnimal')}</Link></p></div>
            ) : (
              <div className="table-wrapper"><table className="data-table">
                <thead><tr><th>{t('tables.animals.fields.tag_id')}</th><th>{t('tables.animals.fields.name')}</th><th>{t('tables.animals.fields.species')}</th><th>{t('tables.animals.fields.breed')}</th><th>{t('tables.animals.fields.health_status')}</th></tr></thead>
                <tbody>{recentAnimals.map((an) => (
                  <tr key={an.id} style={{ cursor: 'pointer' }} onClick={() => (window.location.href = '/animals')}>
                    <td className="fw-600">{an.tag_id}</td><td>{an.name || '—'}</td><td>{an.species}</td><td>{an.breed || '—'}</td>
                    <td><StatusBadge status={an.health_status} /></td>
                  </tr>
                ))}</tbody>
              </table></div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h3>{t('dashboardPage.upcomingTasks')}</h3>
            <div className="d-flex gap-16">
              <button className="btn btn-sm btn-primary" onClick={() => { setTaskForm({ title: '', description: '', due_date: '', priority: 'Medium' }); setTaskModalOpen(true); }}><i className="fas fa-plus"></i> {t('dashboardPage.add')}</button>
              <Link to="/tasks" className="btn btn-sm btn-secondary">{t('common.viewAll')}</Link>
            </div>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            {pendingTasksList.length === 0 ? (
              <div className="empty-state"><i className="fas fa-clipboard-check"></i><h3>{t('dashboardPage.noPendingTasks')}</h3><p>{t('dashboardPage.allCaughtUp')} <Link to="/tasks" style={{ color: 'var(--primary)', fontWeight: 600 }}>{t('layout.viewAllTasks')}</Link></p></div>
            ) : (
              <div className="table-wrapper"><table className="data-table">
                <thead><tr><th>{t('tables.tasks.fields.title')}</th><th>{t('tables.tasks.fields.due_date')}</th><th>{t('tables.tasks.fields.priority')}</th><th>{t('tables.tasks.fields.status')}</th></tr></thead>
                <tbody>{pendingTasksList.map((tk) => {
                  const isOverdue = isOverdueTask(tk);
                  return (
                    <tr key={tk.id} style={{ cursor: 'pointer' }} onClick={() => (window.location.href = '/tasks')}>
                      <td className="fw-600">{tk.title}</td>
                      <td>{isOverdue ? <span style={{ color: 'var(--red)', fontWeight: 600 }}>{fmtDate(tk.due_date)}</span> : fmtDate(tk.due_date)}</td>
                      <td><PriorityBadge priority={tk.priority} /></td>
                      <td><StatusBadge status={tk.status} /></td>
                    </tr>
                  );
                })}</tbody>
              </table></div>
            )}
          </div>
        </div>
      </div>

      <div className="card mt-24">
        <div className="card-header"><h3><i className="fas fa-triangle-exclamation text-orange"></i> {t('dashboardPage.recentHealthAlerts')}</h3><Link to="/health" className="btn btn-sm btn-secondary">{t('common.viewAll')}</Link></div>
        <div className="card-body" style={{ padding: 0 }}>
          {alerts.length === 0 ? (
            <div className="empty-state"><i className="fas fa-shield-heart"></i><h3>{t('dashboardPage.noHealthAlerts')}</h3><p>{t('dashboardPage.allAnimalsHealthy')}</p></div>
          ) : (
            <div className="table-wrapper"><table className="data-table">
              <thead><tr><th>{t('tables.animals.fields.tag_id')}</th><th>{t('tables.health_records.fields.disease')}</th><th>{t('tables.health_records.fields.treatment')}</th><th>{t('tables.health_records.fields.status')}</th></tr></thead>
              <tbody>{alerts.map((al) => (
                <tr key={al.id} style={{ cursor: 'pointer' }} onClick={() => (window.location.href = '/health')}>
                  <td className="fw-600">{al.tag_id || '—'}</td><td>{al.disease || '—'}</td><td>{al.treatment || '—'}</td>
                  <td><StatusBadge status={al.status} /></td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </div>
      </div>

      <Modal
        open={taskModalOpen}
        onClose={() => setTaskModalOpen(false)}
        title={t('dashboardPage.quickAddTask')}
        footer={<>
          <button className="btn btn-secondary" onClick={() => setTaskModalOpen(false)}>{t('common.cancel')}</button>
          <button className="btn btn-primary" onClick={saveQuickTask}><i className="fas fa-check"></i> {t('dashboardPage.saveTask')}</button>
        </>}
      >
        <div className="form-group">
          <label>{t('tables.tasks.fields.title')} *</label>
          <input type="text" className="form-control" placeholder={t('dashboardPage.taskTitlePlaceholder')} value={taskForm.title} onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })} />
        </div>
        <div className="form-group">
          <label>{t('tables.tasks.fields.description')}</label>
          <textarea className="form-control" placeholder={t('dashboardPage.taskDescPlaceholder')} value={taskForm.description} onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })} />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>{t('tables.tasks.fields.due_date')}</label>
            <input type="date" className="form-control" value={taskForm.due_date} onChange={(e) => setTaskForm({ ...taskForm, due_date: e.target.value })} />
          </div>
          <div className="form-group">
            <label>{t('tables.tasks.fields.priority')}</label>
            <select className="form-control" value={taskForm.priority} onChange={(e) => setTaskForm({ ...taskForm, priority: e.target.value })}>
              <option value="Low">{t('enums.taskPriority.Low')}</option><option value="Medium">{t('enums.taskPriority.Medium')}</option><option value="High">{t('enums.taskPriority.High')}</option>
            </select>
          </div>
        </div>
      </Modal>
    </>
  );
}

function HealthChart({ healthy, treatment, critical }) {
  const { t } = useTranslation();
  const total = healthy + treatment + critical;
  const canvasRef = useCanvasChart(() => {
    if (total === 0) return null;
    return {
      type: 'doughnut',
      data: { labels: [t('enums.animalHealthStatus.Healthy'), t('enums.animalHealthStatus.Under Treatment'), t('enums.animalHealthStatus.Critical')], datasets: [{ data: [healthy, treatment, critical], backgroundColor: ['#2E7D32', '#F9A825', '#D32F2F'], borderWidth: 0, spacing: 2 }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: '65%', plugins: { legend: { position: 'bottom', labels: { padding: 16, usePointStyle: true, pointStyleWidth: 10, font: { size: 12 } } } } }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [healthy, treatment, critical, t]);

  if (total === 0) return <div className="empty-state" style={{ padding: '30px 10px' }}><i className="fas fa-chart-pie"></i><h3>{t('dashboardPage.chartNoAnimalData')}</h3><p>{t('dashboardPage.chartAddAnimals')}</p></div>;
  return <div className="chart-container"><canvas ref={canvasRef}></canvas></div>;
}

function FinanceChart({ finance }) {
  const { t } = useTranslation();
  const now = new Date();
  const months = [], incomeData = [], expenseData = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(d.toLocaleString('default', { month: 'short' }));
    const mf = finance.filter((f) => { const fd = new Date(f.date); return fd.getMonth() === d.getMonth() && fd.getFullYear() === d.getFullYear(); });
    incomeData.push(mf.filter((f) => f.type === 'Income').reduce((s, f) => s + (f.amount || 0), 0));
    expenseData.push(mf.filter((f) => f.type === 'Expense').reduce((s, f) => s + (f.amount || 0), 0));
  }
  const hasData = incomeData.some((v) => v > 0) || expenseData.some((v) => v > 0);
  const canvasRef = useCanvasChart(() => {
    if (!hasData) return null;
    return {
      type: 'bar',
      data: { labels: months, datasets: [{ label: t('enums.financeType.Income'), data: incomeData, backgroundColor: '#2E7D32', borderRadius: 6 }, { label: t('dashboardPage.monthlyExpenses'), data: expenseData, backgroundColor: '#D32F2F', borderRadius: 6 }] },
      options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, grid: { color: '#F0F0F0' }, ticks: { font: { size: 11 } } }, x: { grid: { display: false }, ticks: { font: { size: 11 } } } }, plugins: { legend: { position: 'bottom', labels: { padding: 16, usePointStyle: true, font: { size: 12 } } } } }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(incomeData), JSON.stringify(expenseData), t]);

  if (!hasData) return <div className="empty-state" style={{ padding: '30px 10px' }}><i className="fas fa-chart-column"></i><h3>{t('dashboardPage.chartNoFinanceData')}</h3><p>{t('dashboardPage.chartAddFinance')}</p></div>;
  return <div className="chart-container"><canvas ref={canvasRef}></canvas></div>;
}

function ProductionChart({ production }) {
  const { t } = useTranslation();
  const now = new Date();
  const months = [], prodData = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(d.toLocaleString('default', { month: 'short' }));
    const mp = production.filter((p) => { const pd = new Date(p.production_date); return pd.getMonth() === d.getMonth() && pd.getFullYear() === d.getFullYear(); });
    prodData.push(mp.reduce((s, p) => s + (p.quantity || 0), 0));
  }
  const hasData = prodData.some((v) => v > 0);
  const canvasRef = useCanvasChart(() => {
    if (!hasData) return null;
    return {
      type: 'line',
      data: { labels: months, datasets: [{ label: t('dashboardPage.chartProductionTrend'), data: prodData, borderColor: '#1976D2', backgroundColor: 'rgba(25,118,210,0.1)', fill: true, tension: 0.4, pointRadius: 4, pointBackgroundColor: '#1976D2' }] },
      options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, grid: { color: '#F0F0F0' }, ticks: { font: { size: 11 } } }, x: { grid: { display: false }, ticks: { font: { size: 11 } } } }, plugins: { legend: { display: false } } }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(prodData), t]);

  if (!hasData) return <div className="empty-state" style={{ padding: '30px 10px' }}><i className="fas fa-chart-line"></i><h3>{t('dashboardPage.chartNoProductionData')}</h3><p>{t('dashboardPage.chartAddProduction')}</p></div>;
  return <div className="chart-container"><canvas ref={canvasRef}></canvas></div>;
}

function TaskChart({ tasks }) {
  const { t } = useTranslation();
  const pending = tasks.filter((tk) => tk.status === 'Pending').length;
  const inProgress = tasks.filter((tk) => tk.status === 'In Progress').length;
  const completed = tasks.filter((tk) => tk.status === 'Completed').length;
  const total = pending + inProgress + completed;

  const canvasRef = useCanvasChart(() => {
    if (total === 0) return null;
    return {
      type: 'doughnut',
      data: { labels: [t('enums.taskStatus.Pending'), t('enums.taskStatus.In Progress'), t('enums.taskStatus.Completed')], datasets: [{ data: [pending, inProgress, completed], backgroundColor: ['#F9A825', '#1976D2', '#2E7D32'], borderWidth: 0, spacing: 2 }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: '65%', plugins: { legend: { position: 'bottom', labels: { padding: 16, usePointStyle: true, pointStyleWidth: 10, font: { size: 12 } } } } }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, inProgress, completed, t]);

  if (total === 0) return <div className="empty-state" style={{ padding: '30px 10px' }}><i className="fas fa-clipboard-list"></i><h3>{t('dashboardPage.chartNoTasksYet')}</h3><p>{t('dashboardPage.chartAddTasks')}</p></div>;
  return <div className="chart-container"><canvas ref={canvasRef}></canvas></div>;
}
