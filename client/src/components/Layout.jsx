import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useClerk, useUser } from '@clerk/clerk-react';
import { useApi } from '../lib/api.js';
import { TopbarSearchProvider, useTopbarSearchBox } from '../lib/topbarSearch.jsx';

const NAV_ITEMS = [
  { to: '/dashboard', icon: 'fa-gauge-high', label: 'Dashboard' },
  { to: '/animals', icon: 'fa-cow', label: 'Animals' },
  { to: '/health', icon: 'fa-stethoscope', label: 'Health Records' },
  { to: '/feeding', icon: 'fa-wheat-awn', label: 'Feeding' },
  { to: '/breeding', icon: 'fa-venus-mars', label: 'Breeding' },
  { to: '/production', icon: 'fa-gauge', label: 'Production' },
  { to: '/finance', icon: 'fa-coins', label: 'Finance' },
  { to: '/tasks', icon: 'fa-list-check', label: 'Tasks' },
  { to: '/reports', icon: 'fa-chart-bar', label: 'Reports' },
  { to: '/settings', icon: 'fa-gear', label: 'Settings' }
];

const NOTIF_ORDER = { red: 0, orange: 1, blue: 2, purple: 3, green: 4 };

function useNotifications() {
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

      tasks.forEach((t) => {
        if (t.due_date && t.status !== 'Completed' && new Date(t.due_date) < now) {
          notifItems.push({ icon: 'fa-clock', color: 'red', title: 'Overdue: ' + t.title, sub: 'Was due ' + new Date(t.due_date).toLocaleDateString(), link: '/tasks' });
        }
      });
      animals.forEach((a) => {
        if (a.health_status === 'Critical') {
          notifItems.push({ icon: 'fa-triangle-exclamation', color: 'red', title: 'Critical: ' + a.tag_id, sub: 'Animal needs immediate attention', link: '/health' });
        }
      });
      animals.forEach((a) => {
        if (a.health_status === 'Under Treatment') {
          notifItems.push({ icon: 'fa-stethoscope', color: 'orange', title: 'Treatment: ' + a.tag_id, sub: 'Currently under treatment', link: '/health' });
        }
      });
      health.forEach((h) => {
        if (h.next_check_date) {
          const daysUntil = Math.ceil((new Date(h.next_check_date) - now) / (1000 * 60 * 60 * 24));
          if (daysUntil <= 3 && daysUntil >= 0 && h.status !== 'Recovered') {
            notifItems.push({ icon: 'fa-calendar-check', color: 'blue', title: 'Check-up due: ' + (h.tag_id || '—'), sub: daysUntil === 0 ? 'Today!' : 'In ' + daysUntil + ' day' + (daysUntil > 1 ? 's' : '') + ' — ' + (h.disease || ''), link: '/health' });
          }
          if (daysUntil < 0 && h.status !== 'Recovered') {
            notifItems.push({ icon: 'fa-calendar-xmark', color: 'red', title: 'Missed check-up: ' + (h.tag_id || '—'), sub: 'Was due ' + Math.abs(daysUntil) + ' day' + (Math.abs(daysUntil) > 1 ? 's' : '') + ' ago', link: '/health' });
          }
        }
      });
      breeding.forEach((b) => {
        if (b.expected_birth_date && b.pregnancy_status === 'Pregnant') {
          const daysUntil = Math.ceil((new Date(b.expected_birth_date) - now) / (1000 * 60 * 60 * 24));
          if (daysUntil <= 7 && daysUntil >= 0) {
            notifItems.push({ icon: 'fa-baby', color: 'purple', title: 'Expected birth: ' + (b.tag_id || '—'), sub: daysUntil === 0 ? 'Today!' : 'In ' + daysUntil + ' day' + (daysUntil > 1 ? 's' : ''), link: '/breeding' });
          }
        }
      });

      notifItems.sort((a, b) => (NOTIF_ORDER[a.color] ?? 5) - (NOTIF_ORDER[b.color] ?? 5));
      if (!cancelled) setItems(notifItems);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return items;
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
  const { user } = useUser();
  const { signOut } = useClerk();
  const navigate = useNavigate();
  const notifItems = useNotifications();
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
          <div className="sidebar-logo"><i className="fas fa-leaf"></i><span>LivestockPro</span></div>
          <button className="sidebar-close" onClick={() => setSidebarOpen(false)}><i className="fas fa-xmark"></i></button>
        </div>
        <nav className="sidebar-nav">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.to} to={item.to} className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')} onClick={() => setSidebarOpen(false)}>
              <i className={`fas ${item.icon}`}></i> {item.label}
            </NavLink>
          ))}
          <a href="#" className="nav-item logout-item" onClick={handleLogout}>
            <i className="fas fa-right-from-bracket"></i> Logout
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
              <span className="badge-dot" style={{ display: notifItems.length > 0 ? 'block' : 'none' }}></span>
              <span style={{
                position: 'absolute', top: 2, right: 2, minWidth: 16, height: 16, borderRadius: 8,
                background: 'var(--red)', color: '#fff', fontSize: 9, fontWeight: 700,
                display: notifItems.length > 0 ? 'flex' : 'none', alignItems: 'center', justifyContent: 'center', padding: '0 4px'
              }}>{notifItems.length}</span>
            </button>
            <div className={`notif-dropdown${notifOpen ? ' show' : ''}`}>
              <div className="notif-header">
                <h4><i className="fas fa-bell" style={{ marginRight: 6, color: 'var(--primary)' }}></i> Notifications</h4>
                <span onClick={() => setNotifOpen(false)}>Mark all read</span>
              </div>
              <div className="notif-list">
                {notifItems.length === 0 ? (
                  <div className="notif-empty"><i className="fas fa-bell-slash"></i><p>No notifications</p></div>
                ) : notifItems.map((n, i) => (
                  <NavLink key={i} to={n.link} className="notif-item" onClick={() => setNotifOpen(false)}>
                    <div className={`notif-icon ${n.color}`}><i className={`fas ${n.icon}`}></i></div>
                    <div className="notif-text"><p>{n.title}</p><span>{n.sub}</span></div>
                  </NavLink>
                ))}
              </div>
              <div className="notif-footer"><NavLink to="/tasks" onClick={() => setNotifOpen(false)}>View all tasks</NavLink></div>
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
        <Outlet />
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
