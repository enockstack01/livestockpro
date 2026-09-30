import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, BackHandler, Image, Modal as RNModal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
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
import { useSync } from '../sync/SyncProvider';
import { useRepository } from '../db/repository';
import { wipeLocalData, getPendingSyncCount } from '../db/schema';
import { isOverdueTask } from '../lib/shared';
import { useBreakpoint } from './layout';

/* The app frame — a port of client/src/components/Layout.jsx: the fixed
   deep-green sidebar (same items, icons, active state and logout) plus the
   white topbar (menu toggle, page search, theme toggle, notifications,
   avatar). At ≥1024px the sidebar is pinned open like the web's desktop
   layout; below that it slides in over a dimmed overlay, exactly like the
   web on tablets and phones. */

export const NAV_ITEMS = [
  { href: '/', icon: 'gauge-high', labelKey: 'nav.dashboard' },
  { href: '/animals', icon: 'cow', labelKey: 'nav.animals' },
  { href: '/health', icon: 'stethoscope', labelKey: 'nav.health' },
  { href: '/feeding', icon: 'wheat-awn', labelKey: 'nav.feeding' },
  { href: '/breeding', icon: 'venus-mars', labelKey: 'nav.breeding' },
  { href: '/production', icon: 'gauge', labelKey: 'nav.production' },
  { href: '/finance', icon: 'coins', labelKey: 'nav.finance' },
  { href: '/tasks', icon: 'list-check', labelKey: 'nav.tasks' },
  { href: '/reports', icon: 'chart-bar', labelKey: 'nav.reports' },
  { href: '/settings', icon: 'gear', labelKey: 'nav.settings' },
];

const SIDEBAR_W = 260;
const NOTIF_ORDER = { red: 0, orange: 1, blue: 2, purple: 3, green: 4 };

/* ---------- Topbar search (client/src/lib/topbarSearch.jsx) ---------- */
const SearchContext = createContext(null);

/* A page registers its search box here; the topbar renders it on wide
   screens (like the web). On phones — where the web hides the topbar search
   — pages render the returned `inlineSearch` element in their body instead,
   so search is never lost on a small screen. */
export function useTopbarSearch(placeholder, onChange) {
  const ctx = useContext(SearchContext);
  const { width } = useBreakpoint();
  const [value, setValue] = useState('');
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const update = useCallback((v) => { setValue(v); onChangeRef.current(v); }, []);
  useEffect(() => {
    ctx.setConfig({ placeholder, value, onChange: update });
    return () => ctx.setConfig(null);
  }, [placeholder, value]); // eslint-disable-line react-hooks/exhaustive-deps

  const inTopbar = width > 768;
  return inTopbar ? null : <InlineSearch placeholder={placeholder} value={value} onChange={update} />;
}

function InlineSearch({ placeholder, value, onChange }) {
  const { colors } = useTheme();
  return (
    <View style={[baseStyles.searchBox, { backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.border, marginBottom: 16, minWidth: 0 }]}>
      <Icon name="magnifying-glass" size={14} color={colors.textLight} />
      <TextInput style={[baseStyles.searchInput, { color: colors.text }]} placeholder={placeholder} placeholderTextColor={colors.placeholder} value={value} onChangeText={onChange} />
    </View>
  );
}

