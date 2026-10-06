import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useChartTheme } from '../../lib/chartTheme.js';
import { QUICK_ACTIONS, UPCOMING_WINDOW_DAYS, relativeDay, summarizeAlerts } from '../../../../shared/dashboardFeed';
import { MiniColumns } from './MicroViz.jsx';

/* The dashboard's activity cards, built to be scanned rather than read:
   Recent Activity (weekly chart + compact rows with signed amounts),
   Upcoming Events (30-day timeline + date cards), Alerts (count chips that
   filter a list of late/soon badges) and Quick Actions (launcher grid).
   Data from shared/dashboardFeed.js; the mobile app
   (mobile/src/screens/dashboard/DashboardFeed.js) shows the same. */

function FeedCard({ title, icon, iconColor, right, children }) {
  return (
    <div className="card feed-card">
      <div className="card-header">
        <h3><i className={`fas fa-${icon}`} style={{ color: iconColor, marginRight: 8 }} />{title}</h3>
        {right}
      </div>
      <div className="card-body">{children}</div>
    </div>
  );
}

const Empty = ({ icon, text, tone }) => (
  <div className="feed-empty"><i className={`fas fa-${icon}`} style={tone ? { color: tone } : undefined} />{text}</div>
);

export function RecentActivity({ activity }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const ct = useChartTheme();
  const { items, weeks } = activity;
  const total = weeks.reduce((s, w) => s + w.count, 0);
  return (
    <FeedCard title={t('dashboardFeed.recentActivity')} icon="clock-rotate-left" iconColor="var(--purple)">
      {total > 0 && (
        <div className="activity-chart">
          <div className="activity-chart-head"><span>{t('dashboardFeed.last12Weeks')}</span><b>{total}</b></div>
          <MiniColumns values={weeks.map((w) => w.count)} color={ct.brand} labels={weeks.map((w) => w.label)} height={44} />
          <div className="glance-axis spread"><span>{weeks[0].label}</span><span>{weeks[weeks.length - 1].label}</span></div>
        </div>
      )}
      {items.length === 0 ? <Empty icon="inbox" text={t('dashboardFeed.noActivity')} /> : (
        <div className="feed-rows">
          {items.map((a) => (
            <button key={a.id} type="button" className="feed-row" onClick={() => navigate(a.link)} title={`${a.name} · ${a.sub} · ${a.date}`}>
              <span className={`feed-chip tone-${a.color}`}><i className={`fas fa-${a.icon}`} /></span>
              <span className="feed-row-main">
                <span className="feed-row-name">{a.name}</span>
                <span className="feed-row-sub">{a.sub}</span>
              </span>
              <span className="feed-row-end">
                {a.value && <span className={`feed-value ${a.valueTone}`}>{a.value}</span>}
                <span className="feed-row-time">{relativeDay(a.iso, t)}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </FeedCard>
  );
}

/* One timeline stop per day: its date above, and how many events fall on
   it inside the dot when there is more than one. */
function timelineStops(items) {
  const byDay = new Map();
  items.forEach((e) => {
    const s = byDay.get(e.daysLeft) || { daysLeft: e.daysLeft, day: e.day, month: e.month, color: e.color, count: 0, names: [] };
    s.count++;
    s.names.push(e.name);
    if (s.color !== e.color) s.color = 'blue';
    byDay.set(e.daysLeft, s);
  });
  return [...byDay.values()];
}

export function UpcomingEvents({ items }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const stops = timelineStops(items);
  const countdown = (d) => (d === 0 ? t('dashboardFeed.today') : t('dashboardFeed.inDays', { count: d }));
  return (
    <FeedCard title={t('dashboardFeed.upcomingEvents')} icon="calendar-days" iconColor="var(--blue)" right={items.length > 0 && <span className="feed-count">{items.length}</span>}>
      {items.length === 0 ? <Empty icon="calendar" text={t('dashboardFeed.noUpcoming')} /> : (
        <>
          <div className="timeline" aria-hidden="true">
            <div className="timeline-track">
              {stops.map((s) => (
                <span key={s.daysLeft} className={`timeline-stop tone-${s.color}`} style={{ left: `${(s.daysLeft / UPCOMING_WINDOW_DAYS) * 100}%` }} title={`${s.day} ${s.month}: ${s.names.join(', ')}`}>
                  <small>{s.day}</small>
                  <span className="timeline-dot">{s.count > 1 ? s.count : ''}</span>
                </span>
              ))}
            </div>
            <div className="timeline-scale"><span>{t('dashboardFeed.today')}</span><span>+15</span><span>+{UPCOMING_WINDOW_DAYS}</span></div>
          </div>
          <div className="event-cards">
            {items.map((e) => (
              <button key={e.id} type="button" className={`event-card tone-${e.color}`} onClick={() => navigate(e.link)} title={e.title}>
                <span className="event-card-top">
                  <span className="event-date"><b>{e.day}</b><small>{e.month}</small></span>
                  <span className={`feed-chip tone-${e.color}`}><i className={`fas fa-${e.icon}`} /></span>
                </span>
                <span className="event-name">{e.name}</span>
                <span className="event-kind">{t(e.labelKey)}</span>
                <span className="event-countdown">{countdown(e.daysLeft)}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </FeedCard>
  );
}

export function AlertsCard({ items }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [kind, setKind] = useState('');
  const kinds = useMemo(() => summarizeAlerts(items), [items]);
  const shown = (kind ? items.filter((a) => a.kind === kind) : items).slice(0, 6);
  const badge = (a) => {
    if (a.days == null) return null;
    if (a.days < 0) return <span className="alert-badge late">{t('dashboardFeed.daysLate', { count: -a.days })}</span>;
    return <span className="alert-badge soon">{a.days === 0 ? t('dashboardFeed.today') : t('dashboardFeed.inDays', { count: a.days })}</span>;
  };
  return (
    <FeedCard title={t('dashboardFeed.alerts')} icon="bell" iconColor="var(--orange)" right={items.length > 0 && <span className="feed-count danger">{items.length}</span>}>
      {items.length === 0 ? <Empty icon="circle-check" tone="var(--primary)" text={t('dashboardFeed.allClear')} /> : (
        <>
          <div className="alert-kinds" role="tablist">
            {kinds.map((k) => (
              <button key={k.key} type="button" role="tab" aria-selected={kind === k.key} className={`alert-kind tone-${k.color}${kind === k.key ? ' active' : ''}`} onClick={() => setKind(kind === k.key ? '' : k.key)}>
                <i className={`fas fa-${k.icon}`} />
                <b>{k.count}</b>
                <span>{t(`dashboardFeed.alertKinds.${k.key}`)}</span>
              </button>
            ))}
          </div>
          <div className="feed-rows">
            {shown.map((a) => (
              <button key={a.id} type="button" className="feed-row" onClick={() => navigate(a.link)} title={`${a.title}, ${a.sub}`}>
                <span className={`feed-chip tone-${a.color}`}><i className={`fas fa-${a.icon}`} /></span>
                <span className="feed-row-main">
                  <span className="feed-row-name">{a.name}</span>
                  <span className="feed-row-sub">{t(`dashboardFeed.alertKinds.${a.kind}`)}</span>
                </span>
                <span className="feed-row-end">{badge(a)}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </FeedCard>
  );
}

export function QuickActions() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <FeedCard title={t('dashboardFeed.quickActions')} icon="bolt" iconColor="var(--purple)">
      <div className="launcher-grid">
        {QUICK_ACTIONS.map((a) => (
          <button key={a.key} type="button" className="launcher-btn" onClick={() => navigate(a.noAdd ? a.path : `${a.path}?new=1`)} title={t(a.fullKey)} aria-label={t(a.fullKey)}>
            <span className={`launcher-icon tone-${a.tone}`}>
              <i className={`fas fa-${a.icon}`} />
              {!a.noAdd && <span className="launcher-plus"><i className="fas fa-plus" /></span>}
            </span>
            <span className="launcher-label">{t(a.labelKey)}</span>
          </button>
        ))}
      </div>
    </FeedCard>
  );
}
