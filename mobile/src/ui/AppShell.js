import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useAuth, useUser } from '@clerk/expo';
import { useSQLiteContext } from 'expo-sqlite';
import * as SecureStore from 'expo-secure-store';
import Icon from '../components/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { useConfirm } from '../lib/confirm';
import { useToast } from '../lib/toast';
import { haptics } from '../lib/haptics';
import { useSync } from '../sync/SyncProvider';
import { useRepository } from '../db/repository';
import { wipeLocalData, getPendingSyncCount } from '../db/schema';
import { isOverdueTask } from '../lib/shared';
import { NAV_SECTIONS, ORG_NAV_SECTIONS } from '../../../shared/navigation';
import { useApi } from '../api/client';
import { ConsentRequest, useMyOrganization } from '../screens/org/MyOrganization';
import { accountDisplayName } from '../../../shared/account';
import { useAccount } from '../account/AccountProvider';
import { useBreakpoint } from './layout';
import { LanguagePanel, SearchPanel } from './HeaderTools';
import { AppBarTitleContext, Button, Modal } from './kit';

/* The app frame, built to the CropManager mobile app (the Agriplan style):
   - a solid forest app bar with the screen title (a back button on pages
     below the tabs), search, the language menu and the notification bell;
   - phones: a bottom tab bar (Home, Animals, the AI assistant in the
     middle as the main action, Reports, More); every other page is
     reached from More, which keeps its tab lit;
   - tablets: the forest sidebar pinned on the left instead of the tabs
     (with the Collapse button folding it to a 70px icon rail), and the
     app bar adds the dark mode button and the profile (name, role and
     Livestock ID) beside the avatar.
   Page search lives in each page, the app bar's search covers everything. */

const SIDEBAR_W = 260;
const RAIL_W = 70;
const COLLAPSED_KEY = 'lp_sidebar_collapsed';
const NOTIF_ORDER = { red: 0, orange: 1, blue: 2, purple: 3, green: 4 };
const AMBER = '#F9A825';
const mobilePath = (item) => (item.key === 'dashboard' ? '/' : item.path);
/* Mobile has no admin screens (the Admin Panel and One Health map are web-only). */
export const MOBILE_SECTIONS = NAV_SECTIONS.filter((s) => !s.adminOnly);
/* Organization accounts: the mobile part of the organization area. */
export const orgSections = (role) => ORG_NAV_SECTIONS
  .map((sec) => ({ ...sec, items: sec.items.filter((it) => !it.webOnly && (!it.roles || it.roles.includes(role))) }))
  .filter((sec) => sec.items.length);
export { mobilePath };

/* The phone's bottom tabs. */
const FARMER_TABS = [
  { href: '/', icon: 'house', labelKey: 'nav.home' },
  { href: '/animals', icon: 'cow', labelKey: 'nav.animals' },
  { href: '/assistant', icon: 'wand-magic-sparkles', labelKey: 'nav.assistant', center: true },
  { href: '/reports', icon: 'chart-bar', labelKey: 'nav.reports' },
  { href: '/more', icon: 'bars', labelKey: 'nav.more' },
];
const ORG_TABS = [
  { href: '/organization', icon: 'house', labelKey: 'org.nav.dashboard' },
  { href: '/organization/farmers', icon: 'users', labelKey: 'org.nav.farmers' },
  { href: '/organization/links', icon: 'link', labelKey: 'org.nav.links', center: true },
  { href: '/organization/profile', icon: 'building', labelKey: 'org.nav.profile' },
  { href: '/more', icon: 'bars', labelKey: 'nav.more' },
];
const isOn = (pathname, href) => (href === '/' || href === '/organization' ? pathname === href : pathname === href || pathname.startsWith(href + '/'));

/* The app bar title for a path: the matching menu item's name. */
function titleFor(pathname, sections, t) {
  if (pathname === '/') return t('nav.home');
  if (pathname === '/more') return t('nav.more');
  let best = null;
  sections.forEach((sec) => sec.items.forEach((it) => {
    const href = mobilePath(it);
    if (href !== '/' && isOn(pathname, href) && (!best || href.length > best.href.length)) best = { href, it };
  }));
  return best ? t(best.it.labelKey) : '';
}