/* ---------- Notifications (same rules as the web topbar bell) ---------- */
function useNotifications(t) {
  const repo = useRepository();
  const { lastSyncedAt } = useSync();
  const pathname = usePathname();
  const [items, setItems] = useState([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
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
      if (!cancelled) setItems(out);
    })().catch(() => {});
    return () => { cancelled = true; };
  }, [repo, t, lastSyncedAt, pathname]);

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
  const { isWide, width } = useBreakpoint();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useUser();
  const [open, setOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [search, setSearch] = useState(null);
  const notifItems = useNotifications(t);
  const { readIds, markRead, markAllRead } = useReadNotifications(user?.id);
  const unread = notifItems.filter((n) => !readIds.has(n.id)).length;
  const slide = useRef(new Animated.Value(-SIDEBAR_W)).current;

  useEffect(() => {
    Animated.timing(slide, { toValue: open ? 0 : -SIDEBAR_W, duration: 250, useNativeDriver: true }).start();
  }, [open, slide]);
  useEffect(() => { if (isWide) setOpen(false); }, [isWide]);

  // Android back: close the drawer first, then fall back to the dashboard.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (open) { setOpen(false); return true; }
      if (pathname !== '/') { router.replace('/'); return true; }
      return false;
    });
    return () => sub.remove();
  }, [open, pathname, router]);

  const go = (href) => { setOpen(false); if (href !== pathname) router.replace(href); };

  const email = user?.primaryEmailAddress?.emailAddress || '';
  const displayName = email.split('@')[0] || 'User';
  const initials = email.substring(0, 2).toUpperCase() || 'U';
  const searchCtx = useMemo(() => ({ setConfig: setSearch }), []);

  const sidebar = <Sidebar pathname={pathname} onNavigate={go} onClose={() => setOpen(false)} closable={!isWide} topInset={insets.top} />;

  return (
    <SearchContext.Provider value={searchCtx}>
      <View style={[baseStyles.root, { backgroundColor: colors.bg }]}>
        {isWide ? <View style={{ width: SIDEBAR_W }}>{sidebar}</View> : null}

        <View style={{ flex: 1 }}>
          <View style={[baseStyles.topbar, { paddingTop: insets.top, height: 64 + insets.top, backgroundColor: colors.card, borderBottomColor: colors.border, paddingHorizontal: width <= 480 ? 14 : 24 }]}>
            <View style={baseStyles.topbarLeft}>
              {!isWide ? (
                <Pressable onPress={() => setOpen(true)} hitSlop={10} accessibilityLabel="Menu"><Icon name="bars" size={20} color={colors.text} /></Pressable>
              ) : null}
              {search && width > 768 ? (
                <View style={[baseStyles.searchBox, { backgroundColor: colors.bg, minWidth: isWide ? 280 : 180 }]}>
                  <Icon name="magnifying-glass" size={14} color={colors.textLight} />
                  <TextInput style={[baseStyles.searchInput, { color: colors.text }]} placeholder={search.placeholder} placeholderTextColor={colors.placeholder} value={search.value} onChangeText={search.onChange} />
                </View>
              ) : null}
            </View>
            <View style={baseStyles.topbarRight}>
              <Pressable style={baseStyles.topbarBtn} onPress={() => setThemePreference(scheme === 'dark' ? 'light' : 'dark')} accessibilityLabel={t('layout.toggleTheme')}>
                <Icon name={scheme === 'dark' ? 'sun' : 'moon'} size={18} color={colors.textLight} />
              </Pressable>
              <Pressable style={baseStyles.topbarBtn} onPress={() => setNotifOpen(true)} accessibilityLabel={t('layout.notifications')}>
                <Icon name="bell" size={18} color={colors.textLight} />
                {unread > 0 ? <View style={[baseStyles.notifCount, { backgroundColor: colors.red }]}><Text style={baseStyles.notifCountText}>{unread}</Text></View> : null}
              </Pressable>
              <Pressable style={baseStyles.userMenu} onPress={() => go('/settings')}>
                <View style={[baseStyles.avatar, { backgroundColor: colors.primary }]}>
                  {user?.imageUrl ? <Image source={{ uri: user.imageUrl }} style={{ width: 36, height: 36 }} /> : <Text style={baseStyles.avatarText}>{initials}</Text>}
                </View>
                {width > 768 ? <Text style={[baseStyles.userName, { color: colors.text }]}>{displayName}</Text> : null}
              </Pressable>
            </View>
          </View>

          <View style={{ flex: 1 }}>{children}</View>
        </View>

        {!isWide ? (
          <View style={StyleSheet.absoluteFill} pointerEvents={open ? 'auto' : 'none'}>
            <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)', opacity: open ? 1 : 0 }]} onPress={() => setOpen(false)} />
            <Animated.View style={[baseStyles.drawer, { transform: [{ translateX: slide }] }]}>{sidebar}</Animated.View>
          </View>
        ) : null}

        <NotificationsPanel
          open={notifOpen}
          onClose={() => setNotifOpen(false)}
          items={notifItems}
          readIds={readIds}
          topInset={insets.top}
          onItem={(n) => { markRead(n.id); setNotifOpen(false); go(n.link); }}
          onMarkAll={() => markAllRead(notifItems.map((n) => n.id))}
          onViewTasks={() => { setNotifOpen(false); go('/tasks'); }}
        />
      </View>
    </SearchContext.Provider>
  );
}

