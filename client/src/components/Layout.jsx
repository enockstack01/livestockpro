import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useClerk, useUser } from '@clerk/clerk-react';
import { useTranslation } from 'react-i18next';
import { useApi } from '../lib/api.js';
import { TopbarSearchProvider, useTopbarSearchBox } from '../lib/topbarSearch.jsx';
import { isOverdueTask } from '../../../shared/businessRules';

const NAV_ITEMS = [
  { to: '/dashboard', icon: 'fa-gauge-high', labelKey: 'nav.dashboard' },
  { to: '/animals', icon: 'fa-cow', labelKey: 'nav.animals' },
  { to: '/health', icon: 'fa-stethoscope', labelKey: 'nav.health' },
  { to: '/feeding', icon: 'fa-wheat-awn', labelKey: 'nav.feeding' },
  { to: '/breeding', icon: 'fa-venus-mars', labelKey: 'nav.breeding' },
  { to: '/production', icon: 'fa-gauge', labelKey: 'nav.production' },
  { to: '/finance', icon: 'fa-coins', labelKey: 'nav.finance' },
  { to: '/tasks', icon: 'fa-list-check', labelKey: 'nav.tasks' },
  { to: '/reports', icon: 'fa-chart-bar', labelKey: 'nav.reports' },
  { to: '/settings', icon: 'fa-gear', labelKey: 'nav.settings' }
];

const NOTIF_ORDER = { red: 0, orange: 1, blue: 2, purple: 3, green: 4 };

/* Resolved server-side (Clerk publicMetadata.role, with an env-var bootstrap
   fallback) rather than trusted from the client — this only drives UI, the
   backend re-checks on every /api/admin/* call regardless. */
