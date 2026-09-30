/* Sidebar layout shared by the web app (client/src/components/Layout.jsx)
   and the mobile app (mobile/src/ui/AppShell.js): features grouped into
   labelled sections — the dashboard on its own at the top, then the farm's
   day-to-day records, money, planning, analytics, and settings last — with
   Sign out kept apart in the sidebar footer. `path` is the route on both
   clients except the dashboard (web: /dashboard, mobile: /). Icons are Font
   Awesome 6 solid names without the `fa-` prefix. */
export const NAV_SECTIONS = [
  { items: [{ key: 'dashboard', path: '/dashboard', icon: 'gauge-high', labelKey: 'nav.dashboard' }] },
  {
    labelKey: 'nav.sections.livestock',
    items: [
      { key: 'animals', path: '/animals', icon: 'cow', labelKey: 'nav.animals' },
      { key: 'health', path: '/health', icon: 'stethoscope', labelKey: 'nav.health' },
      { key: 'breeding', path: '/breeding', icon: 'venus-mars', labelKey: 'nav.breeding' },
    ],
  },
  {
    labelKey: 'nav.sections.production',
    items: [
      { key: 'feeding', path: '/feeding', icon: 'wheat-awn', labelKey: 'nav.feeding' },
      { key: 'production', path: '/production', icon: 'gauge', labelKey: 'nav.production' },
    ],
  },
  {
    labelKey: 'nav.sections.finance',
    items: [{ key: 'finance', path: '/finance', icon: 'coins', labelKey: 'nav.finance' }],
  },
  {
    labelKey: 'nav.sections.planning',
    items: [{ key: 'tasks', path: '/tasks', icon: 'list-check', labelKey: 'nav.tasks' }],
  },
  {
    labelKey: 'nav.sections.analytics',
    items: [{ key: 'reports', path: '/reports', icon: 'chart-bar', labelKey: 'nav.reports' }],
  },
  /* Web-only, and only for admin / super_admin accounts. */
  {
    labelKey: 'nav.sections.administration',
    adminOnly: true,
    items: [
      { key: 'admin', path: '/admin', icon: 'user-shield', labelKey: 'layout.adminPanel', accent: '#FFD54F' },
      { key: 'onehealth', path: '/onehealth', icon: 'shield-virus', labelKey: 'layout.oneHealth', accent: '#FFD54F' },
    ],
  },
  {
    labelKey: 'nav.sections.system',
    items: [{ key: 'settings', path: '/settings', icon: 'gear', labelKey: 'nav.settings' }],
  },
];

/* "Good morning / afternoon / evening, {{name}}" — the dashboard greeting. */
export function greetingKey(date = new Date()) {
  const h = date.getHours();
  return h < 12 ? 'dashboardPage.greetingMorning' : h < 18 ? 'dashboardPage.greetingAfternoon' : 'dashboardPage.greetingEvening';
}

/* The greeting text; with no name it drops the dangling separator
   ("Good morning" rather than "Good morning,"). */
export function greeting(t, name) {
  const text = t(greetingKey(), { name: name || '' });
  return name ? text : text.replace(/[\s,，،、]+$/u, '');
}