function Sidebar({ pathname, onNavigate, onClose, closable, topInset }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { signOut } = useAuth();
  const db = useSQLiteContext();
  const confirm = useConfirm();
  const showToast = useToast();
  const { syncing, lastSyncedAt, lastError, failedCount, triggerSync } = useSync();

  async function logout() {
    const ok = await confirm({ title: t('confirmDialogs.signOutTitle'), message: t('confirmDialogs.signOutMessage'), confirmLabel: t('confirmDialogs.signOutConfirm'), destructive: true });
    if (!ok) return;
    onClose();
    // Give queued offline edits one last chance to reach the server before
    // wiping the local cache — the prompt promises data stays synced.
    await triggerSync();
    if ((await getPendingSyncCount(db)) > 0) { showToast(t('confirmDialogs.signOutSyncPending'), 'error'); return; }
    await wipeLocalData(db); // don't leak this account's cached data to whoever signs in next
    await signOut();
  }

  const syncLine = syncing ? t('sync.syncing') : lastError ? t('sync.syncIssue')
    : lastSyncedAt ? t('sync.lastSynced', { time: new Date(lastSyncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }) : t('sync.notSyncedYet');

  return (
    <View style={[baseStyles.sidebar, { paddingTop: topInset, backgroundColor: colors.sidebar }]}>
      <View style={baseStyles.sidebarHeader}>
        <View style={baseStyles.sidebarLogo}>
          <Icon name="cow" size={22} color="#81C784" />
          <Text style={baseStyles.sidebarLogoText}>LivestockPro</Text>
        </View>
        {closable ? <Pressable onPress={onClose} hitSlop={10}><Icon name="xmark" size={18} color="rgba(255,255,255,0.6)" /></Pressable> : null}
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingVertical: 12 }}>
        {NAV_ITEMS.map((item) => {
          const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
          return (
            <Pressable key={item.href} onPress={() => onNavigate(item.href)} style={({ pressed }) => [baseStyles.navItem, active && baseStyles.navItemActive, pressed && !active && { backgroundColor: 'rgba(255,255,255,0.08)' }]}>
              <Icon name={item.icon} size={15} color={active ? '#FFFFFF' : 'rgba(255,255,255,0.7)'} style={{ width: 20, textAlign: 'center' }} />
              <Text style={[baseStyles.navText, active && { color: '#FFFFFF' }]}>{t(item.labelKey)}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {/* Offline sync status — mobile keeps a local copy of the farm's data. */}
      <Pressable onPress={triggerSync} style={baseStyles.syncRow}>
        <Icon name={syncing ? 'arrows-rotate' : lastError ? 'triangle-exclamation' : 'cloud'} size={13} color={lastError ? '#FFD54F' : '#81C784'} style={{ width: 20, textAlign: 'center' }} />
        <Text style={baseStyles.syncText} numberOfLines={1}>{syncLine}{failedCount > 0 ? ` · ${t('sync.recordsFailed', { count: failedCount })}` : ''}</Text>
      </Pressable>
      <Pressable onPress={logout} style={[baseStyles.navItem, baseStyles.logout]}>
        <Icon name="right-from-bracket" size={15} color="rgba(255,200,200,0.8)" style={{ width: 20, textAlign: 'center' }} />
        <Text style={[baseStyles.navText, { color: 'rgba(255,200,200,0.8)' }]}>{t('layout.logout')}</Text>
      </Pressable>
    </View>
  );
}

function NotificationsPanel({ open, onClose, items, readIds, onItem, onMarkAll, onViewTasks, topInset }) {
  const { t } = useTranslation();
  const { colors, shadowLg } = useTheme();
  const { width } = useBreakpoint();
  const tints = { red: colors.red, orange: colors.orange, blue: colors.blue, purple: colors.purple, green: colors.primary };
  return (
    <RNModal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      <View style={[baseStyles.notifPanel, {
        top: topInset + 58, right: width <= 480 ? 10 : 24, width: Math.min(360, width - 20), backgroundColor: colors.card,
        shadowColor: shadowLg.color, shadowOpacity: shadowLg.opacity, shadowRadius: shadowLg.radius, shadowOffset: shadowLg.offset, elevation: shadowLg.elevation,
      }]}>
        <View style={[baseStyles.notifHeader, { borderBottomColor: colors.border }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Icon name="bell" size={13} color={colors.primary} />
            <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text }}>{t('layout.notifications')}</Text>
          </View>
          <Pressable onPress={onMarkAll}><Text style={{ fontSize: 12, color: colors.primary, fontWeight: '600' }}>{t('layout.markAllRead')}</Text></Pressable>
        </View>
        <ScrollView style={{ maxHeight: 360 }}>
          {items.length === 0 ? (
            <View style={{ alignItems: 'center', padding: 30, gap: 8 }}>
              <Icon name="bell-slash" size={26} color={colors.border} />
              <Text style={{ fontSize: 13, color: colors.textLight }}>{t('layout.noNotifications')}</Text>
            </View>
          ) : items.map((n) => (
            <Pressable key={n.id} onPress={() => onItem(n)} style={[baseStyles.notifItem, { borderBottomColor: colors.border, opacity: readIds.has(n.id) ? 0.55 : 1 }]}>
              <View style={[baseStyles.notifIcon, { backgroundColor: tints[n.color] + '22' }]}><Icon name={n.icon} size={13} color={tints[n.color]} /></View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text }} numberOfLines={2}>{n.title}</Text>
                <Text style={{ fontSize: 11, color: colors.textLight, marginTop: 2 }} numberOfLines={1}>{n.sub}</Text>
              </View>
            </Pressable>
          ))}
        </ScrollView>
        <Pressable onPress={onViewTasks} style={[baseStyles.notifFooter, { borderTopColor: colors.border }]}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: colors.primary }}>{t('layout.viewAllTasks')}</Text>
        </Pressable>
      </View>
    </RNModal>
  );
}

