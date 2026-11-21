import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useApi } from '../../lib/api.js';
import { useChartTheme } from '../../lib/chartTheme.js';
import { lastActive } from '../../lib/team.js';
import { MiniColumns } from './MicroViz.jsx';

/* The farm manager's view of the team on the dashboard: how many entries the
   data collectors made over the last 14 days and who recorded what this week.
   With no team yet it invites the manager to add one. */
export default function TeamCard() {
  const { t, i18n } = useTranslation();
  const api = useApi();
  const navigate = useNavigate();
  const ct = useChartTheme();
  const [team, setTeam] = useState(null);

  useEffect(() => {
    let live = true;
    api.http('GET', '/team').then(({ data }) => { if (live) setTeam(data || null); });
    return () => { live = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!team) return null;
  const total = team.perDay.reduce((s, d) => s + d.count, 0);
  const dayLabel = (d) => new Date(d + 'T00:00:00').toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' });

  return (
    <div className="card team-card">
      <div className="card-header">
        <h3><i className="fas fa-people-group" style={{ color: 'var(--primary)', marginRight: 8 }} />{t('team.cardTitle')}</h3>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => navigate('/team')}>{team.members.length ? t('team.manage') : t('team.addCollector')}</button>
      </div>
      <div className="card-body">
        {team.members.length === 0 ? (
          <div className="feed-empty"><i className="fas fa-user-plus" />{t('team.cardEmpty')}</div>
        ) : (
          <div className="team-card-grid">
            <div className="team-card-chart">
              <div className="activity-chart-head"><span>{t('team.entries14')}</span><b>{total}</b></div>
              <MiniColumns values={team.perDay.map((d) => d.count)} color={ct.brand} labels={team.perDay.map((d) => dayLabel(d.date))} height={56} />
              <div className="glance-axis spread"><span>{dayLabel(team.perDay[0].date)}</span><span>{t('dashboardFeed.today')}</span></div>
            </div>
            <div className="team-card-list">
              {team.members.slice(0, 4).map((m) => (
                <div key={m.id} className="team-row">
                  <span className="team-avatar">{(m.name || m.email || '?')[0].toUpperCase()}</span>
                  <span className="team-row-main"><b>{m.name || m.email}</b><small>{t('team.lastActive', { when: lastActive(m.last, t) })}</small></span>
                  <span className="team-row-count" title={t('team.entriesWeek')}>{m.week}</span>
                </div>
              ))}
              {team.invites.length > 0 && <div className="team-note">{t('team.waitingInvites', { count: team.invites.length })}</div>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