/* Server notifications (organization approvals, limit warnings, joins), a
   translation key plus values. */
const SERVER_NOTIF = {
  orgApproved: ['circle-check', 'green'], orgSuspended: ['circle-pause', 'red'], orgReactivated: ['circle-play', 'green'],
  orgLimitChanged: ['gauge', 'blue'], orgUsage80: ['gauge-high', 'orange'], orgUsage100: ['gauge-high', 'red'],
  farmerJoined: ['user-plus', 'green'], farmerLeft: ['user-minus', 'orange'], farmerRemoved: ['user-minus', 'orange'],
  orgInvite: ['people-group', 'blue'], staffInvite: ['envelope-open-text', 'blue']
};

/* ---------- Page search (search box at the top of a list page) ---------- */
/* Returns the search field element for the page to render, with a clear (×)
   button once something is typed. `initial` is a search handed over by the
   header's search (?search=…), applied when it arrives or changes. */
export function usePageSearch(placeholder, onChange, initial) {
  const [value, setValue] = useState(initial || '');
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const update = useCallback((v) => { setValue(v); onChangeRef.current(v); }, []);
  useEffect(() => { if (initial) update(String(initial)); }, [initial, update]);
  return <PageSearch placeholder={placeholder} value={value} onChange={update} />;
}

function PageSearch({ placeholder, value, onChange }) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={[baseStyles.searchBox, { backgroundColor: colors.card, borderColor: focused ? colors.primary : colors.border }]}>
      <Icon name="magnifying-glass" size={13} color={colors.placeholder} />
      <TextInput
        style={[baseStyles.searchInput, { color: colors.text }]}
        placeholder={placeholder}
        placeholderTextColor={colors.placeholder}
        value={value}
        onChangeText={onChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        returnKeyType="search"
      />
      {value ? (
        <Pressable onPress={() => { haptics.select(); onChange(''); }} hitSlop={10} accessibilityLabel="Clear search">
          <Icon name="circle-xmark" size={14} color={colors.placeholder} />
        </Pressable>
      ) : null}
    </View>
  );
}

/* ---------- Sign out (sidebar footer + Settings › Account) ---------- */
/* Confirms, gives queued offline edits one last chance to sync, and only
   then wipes this account's local copy and signs out — the prompt promises
   the data stays synced, so never discard edits that haven't reached the
   server yet. */
export function useSignOut() {
  const { t } = useTranslation();
  const { signOut } = useAuth();
  const db = useSQLiteContext();
  const confirm = useConfirm();
  const showToast = useToast();
  const { triggerSync } = useSync();
  return useCallback(async () => {
    const ok = await confirm({ title: t('confirmDialogs.signOutTitle'), message: t('confirmDialogs.signOutMessage'), confirmLabel: t('confirmDialogs.signOutConfirm'), destructive: true });
    if (!ok) return;
    await triggerSync();
    if ((await getPendingSyncCount(db)) > 0) { showToast(t('confirmDialogs.signOutSyncPending'), 'error'); return; }
    await wipeLocalData(db); // don't leak this account's cached data to whoever signs in next
    await signOut();
  }, [t, confirm, triggerSync, db, showToast, signOut]);
}