function useRole() {
  const api = useApi();
  const [role, setRole] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api.myRole().then((res) => { if (!cancelled) setRole((res.data && res.data.role) || 'user'); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return role;
}

function useNotifications(t) {
  const api = useApi();
  const [items, setItems] = useState([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [r1, r2, r3, r4] = await Promise.all([
        api.list('tasks'),
        api.list('animals'),
        api.list('health_records'),
        api.list('breeding_records')
      ]);
      const tasks = r1.data || [];
      const animals = r2.data || [];
      const health = r3.data || [];
      const breeding = r4.data || [];

      const notifItems = [];
      const now = new Date();

      tasks.forEach((tk) => {
        if (isOverdueTask(tk)) {
          notifItems.push({ id: 'task-overdue-' + tk.id, icon: 'fa-clock', color: 'red', title: t('layout.notifOverdueTitle', { title: tk.title }), sub: t('layout.notifOverdueSub', { date: new Date(tk.due_date).toLocaleDateString() }), link: '/tasks' });
        }
      });
      animals.forEach((a) => {
        if (a.health_status === 'Critical') {
          notifItems.push({ id: 'animal-critical-' + a.id, icon: 'fa-triangle-exclamation', color: 'red', title: t('layout.notifCriticalTitle', { tag: a.tag_id }), sub: t('layout.notifCriticalSub'), link: '/health' });
        }
      });
      animals.forEach((a) => {
        if (a.health_status === 'Under Treatment') {
          notifItems.push({ id: 'animal-treatment-' + a.id, icon: 'fa-stethoscope', color: 'orange', title: t('layout.notifTreatmentTitle', { tag: a.tag_id }), sub: t('layout.notifTreatmentSub'), link: '/health' });
        }
      });
      health.forEach((h) => {
        if (h.next_check_date) {
          const daysUntil = Math.ceil((new Date(h.next_check_date) - now) / (1000 * 60 * 60 * 24));
          if (daysUntil <= 3 && daysUntil >= 0 && h.status !== 'Recovered') {
            notifItems.push({ id: 'health-due-' + h.id, icon: 'fa-calendar-check', color: 'blue', title: t('layout.notifCheckupDueTitle', { tag: h.tag_id || '—' }), sub: daysUntil === 0 ? t('layout.notifToday') : t('layout.notifInDaysWithNote', { count: daysUntil, note: h.disease || '' }), link: '/health' });
          }
          if (daysUntil < 0 && h.status !== 'Recovered') {
            notifItems.push({ id: 'health-missed-' + h.id, icon: 'fa-calendar-xmark', color: 'red', title: t('layout.notifMissedTitle', { tag: h.tag_id || '—' }), sub: t('layout.notifMissedSub', { count: Math.abs(daysUntil) }), link: '/health' });
          }
        }
      });
      breeding.forEach((b) => {
        if (b.expected_birth_date && b.pregnancy_status === 'Pregnant') {
          const daysUntil = Math.ceil((new Date(b.expected_birth_date) - now) / (1000 * 60 * 60 * 24));
          if (daysUntil <= 7 && daysUntil >= 0) {
            notifItems.push({ id: 'breeding-birth-' + b.id, icon: 'fa-paw', color: 'purple', title: t('layout.notifBirthTitle', { tag: b.tag_id || '—' }), sub: daysUntil === 0 ? t('layout.notifToday') : t('layout.notifBirthInDays', { count: daysUntil }), link: '/breeding' });
          }
        }
      });

      notifItems.sort((a, b) => (NOTIF_ORDER[a.color] ?? 5) - (NOTIF_ORDER[b.color] ?? 5));
      if (!cancelled) setItems(notifItems);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t]);

  return items;
}

/* Tracks which notifications the user has dismissed, persisted per-account
   in localStorage so "read" status survives a reload but never leaks
   between different accounts sharing a browser. */
function useReadNotifications(userId) {
  const storageKey = userId ? `livestockpro_read_notifs_${userId}` : null;
  const [readIds, setReadIds] = useState(new Set());

  useEffect(() => {
    if (!storageKey) { setReadIds(new Set()); return; }
    try {
      const raw = localStorage.getItem(storageKey);
      setReadIds(raw ? new Set(JSON.parse(raw)) : new Set());
    } catch (e) {
      setReadIds(new Set());
    }
  }, [storageKey]);

  function persist(nextSet) {
    setReadIds(nextSet);
    if (storageKey) {
      try { localStorage.setItem(storageKey, JSON.stringify([...nextSet])); } catch (e) { /* storage unavailable */ }
    }
  }

  function markRead(id) {
    if (readIds.has(id)) return;
    persist(new Set(readIds).add(id));
  }
  function markAllRead(ids) {
    const next = new Set(readIds);
    ids.forEach((id) => next.add(id));
    persist(next);
  }

  return { readIds, markRead, markAllRead };
}

function TopbarSearchInput() {
  const { config, value, setValue } = useTopbarSearchBox();
  if (!config) return null;
  return (
    <div className="search-box">
      <i className="fas fa-search"></i>
      <input
        type="text"
        placeholder={config.placeholder}
        value={value}
        onChange={(e) => { setValue(e.target.value); config.onChange(e.target.value); }}
      />
    </div>
  );
}

function LayoutInner() {
  const { t } = useTranslation();
  const { user } = useUser();
  const { signOut } = useClerk();
  const navigate = useNavigate();
  const notifItems = useNotifications(t);
  const { readIds, markRead, markAllRead } = useReadNotifications(user?.id);
  const unreadCount = notifItems.filter((n) => !readIds.has(n.id)).length;
  const role = useRole();
  const isAdmin = role === 'admin' || role === 'super_admin';
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  const email = user?.primaryEmailAddress?.emailAddress || '';
  const displayName = email.split('@')[0] || 'User';
  const initials = email.substring(0, 2).toUpperCase() || 'U';
  const imageUrl = user?.imageUrl;

  async function handleLogout(e) {
    e.preventDefault();
    await signOut();
    navigate('/');
  }

  return (
    <>
      <aside className={`sidebar${sidebarOpen ? ' open' : ''}`}>
        <div className="sidebar-header">
          <div className="sidebar-logo"><i className="fas fa-cow"></i><span>LivestockPro</span></div>
          <button className="sidebar-close" onClick={() => setSidebarOpen(false)}><i className="fas fa-xmark"></i></button>
        </div>
        <nav className="sidebar-nav">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.to} to={item.to} className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')} onClick={() => setSidebarOpen(false)}>
              <i className={`fas ${item.icon}`}></i> {t(item.labelKey)}
            </NavLink>
          ))}
          {isAdmin && (
            <NavLink to="/admin" className={({ isActive }) => 'nav-item nav-item-admin' + (isActive ? ' active' : '')} onClick={() => setSidebarOpen(false)}>
              <i className="fas fa-user-shield"></i> {t('layout.adminPanel')}
            </NavLink>
          )}
          {isAdmin && (
            <NavLink to="/onehealth" className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')} onClick={() => setSidebarOpen(false)}>
              <i className="fas fa-shield-virus" style={{ color: '#FFD54F' }}></i> {t('layout.oneHealth')}
            </NavLink>
          )}
          <a href="#" className="nav-item logout-item" onClick={handleLogout}>
            <i className="fas fa-right-from-bracket"></i> {t('layout.logout')}
          </a>
        </nav>
      </aside>
      <div className={`sidebar-overlay${sidebarOpen ? ' show' : ''}`} onClick={() => setSidebarOpen(false)}></div>

      <header className="topbar">
        <div className="topbar-left">
          <button className="menu-toggle" onClick={() => setSidebarOpen(true)}><i className="fas fa-bars"></i></button>
          <TopbarSearchInput />
        </div>
        <div className="topbar-right">
          <div className="notif-wrapper">
            <button className="topbar-btn" style={{ position: 'relative' }} onClick={(e) => { e.stopPropagation(); setNotifOpen((v) => !v); }}>
              <i className="fas fa-bell"></i>
              <span className="badge-dot" style={{ display: unreadCount > 0 ? 'block' : 'none' }}></span>
              <span style={{
                position: 'absolute', top: 2, right: 2, minWidth: 16, height: 16, borderRadius: 8,
                background: 'var(--red)', color: '#fff', fontSize: 9, fontWeight: 700,
                display: unreadCount > 0 ? 'flex' : 'none', alignItems: 'center', justifyContent: 'center', padding: '0 4px'
              }}>{unreadCount}</span>
            </button>
            <div className={`notif-dropdown${notifOpen ? ' show' : ''}`}>
              <div className="notif-header">
                <h4><i className="fas fa-bell" style={{ marginRight: 6, color: 'var(--primary)' }}></i> {t('layout.notifications')}</h4>
                <span onClick={() => markAllRead(notifItems.map((n) => n.id))}>{t('layout.markAllRead')}</span>
              </div>
              <div className="notif-list">
                {notifItems.length === 0 ? (
                  <div className="notif-empty"><i className="fas fa-bell-slash"></i><p>{t('layout.noNotifications')}</p></div>
                ) : notifItems.map((n) => (
                  <NavLink key={n.id} to={n.link} className={`notif-item${readIds.has(n.id) ? ' read' : ''}`} onClick={() => { markRead(n.id); setNotifOpen(false); }}>
                    <div className={`notif-icon ${n.color}`}><i className={`fas ${n.icon}`}></i></div>
                    <div className="notif-text"><p>{n.title}</p><span>{n.sub}</span></div>
                  </NavLink>
                ))}
              </div>
              <div className="notif-footer"><NavLink to="/tasks" onClick={() => setNotifOpen(false)}>{t('layout.viewAllTasks')}</NavLink></div>
            </div>
          </div>
          <div className="user-menu">
            <div className="user-avatar" style={{ overflow: 'hidden' }}>
              {imageUrl ? <img src={imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials}
            </div>
            <span className="user-name">{displayName}</span>
          </div>
        </div>
      </header>

      <main className="main-content">
        <Outlet context={{ role }} />
      </main>
    </>
  );
}

export default function Layout() {
  return (
    <TopbarSearchProvider>
      <LayoutInner />
    </TopbarSearchProvider>
  );
}
