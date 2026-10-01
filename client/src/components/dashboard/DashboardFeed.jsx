import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { QUICK_ACTIONS } from '../../../../shared/dashboardFeed';

/* The dashboard's activity cards, laid out like the CropManager dashboard:
   Recent Activity (timeline), Upcoming Events (date badges), Alerts
   (colour-coded) and Quick Actions. Data comes from shared/dashboardFeed.js
   so the mobile app shows the same items. */

function FeedCard({ title, icon, iconColor, children, scroll }) {
  return (
    <div className="card feed-card">
      <div className="card-header"><h3><i className={`fas fa-${icon}`} style={{ color: iconColor, marginRight: 8 }} />{title}</h3></div>
      <div className="card-body" style={scroll ? { maxHeight: 340, overflowY: 'auto' } : undefined}>{children}</div>
    </div>
  );
}

const Empty = ({ icon, text, tone }) => (
  <div className="feed-empty"><i className={`fas fa-${icon}`} style={tone ? { color: tone } : undefined} />{text}</div>
);

export function RecentActivity({ items }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <FeedCard title={t('dashboardFeed.recentActivity')} icon="clock" iconColor="var(--purple)" scroll>
      {items.length === 0 ? <Empty icon="inbox" text={t('dashboardFeed.noActivity')} /> : (
        <div className="activity-timeline">
          {items.map((a) => (
            <button key={a.id} type="button" className="activity-item" onClick={() => navigate(a.link)}>
              <span className={`activity-dot tone-${a.color}`}><i className={`fas fa-${a.icon}`} /></span>
              <span className="activity-text"><strong>{a.title}</strong>{a.text ? <> — {a.text}</> : null}</span>
              <span className="activity-meta">{a.date}</span>
            </button>
          ))}
        </div>
      )}
    </FeedCard>
  );
}

export function UpcomingEvents({ items }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <FeedCard title={t('dashboardFeed.upcomingEvents')} icon="calendar-check" iconColor="var(--blue)" scroll>
      {items.length === 0 ? <Empty icon="calendar" text={t('dashboardFeed.noUpcoming')} /> : items.map((e) => (
        <button key={e.id} type="button" className="upcoming-event" onClick={() => navigate(e.link)}>
          <span className="upcoming-date"><span className="day">{e.day}</span><span className="month">{e.month}</span></span>
          <span className="upcoming-info"><span className="title">{e.title}</span><span className="meta">{e.meta}</span></span>
        </button>
      ))}
    </FeedCard>
  );
}

const ALERT_TYPE = { red: 'danger', orange: 'warning', blue: 'info', purple: 'info', green: 'success' };

export function AlertsCard({ items }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <FeedCard title={t('dashboardFeed.alerts')} icon="bell" iconColor="var(--orange)" scroll>
      {items.length === 0 ? <Empty icon="circle-check" tone="var(--primary)" text={t('dashboardFeed.allClear')} /> : items.slice(0, 8).map((a) => (
        <button key={a.id} type="button" className={`alert-item alert-${ALERT_TYPE[a.color] || 'info'}`} onClick={() => navigate(a.link)}>
          <i className={`fas fa-${a.icon}`} />
          <span className="alert-content"><strong>{a.title}</strong>{a.sub}</span>
        </button>
      ))}
    </FeedCard>
  );
}

export function QuickActions() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <FeedCard title={t('dashboardFeed.quickActions')} icon="bolt" iconColor="var(--purple)">
      <div className="quick-actions-grid">
        {QUICK_ACTIONS.map((a) => (
          <button key={a.key} type="button" className="quick-action-btn" onClick={() => navigate(a.noAdd ? a.path : `${a.path}?new=1`)}>
            <i className={`fas fa-${a.icon}`} /> {t(a.labelKey)}
          </button>
        ))}
      </div>
    </FeedCard>
  );
}