/* ---------- Notifications (same rules as the web topbar bell) ---------- */
function useNotifications(t, isOrg) {
  const repo = useRepository();
  const api = useApi();
  const { lastSyncedAt } = useSync();
  const pathname = usePathname();
  const [items, setItems] = useState([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await api.http('GET', '/notifications');
      const server = (res.data || []).map((n) => {
        const [icon, color] = SERVER_NOTIF[n.key] || ['bell', 'blue'];
        return { id: 'srv-' + n.id, serverId: n.id, serverRead: Boolean(n.read_at), icon, color, title: t(`notifications.${n.key}.title`, n.vars || {}), sub: t(`notifications.${n.key}.body`, n.vars || {}), link: n.link || '/' };
      });
      if (isOrg) { if (!cancelled) setItems(server); return; }
      const [tasks, animals, health, breeding] = await Promise.all([
        repo.list('tasks'), repo.list('animals'), repo.list('health_records'), repo.list('breeding_records'),
      ]);
      const out = [];
      const now = new Date();
      const days = (d) => Math.ceil((new Date(d) - now) / 86400000);
      tasks.forEach((tk) => {
        if (isOverdueTask(tk)) out.push({ id: 'task-overdue-' + tk.id, icon: 'clock', color: 'red', title: t('layout.notifOverdueTitle', { title: tk.title }), sub: t('layout.notifOverdueSub', { date: new Date(tk.due_date).toLocaleDateString() }), link: '/tasks' });
      });
      animals.forEach((a) => {
        if (a.health_status === 'Critical') out.push({ id: 'animal-critical-' + a.id, icon: 'triangle-exclamation', color: 'red', title: t('layout.notifCriticalTitle', { tag: a.tag_id }), sub: t('layout.notifCriticalSub'), link: '/health' });
      });
      animals.forEach((a) => {
        if (a.health_status === 'Under Treatment') out.push({ id: 'animal-treatment-' + a.id, icon: 'stethoscope', color: 'orange', title: t('layout.notifTreatmentTitle', { tag: a.tag_id }), sub: t('layout.notifTreatmentSub'), link: '/health' });
      });
      health.forEach((h) => {
        if (!h.next_check_date || h.status === 'Recovered') return;
        const d = days(h.next_check_date);
        if (d <= 3 && d >= 0) out.push({ id: 'health-due-' + h.id, icon: 'calendar-check', color: 'blue', title: t('layout.notifCheckupDueTitle', { tag: h.tag_id || '—' }), sub: d === 0 ? t('layout.notifToday') : t('layout.notifInDaysWithNote', { count: d, note: h.disease || '' }), link: '/health' });
        if (d < 0) out.push({ id: 'health-missed-' + h.id, icon: 'calendar-xmark', color: 'red', title: t('layout.notifMissedTitle', { tag: h.tag_id || '—' }), sub: t('layout.notifMissedSub', { count: Math.abs(d) }), link: '/health' });
      });
      breeding.forEach((b) => {
        if (!b.expected_birth_date || b.pregnancy_status !== 'Pregnant') return;
        const d = days(b.expected_birth_date);
        if (d <= 7 && d >= 0) out.push({ id: 'breeding-birth-' + b.id, icon: 'paw', color: 'purple', title: t('layout.notifBirthTitle', { tag: b.tag_id || '—' }), sub: d === 0 ? t('layout.notifToday') : t('layout.notifBirthInDays', { count: d }), link: '/breeding' });
      });
      out.sort((a, b) => (NOTIF_ORDER[a.color] ?? 5) - (NOTIF_ORDER[b.color] ?? 5));
      if (!cancelled) setItems([...server, ...out]);
    })().catch(() => {});
    return () => { cancelled = true; };
  }, [repo, api, t, isOrg, lastSyncedAt, pathname]);

  return items;
}

/* Dismissed notifications, remembered per account (the web keeps the same
   list in localStorage). */
function useReadNotifications(userId) {
  const key = userId ? `lp_read_notifs_${userId.replace(/[^A-Za-z0-9._-]/g, '')}` : null;
  const [readIds, setReadIds] = useState(new Set());
  useEffect(() => {
    if (!key) return;
    SecureStore.getItemAsync(key).then((raw) => setReadIds(new Set(raw ? JSON.parse(raw) : []))).catch(() => {});
  }, [key]);
  const persist = (next) => {
    setReadIds(next);
    // SecureStore values are size-limited — keeping the newest ids is enough.
    if (key) SecureStore.setItemAsync(key, JSON.stringify([...next].slice(-120))).catch(() => {});
  };
  return {
    readIds,
    markRead: (id) => { if (!readIds.has(id)) persist(new Set(readIds).add(id)); },
    markAllRead: (ids) => { const next = new Set(readIds); ids.forEach((id) => next.add(id)); persist(next); },
  };
}

