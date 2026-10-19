import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useClerk, useUser } from '@clerk/clerk-react';
import { useTranslation } from 'react-i18next';
import { useApi } from '../lib/api.js';
import { TopbarSearchProvider, useTopbarSearchBox } from '../lib/topbarSearch.jsx';
import { useTheme } from '../theme/ThemeProvider.jsx';
import { isOverdueTask } from '../../../shared/businessRules';
import { NAV_SECTIONS, ORG_NAV_SECTIONS } from '../../../shared/navigation';
import { ConsentRequest, useMyOrganization } from './org/MyOrganization.jsx';
import { accountDisplayName } from '../../../shared/account';
import { useAccount } from './AccountGate.jsx';
import Modal from './Modal.jsx';


const NOTIF_ORDER = { red: 0, orange: 1, blue: 2, purple: 3, green: 4 };

/* Server notifications (organization approvals, farmer limit warnings,
   joins and leaves), stored as a key plus values and shown here in the
   user's language. */
const SERVER_NOTIF = {
  orgApproved: ['fa-circle-check', 'green'], orgSuspended: ['fa-circle-pause', 'red'], orgReactivated: ['fa-circle-play', 'green'],
  orgLimitChanged: ['fa-gauge', 'blue'], orgUsage80: ['fa-gauge-high', 'orange'], orgUsage100: ['fa-gauge-high', 'red'],
  farmerJoined: ['fa-user-plus', 'green'], farmerLeft: ['fa-user-minus', 'orange'], farmerRemoved: ['fa-user-minus', 'orange'],
  orgInvite: ['fa-people-group', 'blue'], staffInvite: ['fa-envelope-open-text', 'blue']
};

