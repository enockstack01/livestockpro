import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useUser } from '@clerk/clerk-react';
import { useApi } from '../lib/api.js';
import { useToast } from '../lib/toast.jsx';
import { MiniColumns } from '../components/dashboard/MicroViz.jsx';
import { StatusBadge, PriorityBadge, fmtDate } from '../lib/badges.jsx';
import { useAccount } from '../components/AccountGate.jsx';
import { greeting } from '../../../shared/navigation';
import { relativeDay } from '../../../shared/dashboardFeed';
import { COLLECTOR_KINDS, animalsToCheck, computeCollectorStats, openTasks } from '../../../shared/teamDashboard';
import '../dashboard.css';

/* The data collector's dashboard: a field-work screen, not an overview.
   Today's count up front, one big button per kind of record, the open tasks
   with a one tap "done", animals that need a look, and what they entered
   recently. No money, reports or herd analytics (those are the manager's). */
export default function CollectorDashboard() {
  const { t, i18n } = useTranslation();
  const api = useApi();
  const navigate = useNavigate();
  const showToast = useToast();
  const { user } = useUser();
  const { account } = useAccount();
  const [data, setData] = useState(null);

  async function load() {
    const [a, h, b, f, p, k] = await Promise.all([
      api.list('animals'), api.list('health_records'), api.list('breeding_records'),
      api.list('feeding_records'), api.list('production_records'), api.list('tasks', { order: 'due_date.asc' })
    ]);
    setData({ animals: a.data || [], health: h.data || [], breeding: b.data || [], feeding: f.data || [], production: p.data || [], tasks: k.data || [] });
  }
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const stats = useMemo(() => (data && user ? computeCollectorStats(data, user.id) : null), [data, user]);
  if (!data || !stats) return null;

  const tasks = openTasks(data.tasks);
  const check = animalsToCheck(data.animals);
  const dayName = (d) => new Date(d.date + 'T00:00:00').toLocaleDateString(i18n.language, { weekday: 'short' });

  async function markDone(task) {
    const { error } = await api.update('tasks', task.id, { status: 'Completed' });
    if (error) { showToast(error.message, 'error'); return; }
    showToast(t('collectorDash.taskDone'), 'success');
    load();
  }

  return (
    <div className="dashboard collector-dash">
      <div className="page-header">
        <div><h1>{greeting(t, user && user.firstName)}</h1><p>{t('collectorDash.subtitle')}</p></div>
        <span className="role-chip"><i className="fas fa-clipboard-list" /> {t('collectorDash.role')}</span>
      </div>

      <div className="cd-hero">
        <div className="cd-hero-main">
          <span className="cd-eyebrow">{account.farm ? t('collectorDash.recordingFor', { farm: account.farm }) : t('collectorDash.recording')}</span>
          <div className="cd-count"><b>{stats.today}</b><span>{t('collectorDash.entriesToday', { count: stats.today })}</span></div>
          <div className="cd-hero-facts">
            <span><i className="fas fa-calendar-week" /> {t('collectorDash.thisWeek', { count: stats.week })}</span>
            {stats.streak > 1 && <span className="cd-streak"><i className="fas fa-fire" /> {t('collectorDash.streak', { count: stats.streak })}</span>}
          </div>
        </div>
        <div className="cd-hero-chart">
          <MiniColumns values={stats.perDay.map((d) => d.count)} color="#fff" labels={stats.perDay.map(dayName)} height={64} />
          <div className="cd-hero-axis">{stats.perDay.map((d) => <span key={d.date}>{dayName(d).slice(0, 2)}</span>)}</div>
        </div>
      </div>

      <h2 className="cd-section">{t('collectorDash.whatRecording')}</h2>
      <div className="cd-tiles">
        {COLLECTOR_KINDS.map((k) => (
          <button key={k.key} type="button" className="cd-tile" onClick={() => navigate(`${k.path}?new=1`)}>
            <span className="cd-tile-icon"><i className={`fas fa-${k.icon}`} /></span>
            <span className="cd-tile-label">{t(`collectorDash.add.${k.kind}`)}</span>
            {stats.byKind[k.kind] ? <span className="cd-tile-count" title={t('collectorDash.entriesToday', { count: stats.byKind[k.kind] })}>{stats.byKind[k.kind]}</span> : null}
          </button>
        ))}
      </div>

      <div className="feed-grid">
        <div className="card feed-card">
          <div className="card-header"><h3><i className="fas fa-list-check" style={{ color: 'var(--primary)', marginRight: 8 }} />{t('collectorDash.myTasks')}</h3>{tasks.length > 0 && <span className="feed-count">{tasks.length}</span>}</div>
          <div className="card-body">
            {tasks.length === 0 ? <div className="feed-empty"><i className="fas fa-circle-check" style={{ color: 'var(--primary)' }} />{t('collectorDash.noTasks')}</div> : (
              <div className="feed-rows">
                {tasks.map((task) => (
                  <div key={task.id} className="feed-row cd-task">
                    <button type="button" className="cd-check" onClick={() => markDone(task)} title={t('collectorDash.markDone')} aria-label={t('collectorDash.markDone')}><i className="fas fa-check" /></button>
                    <span className="feed-row-main">
                      <span className="feed-row-name">{task.title}</span>
                      <span className="feed-row-sub">{task.due_date ? t('collectorDash.due', { date: fmtDate(task.due_date) }) : t('collectorDash.noDueDate')}</span>
                    </span>
                    <span className="feed-row-end"><PriorityBadge priority={task.priority || 'Medium'} /></span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="card feed-card">
          <div className="card-header"><h3><i className="fas fa-triangle-exclamation" style={{ color: 'var(--orange)', marginRight: 8 }} />{t('collectorDash.toCheck')}</h3>{check.length > 0 && <span className="feed-count danger">{check.length}</span>}</div>
          <div className="card-body">
            {check.length === 0 ? <div className="feed-empty"><i className="fas fa-heart-circle-check" style={{ color: 'var(--primary)' }} />{t('collectorDash.allWell')}</div> : (
              <div className="feed-rows">
                {check.map((a) => (
                  <button key={a.id} type="button" className="feed-row" onClick={() => navigate('/health?new=1')}>
                    <span className="feed-chip tone-green"><i className="fas fa-cow" /></span>
                    <span className="feed-row-main"><span className="feed-row-name">{a.tag_id || a.name}</span><span className="feed-row-sub">{[a.species, a.location].filter(Boolean).join(' · ')}</span></span>
                    <span className="feed-row-end"><StatusBadge status={a.health_status} /></span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="card feed-card">
        <div className="card-header"><h3><i className="fas fa-clock-rotate-left" style={{ color: 'var(--primary)', marginRight: 8 }} />{t('collectorDash.myEntries')}</h3></div>
        <div className="card-body">
          {stats.recent.length === 0 ? <div className="feed-empty"><i className="fas fa-inbox" />{t('collectorDash.noEntries')}</div> : (
            <div className="feed-rows">
              {stats.recent.map((r) => (
                <button key={r.id} type="button" className="feed-row" onClick={() => navigate(r.path)}>
                  <span className={`feed-chip tone-${r.tone}`}><i className={`fas fa-${r.icon}`} /></span>
                  <span className="feed-row-main"><span className="feed-row-name">{r.name || t(r.labelKey)}</span><span className="feed-row-sub">{t(r.labelKey)}</span></span>
                  <span className="feed-row-end"><span className="feed-row-time">{relativeDay(r.iso, t)}</span></span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