/* ---------- Shell ---------- */
export default function AppShell({ children }) {
  const { t } = useTranslation();
  const { colors, scheme, setThemePreference } = useTheme();
  const { isTablet } = useBreakpoint();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useUser();
  const { account } = useAccount();
  const api = useApi();
  const isOrg = Boolean(account && account.kind === 'organization');
  const home = isOrg ? '/organization' : '/';
  const [notifOpen, setNotifOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const notifItems = useNotifications(t, isOrg);
  const local = useReadNotifications(user?.id);
  const readIds = new Set([...local.readIds, ...notifItems.filter((n) => n.serverRead).map((n) => n.id)]);
  const markRead = (id) => { local.markRead(id); const n = notifItems.find((x) => x.id === id); if (n && n.serverId) api.http('POST', '/notifications/read', { ids: [n.serverId] }); };
  const markAllRead = (ids) => { local.markAllRead(ids); const sids = notifItems.filter((n) => n.serverId && ids.includes(n.id)).map((n) => n.serverId); if (sids.length) api.http('POST', '/notifications/read', { ids: sids }); };
  const myOrg = useMyOrganization(!isOrg);
  const unread = notifItems.filter((n) => !readIds.has(n.id)).length;
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => { SecureStore.getItemAsync(COLLAPSED_KEY).then((v) => setCollapsed(v === '1')).catch(() => {}); }, []);
  const toggleCollapsed = () => setCollapsed((c) => { SecureStore.setItemAsync(COLLAPSED_KEY, c ? '0' : '1').catch(() => {}); return !c; });
  const rail = isTablet && collapsed;

  const sections = isOrg ? orgSections(account.organization && account.organization.role) : MOBILE_SECTIONS;
  const tabs = isOrg ? ORG_TABS : FARMER_TABS;
  const onTab = tabs.some((tb) => isOn(pathname, tb.href));
  const title = titleFor(pathname, sections, t);

  /* Pages visited, so Back returns to where you came from (More, a tab…). */
  const history = useRef([]);
  useEffect(() => {
    const h = history.current;
    if (h[h.length - 1] !== pathname) h.push(pathname);
    if (h.length > 30) h.shift();
  }, [pathname]);
  const goBack = useCallback(() => {
    const h = history.current;
    h.pop();
    const prev = h.pop() || home;
    router.replace(prev);
  }, [router, home]);

  // Android back: up one page, then to the home page, then out of the app.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (pathname !== home) { goBack(); return true; }
      return false;
    });
    return () => sub.remove();
  }, [pathname, home, goBack]);

  const go = (href) => { if (href !== pathname) router.replace(href); };
  /* Search results link to a section with ?search=…, even the one open now. */
  const goSearch = (href) => router.replace(href);

  const roleName = accountDisplayName(t, account, account?.role);
  const displayName = (!isOrg && user?.fullName) || roleName;
  const profileLine = [displayName !== roleName ? roleName : null, account && account.livestockId].filter(Boolean).join(' · ');
  const initials = (displayName[0] || 'U').toUpperCase();
  const showBack = !isTablet && !onTab;

  return (
    <View style={[baseStyles.root, { backgroundColor: colors.bg }]}>
      {isTablet ? (
        <View style={{ width: rail ? RAIL_W : SIDEBAR_W }}>
          <Sidebar pathname={pathname} onNavigate={go} topInset={insets.top} bottomInset={insets.bottom} sections={sections} isOrg={isOrg} rail={rail} onToggleCollapse={toggleCollapsed} />
        </View>
      ) : null}

      <View style={{ flex: 1 }}>
        {/* App bar: forest green with the screen title. */}
        <View style={{ backgroundColor: colors.appBar, paddingTop: insets.top }}>
          <View style={[baseStyles.appBar, { paddingLeft: showBack ? 4 : 20 }]}>
            {showBack ? <BarButton icon="arrow-left" label={t('common.back')} onPress={goBack} /> : null}
            <Text style={[baseStyles.appBarTitle, showBack && { marginLeft: 4 }]} numberOfLines={1} accessibilityRole="header">{title}</Text>
            {!isOrg ? <BarButton icon="magnifying-glass" label={t('search.placeholder')} onPress={() => setSearchOpen(true)} /> : null}
            <BarButton icon="globe" label={t('settings.language')} onPress={() => setLangOpen(true)} />
            {isTablet ? <BarButton icon={scheme === 'dark' ? 'sun' : 'moon'} label={t('layout.toggleTheme')} onPress={() => setThemePreference(scheme === 'dark' ? 'light' : 'dark')} /> : null}
            <BarButton icon="bell" label={t('layout.notifications')} badge={unread} onPress={() => setNotifOpen(true)} />
            {isTablet ? (
              <Pressable onPress={() => { haptics.select(); go('/settings'); }} accessibilityRole="button" accessibilityLabel={t('nav.settings')} style={({ pressed }) => [baseStyles.userMenu, { opacity: pressed ? 0.8 : 1 }]}>
                {user?.imageUrl
                  ? <Image source={{ uri: user.imageUrl }} style={baseStyles.avatar} />
                  : <View style={[baseStyles.avatar, { backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }]}><Text style={[baseStyles.avatarText, { color: colors.forest }]}>{initials}</Text></View>}
                <View style={{ maxWidth: 220 }}>
                  <Text style={baseStyles.userName} numberOfLines={1}>{displayName}</Text>
                  {profileLine ? <Text style={baseStyles.userRole} numberOfLines={1}>{profileLine}</Text> : null}
                </View>
              </Pressable>
            ) : null}
          </View>
        </View>

        <AppBarTitleContext.Provider value={title}>
          <View style={{ flex: 1 }}>{children}</View>
        </AppBarTitleContext.Provider>

        {!isTablet ? <BottomBar tabs={tabs} pathname={pathname} onGo={go} bottomInset={insets.bottom} /> : null}
      </View>

      <NotificationsPanel
        open={notifOpen}
        onClose={() => setNotifOpen(false)}
        items={notifItems}
        readIds={readIds}
        onItem={(n) => { markRead(n.id); setNotifOpen(false); go(n.link); }}
        onMarkAll={() => markAllRead(notifItems.map((n) => n.id))}
        onViewTasks={isOrg ? null : () => { setNotifOpen(false); go('/tasks'); }}
      />
      {!isOrg ? <ConsentRequest mine={myOrg.data} onAnswered={myOrg.reload} /> : null}
      {!isOrg ? <SearchPanel open={searchOpen} onClose={() => setSearchOpen(false)} onGo={goSearch} /> : null}
      <LanguagePanel open={langOpen} onClose={() => setLangOpen(false)} />
    </View>
  );
}