const baseStyles = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row' },
  sidebar: { flex: 1, width: SIDEBAR_W },
  drawer: { position: 'absolute', left: 0, top: 0, bottom: 0, width: SIDEBAR_W, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 12, elevation: 12 },
  sidebarHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)' },
  sidebarLogo: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sidebarLogoText: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  navItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, paddingHorizontal: 20, borderLeftWidth: 3, borderLeftColor: 'transparent' },
  navItemActive: { backgroundColor: 'rgba(255,255,255,0.12)', borderLeftColor: '#81C784' },
  navText: { color: 'rgba(255,255,255,0.7)', fontSize: 14, fontWeight: '500' },
  syncRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 23, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.12)' },
  syncText: { color: 'rgba(255,255,255,0.6)', fontSize: 12, flex: 1 },
  logout: { paddingBottom: 20 },

  topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1 },
  topbarLeft: { flexDirection: 'row', alignItems: 'center', gap: 16, flexShrink: 1 },
  topbarRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  topbarBtn: { width: 38, height: 38, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  notifCount: { position: 'absolute', top: 2, right: 2, minWidth: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  notifCountText: { color: '#fff', fontSize: 9, fontWeight: '700' },
  userMenu: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  userName: { fontSize: 13, fontWeight: '600' },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14 },
  searchInput: { flex: 1, fontSize: 13, padding: 0 },

  notifPanel: { position: 'absolute', borderRadius: 12, overflow: 'hidden' },
  notifHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1 },
  notifItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 1 },
  notifIcon: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  notifFooter: { paddingVertical: 12, alignItems: 'center', borderTopWidth: 1 },
});