function useNotifications(t, isOrg) {
  const api = useApi();
  const [items, setItems] = useState([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const serverRes = await api.http('GET', '/notifications');
      const server = (serverRes.data || []).map((n) => {
        const [icon, color] = SERVER_NOTIF[n.key] || ['fa-bell', 'blue'];
        return { id: 'srv-' + n.id, serverId: n.id, serverRead: Boolean(n.read_at), icon, color, title: t(`notifications.${n.key}.title`, n.vars || {}), sub: t(`notifications.${n.key}.body`, n.vars || {}), link: n.link || '/dashboard' };
      });
      if (isOrg) { if (!cancelled) setItems(server); return; }
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
      if (!cancelled) setItems([...server, ...notifItems]);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, isOrg]);

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
    } catch {
      setReadIds(new Set());
    }
  }, [storageKey]);

  function persist(nextSet) {
    setReadIds(nextSet);
    if (storageKey) {
      try { localStorage.setItem(storageKey, JSON.stringify([...nextSet])); } catch { /* storage unavailable */ }
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
  const { scheme, setThemePreference } = useTheme();
  const { user } = useUser();
  const { signOut } = useClerk();
  const navigate = useNavigate();
  const { account } = useAccount();
  const isOrg = account.kind === 'organization';
  const orgRole = account.organization && account.organization.as === 'member' ? account.organization.role : null;
  const notifItems = useNotifications(t, isOrg);
  const { readIds: localRead, markRead: markLocal, markAllRead: markAllLocal } = useReadNotifications(user?.id);
  const readIds = new Set([...localRead, ...notifItems.filter((n) => n.serverRead).map((n) => n.id)]);
  const api = useApi();
  const markRead = (id) => { markLocal(id); const n = notifItems.find((x) => x.id === id); if (n && n.serverId) api.http('POST', '/notifications/read', { ids: [n.serverId] }); };
  const markAllRead = (ids) => { markAllLocal(ids); const sids = notifItems.filter((n) => n.serverId && ids.includes(n.id)).map((n) => n.serverId); if (sids.length) api.http('POST', '/notifications/read', { ids: sids }); };
  const unreadCount = notifItems.filter((n) => !readIds.has(n.id)).length;
  const myOrg = useMyOrganization();
  /* Resolved server-side (Clerk publicMetadata.role, with an env-var bootstrap
     fallback) and delivered with the account by AccountGate — this only
     drives UI, the backend re-checks on every /api/admin/* call regardless. */
  const role = account.role || 'user';
  const isAdmin = role === 'admin' || role === 'super_admin';
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  const displayName = accountDisplayName(t, account, role);
  const initials = (displayName[0] || 'U').toUpperCase();
  const imageUrl = user?.imageUrl;

  const [signOutOpen, setSignOutOpen] = useState(false);
  async function handleLogout() {
    setSignOutOpen(false);
    await signOut();
    navigate('/');
  }

  return (
    <>
      <aside className={`sidebar${sidebarOpen ? ' open' : ''}`}>
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <img className="sidebar-app-icon" src="/icon-192.png" alt="" width="34" height="34" />
            <span>LivestockPro</span>
          </div>
          <button className="sidebar-close" onClick={() => setSidebarOpen(false)}><i className="fas fa-xmark"></i></button>
        </div>
        <nav className="sidebar-nav">
          {(isOrg ? ORG_NAV_SECTIONS : NAV_SECTIONS).filter((section) => !section.adminOnly || isAdmin).map((section) => (
            <div key={section.labelKey || 'main'} className="nav-section">
              {section.labelKey && <div className="nav-section-label">{t(section.labelKey)}</div>}
              {section.items.filter((item) => !item.roles || item.roles.includes(orgRole)).map((item) => (
                <NavLink key={item.key} to={item.path} end={item.path === '/organization'} className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')} onClick={() => setSidebarOpen(false)}>
                  <i className={`fas fa-${item.icon}`} style={item.accent ? { color: item.accent } : undefined}></i> {t(item.labelKey)}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        {/* Sign out lives apart from the features, in the sidebar footer. */}
        <div className="sidebar-footer">
          <button type="button" className="nav-item logout-item" onClick={() => { setSidebarOpen(false); setSignOutOpen(true); }}>
            <i className="fas fa-right-from-bracket"></i> {t('nav.signOut')}
          </button>
          <div className="sidebar-byline">{t('brand.byline')}</div>
        </div>
      </aside>
      <div className={`sidebar-overlay${sidebarOpen ? ' show' : ''}`} onClick={() => setSidebarOpen(false)}></div>

      <header className="topbar">
        <div className="topbar-left">
          <button className="menu-toggle" onClick={() => setSidebarOpen(true)}><i className="fas fa-bars"></i></button>
          <TopbarSearchInput />
        </div>
        <div className="topbar-right">
          <button
            className="topbar-btn"
            title={t('layout.toggleTheme')}
            aria-label={t('layout.toggleTheme')}
            onClick={() => setThemePreference(scheme === 'dark' ? 'light' : 'dark')}
          >
            <i className={`fas ${scheme === 'dark' ? 'fa-sun' : 'fa-moon'}`}></i>
          </button>
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
              {!isOrg ? <div className="notif-footer"><NavLink to="/tasks" onClick={() => setNotifOpen(false)}>{t('layout.viewAllTasks')}</NavLink></div> : null}
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
        <Outlet context={{ role, requestSignOut: () => setSignOutOpen(true) }} />
        {!isOrg ? <ConsentRequest mine={myOrg.data} onAnswered={myOrg.reload} /> : null}
      </main>

      <Modal
        open={signOutOpen} onClose={() => setSignOutOpen(false)} title={t('confirmDialogs.signOutTitle')} maxWidth={420}
        footer={<><button className="btn btn-secondary" onClick={() => setSignOutOpen(false)}>{t('common.cancel')}</button><button className="btn btn-danger" onClick={handleLogout}><i className="fas fa-right-from-bracket"></i> {t('nav.signOut')}</button></>}
      >
        <p className="text-muted">{t('confirmDialogs.signOutMessage')}</p>
      </Modal>
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