/* 46px round touch target with a white icon, for the forest app bar; the
   count sits on an Amber dot. */
function BarButton({ icon, label, onPress, badge }) {
  return (
    <Pressable
      onPress={() => { haptics.select(); onPress(); }}
      accessibilityRole="button"
      accessibilityLabel={badge ? `${label}, ${badge}` : label}
      style={({ pressed }) => [baseStyles.barBtn, pressed && { backgroundColor: 'rgba(255,255,255,0.14)' }]}
    >
      <Icon name={icon} size={19} color="#FFFFFF" />
      {badge ? (
        <View style={baseStyles.badge}>
          <Text style={baseStyles.badgeText}>{badge > 9 ? '9+' : badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/* Bottom tab bar: an icon pill and a label per tab, 60px tall above the
   gesture bar; the centre tab is the main action on a forest pill. Pages
   that aren't tabs keep More lit. */
function BottomBar({ tabs, pathname, onGo, bottomInset }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const activeHref = (tabs.find((tb) => isOn(pathname, tb.href)) || tabs[tabs.length - 1]).href;
  return (
    <View accessibilityRole="tablist" style={[baseStyles.tabBar, { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: bottomInset }]}>
      {tabs.map((tab) => {
        const active = activeHref === tab.href;
        const color = active ? colors.primary : colors.textLight;
        return (
          <Pressable
            key={tab.href}
            onPress={() => { haptics.select(); onGo(tab.href); }}
            accessibilityRole="tab"
            accessibilityLabel={t(tab.labelKey)}
            accessibilityState={{ selected: active }}
            style={({ pressed }) => [baseStyles.tab, pressed && { transform: [{ scale: 0.94 }] }]}
          >
            {tab.center ? (
              <View style={[baseStyles.tabCenter, { backgroundColor: colors.forest }]}><Icon name={tab.icon} size={16} color="#FFFFFF" /></View>
            ) : (
              <View style={[baseStyles.tabPill, active && { backgroundColor: colors.primaryLight }]}><Icon name={tab.icon} size={18} color={color} /></View>
            )}
            <Text style={[baseStyles.tabLabel, { color: tab.center ? colors.primary : color, fontWeight: active || tab.center ? '700' : '500' }]} numberOfLines={1}>{t(tab.labelKey)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ``rail``: the collapsed sidebar, icon only (the name stays as the
   accessibility label). The open page has an Amber edge, as in CropManager. */
function NavItem({ icon, label, active, onPress, danger, rail, iconStyle }) {
  const color = danger ? '#FFCDD2' : active ? '#FFFFFF' : 'rgba(255,255,255,0.78)';
  return (
    <Pressable
      onPress={() => { haptics.select(); onPress(); }}
      accessibilityRole="menuitem"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!active }}
      style={({ pressed }) => [baseStyles.navItem, rail && baseStyles.navItemRail, active && baseStyles.navItemActive, pressed && !active && { backgroundColor: 'rgba(255,255,255,0.08)' }]}
    >
      <View style={[{ width: 20, alignItems: 'center' }, iconStyle]}><Icon name={icon} size={14} color={color} /></View>
      {rail ? null : <Text style={[baseStyles.navText, { color }]} numberOfLines={1}>{label}</Text>}
    </Pressable>
  );
}

function Sidebar({ pathname, onNavigate, topInset, bottomInset, sections, isOrg, rail, onToggleCollapse }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const signOut = useSignOut();
  const { syncing, lastSyncedAt, lastError, failedCount, triggerSync } = useSync();

  const syncLine = syncing ? t('sync.syncing') : lastError ? t('sync.syncIssue')
    : lastSyncedAt ? t('sync.lastSynced', { time: new Date(lastSyncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }) : t('sync.notSyncedYet');

  return (
    <View style={[baseStyles.sidebar, { width: rail ? RAIL_W : SIDEBAR_W, backgroundColor: colors.sidebar }]}>
      {/* App icon and wordmark (icon only on the rail). */}
      <View style={[baseStyles.sidebarHeader, rail && baseStyles.sidebarHeaderRail, { paddingTop: topInset + 14 }]}>
        <Image source={require('../../assets/icon.png')} style={baseStyles.appIcon} />
        {rail ? null : <View>
          <Text style={baseStyles.logoText}>LivestockPro</Text>
          <Text style={baseStyles.logoBy}>{t('brand.by')}</Text>
        </View>}
      </View>

      {/* Features, grouped into labelled sections. */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingVertical: 12 }}>
        {sections.map((section) => (
          <View key={section.labelKey || 'main'}>
            {section.labelKey && !rail ? <Text style={baseStyles.sectionLabel}>{t(section.labelKey)}</Text> : <View style={{ height: 8 }} />}
            {section.items.map((item) => {
              const href = mobilePath(item);
              return <NavItem key={item.key} icon={item.icon} label={t(item.labelKey)} active={isOn(pathname, href)} rail={rail} onPress={() => onNavigate(href)} />;
            })}
          </View>
        ))}
      </ScrollView>

      {/* Footer, apart from the features: offline sync status, Sign out, Collapse. */}
      <View style={[baseStyles.sidebarFooter, { paddingBottom: bottomInset + 8 }]}>
        {!isOrg && !rail ? <Pressable onPress={() => { haptics.select(); triggerSync(); }} style={baseStyles.syncRow} accessibilityRole="button">
          <View style={{ width: 20, alignItems: 'center' }}>
            <Icon name={syncing ? 'arrows-rotate' : lastError ? 'triangle-exclamation' : 'cloud'} size={12} color={lastError ? AMBER : '#FFFFFF'} />
          </View>
          <Text style={baseStyles.syncText} numberOfLines={1}>{syncLine}{failedCount > 0 ? ` · ${t('sync.recordsFailed', { count: failedCount })}` : ''}</Text>
        </Pressable> : null}
        <NavItem icon="right-from-bracket" label={t('nav.signOut')} rail={rail} onPress={signOut} danger />
        <NavItem icon="chevron-left" label={rail ? t('layout.expand') : t('layout.collapse')} rail={rail} iconStyle={rail && { transform: [{ rotate: '180deg' }] }} onPress={onToggleCollapse} />
      </View>
    </View>
  );
}

/* Notifications in a bottom sheet (a dialog on tablets). */
function NotificationsPanel({ open, onClose, items, readIds, onItem, onMarkAll, onViewTasks }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const tints = { red: colors.red, orange: colors.orange, blue: colors.blue, purple: colors.purple, green: colors.primary };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('layout.notifications')}
      maxWidth={460}
      footer={<>
        {items.length ? <Button variant="ghost" size="sm" title={t('layout.markAllRead')} onPress={onMarkAll} /> : null}
        {onViewTasks ? <Button variant="secondary" size="sm" icon="list-check" title={t('layout.viewAllTasks')} onPress={onViewTasks} /> : null}
      </>}
    >
      {items.length === 0 ? (
        <View style={{ alignItems: 'center', paddingVertical: 24, gap: 10 }}>
          <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' }}><Icon name="bell-slash" size={22} color={colors.primary} /></View>
          <Text style={{ fontSize: 14, color: colors.textLight }}>{t('layout.noNotifications')}</Text>
        </View>
      ) : items.map((n, i) => (
        <Pressable key={n.id} onPress={() => onItem(n)} style={({ pressed }) => [baseStyles.notifItem, { borderBottomColor: colors.border, opacity: readIds.has(n.id) ? 0.55 : 1 }, i === items.length - 1 && { borderBottomWidth: 0 }, pressed && { backgroundColor: colors.primaryLight }]}>
          <View style={[baseStyles.notifIcon, { backgroundColor: tints[n.color] || colors.primary }]}><Icon name={n.icon} size={13} color={n.color === 'orange' ? '#1C2B1E' : '#FFFFFF'} /></View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text }} numberOfLines={2}>{n.title}</Text>
            <Text style={{ fontSize: 12, color: colors.textLight, marginTop: 2 }} numberOfLines={1}>{n.sub}</Text>
          </View>
        </Pressable>
      ))}
    </Modal>
  );
}

const baseStyles = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row' },
  sidebar: { flex: 1, width: SIDEBAR_W },
  sidebarHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 16, paddingHorizontal: 18, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.12)' },
  sidebarHeaderRail: { justifyContent: 'center', paddingHorizontal: 0 },
  appIcon: { width: 36, height: 36, borderRadius: 8 },
  logoText: { color: '#FFFFFF', fontSize: 18, fontWeight: '700', lineHeight: 21 },
  logoBy: { color: 'rgba(255,255,255,0.72)', fontSize: 11 },
  sectionLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.2, color: 'rgba(255,255,255,0.55)', paddingTop: 16, paddingBottom: 6, paddingHorizontal: 20 },
  navItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, paddingLeft: 17, paddingRight: 20, borderLeftWidth: 3, borderLeftColor: 'transparent' },
  navItemRail: { justifyContent: 'center', paddingLeft: 0, paddingRight: 0, gap: 0 },
  navItemActive: { backgroundColor: 'rgba(255,255,255,0.12)', borderLeftColor: AMBER },
  navText: { fontSize: 14, fontWeight: '500', flexShrink: 1 },
  sidebarFooter: { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)', paddingTop: 6 },
  syncRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, paddingLeft: 20, paddingRight: 20 },
  syncText: { color: 'rgba(255,255,255,0.6)', fontSize: 11, flex: 1 },

  appBar: { height: 56, flexDirection: 'row', alignItems: 'center', paddingRight: 4, gap: 2 },
  appBarTitle: { flex: 1, color: '#FFFFFF', fontSize: 21, fontWeight: '700' },
  barBtn: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: 4, right: 3, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, backgroundColor: AMBER, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#111611', fontSize: 11, fontWeight: '700' },
  userMenu: { flexDirection: 'row', alignItems: 'center', gap: 10, marginLeft: 6, marginRight: 8 },
  avatar: { width: 36, height: 36, borderRadius: 18, overflow: 'hidden' },
  avatarText: { fontWeight: '700', fontSize: 14 },
  userName: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },
  userRole: { fontSize: 11, marginTop: 1, color: 'rgba(255,255,255,0.8)' },

  tabBar: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth },
  tab: { flex: 1, minHeight: 60, alignItems: 'center', justifyContent: 'center', gap: 3, paddingTop: 6, paddingBottom: 4 },
  tabPill: { width: 56, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  tabCenter: { width: 44, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  tabLabel: { fontSize: 12, lineHeight: 15 },

  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, minHeight: 48, marginBottom: 12 },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 10 },

  notifItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 12, paddingHorizontal: 4, borderBottomWidth: StyleSheet.hairlineWidth },
  notifIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
});
