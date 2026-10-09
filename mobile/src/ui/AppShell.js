import { useCallback, useEffect, useRef, useState } from 'react';
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
import { haptics } from '../lib/haptics';
import { useSync } from '../sync/SyncProvider';
import { useRepository } from '../db/repository';
import { wipeLocalData, getPendingSyncCount } from '../db/schema';
import { isOverdueTask } from '../lib/shared';
import { NAV_SECTIONS } from '../../../shared/navigation';
import { accountDisplayName } from '../../../shared/account';
import { useAccount } from '../account/AccountProvider';
import { useBreakpoint } from './layout';

/* The app frame, organized like the CropManager app (and the web app, which
   shares the same sidebar definition in shared/navigation.js):
   - a deep-green sidebar with the logo on a translucent tile, features
     grouped under small uppercase section labels, and Sign out kept apart
     in the sidebar footer;
   - a slim white topbar: menu button (phones), theme toggle, notifications
     bell with an unread count, and a round avatar that opens Settings.
   From 768px up (tablets) the sidebar is pinned open; below that it slides
   in over a dimmed overlay. Page search lives in each page, not the topbar. */

const SIDEBAR_W = 260;
const NOTIF_ORDER = { red: 0, orange: 1, blue: 2, purple: 3, green: 4 };
const mobilePath = (item) => (item.key === 'dashboard' ? '/' : item.path);
/* Mobile has no admin screens (the Admin Panel and One Health map are web-only). */
const MOBILE_SECTIONS = NAV_SECTIONS.filter((s) => !s.adminOnly);

/* ---------- Page search (search box at the top of a list page) ---------- */
/* Returns the search field element for the page to render, with a clear (×)
   button once something is typed. */
export function usePageSearch(placeholder, onChange) {
  const [value, setValue] = useState('');
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const update = useCallback((v) => { setValue(v); onChangeRef.current(v); }, []);
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
  const { isTablet } = useBreakpoint();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useUser();
  const { account } = useAccount();
  const [open, setOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const notifItems = useNotifications(t);
  const { readIds, markRead, markAllRead } = useReadNotifications(user?.id);
  const unread = notifItems.filter((n) => !readIds.has(n.id)).length;
  const slide = useRef(new Animated.Value(-SIDEBAR_W)).current;

  useEffect(() => {
    Animated.timing(slide, { toValue: open ? 0 : -SIDEBAR_W, duration: 250, useNativeDriver: true }).start();
  }, [open, slide]);
  useEffect(() => { if (isTablet) setOpen(false); }, [isTablet]);

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

  const initials = (accountDisplayName(t, account, account?.role)[0] || 'U').toUpperCase();

  const sidebar = <Sidebar pathname={pathname} onNavigate={go} onClose={() => setOpen(false)} closable={!isTablet} topInset={insets.top} bottomInset={insets.bottom} />;

  return (
    <View style={[baseStyles.root, { backgroundColor: colors.bg }]}>
      {isTablet ? <View style={{ width: SIDEBAR_W }}>{sidebar}</View> : null}

      <View style={{ flex: 1 }}>
        <View style={[baseStyles.topbar, { paddingTop: insets.top, height: 60 + insets.top, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          {!isTablet ? <TopbarButton icon="bars" label="Open menu" onPress={() => setOpen(true)} /> : null}
          <View style={{ flex: 1 }} />
          <TopbarButton icon={scheme === 'dark' ? 'sun' : 'moon'} label={t('layout.toggleTheme')} onPress={() => setThemePreference(scheme === 'dark' ? 'light' : 'dark')} />
          <TopbarButton icon="bell" label={t('layout.notifications')} badge={unread} onPress={() => setNotifOpen(true)} />
          <Pressable onPress={() => { haptics.select(); go('/settings'); }} accessibilityRole="button" accessibilityLabel={t('nav.settings')} style={({ pressed }) => ({ marginLeft: 6, opacity: pressed ? 0.8 : 1 })}>
            {user?.imageUrl
              ? <Image source={{ uri: user.imageUrl }} style={baseStyles.avatar} />
              : <View style={[baseStyles.avatar, { backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' }]}><Text style={[baseStyles.avatarText, { color: colors.primary }]}>{initials}</Text></View>}
          </Pressable>
        </View>

        <View style={{ flex: 1 }}>{children}</View>
      </View>

      {!isTablet ? (
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
  );
}

/* Topbar icon button: 40px, radius 8, muted icon, optional count badge. */
function TopbarButton({ icon, label, onPress, badge }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={() => { haptics.select(); onPress(); }}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
      style={({ pressed }) => [baseStyles.topbarBtn, pressed && { backgroundColor: colors.bg }]}
    >
      <Icon name={icon} size={17} color={colors.textLight} />
      {badge ? (
        <View style={[baseStyles.badge, { backgroundColor: colors.red }]}>
          <Text style={baseStyles.badgeText}>{badge > 99 ? '99+' : badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

function NavItem({ icon, label, active, onPress, danger, accent }) {
  const color = danger ? '#FFCDD2' : active ? '#FFFFFF' : 'rgba(255,255,255,0.7)';
  return (
    <Pressable
      onPress={() => { haptics.select(); onPress(); }}
      accessibilityRole="menuitem"
      accessibilityState={{ selected: !!active }}
      style={({ pressed }) => [baseStyles.navItem, active && baseStyles.navItemActive, pressed && !active && { backgroundColor: 'rgba(255,255,255,0.08)' }]}
    >
      <View style={{ width: 20, alignItems: 'center' }}><Icon name={icon} size={14} color={accent || color} /></View>
      <Text style={[baseStyles.navText, { color }]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

function Sidebar({ pathname, onNavigate, onClose, closable, topInset, bottomInset }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const signOut = useSignOut();
  const { syncing, lastSyncedAt, lastError, failedCount, triggerSync } = useSync();

  const syncLine = syncing ? t('sync.syncing') : lastError ? t('sync.syncIssue')
    : lastSyncedAt ? t('sync.lastSynced', { time: new Date(lastSyncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }) : t('sync.notSyncedYet');

  return (
    <View style={[baseStyles.sidebar, { backgroundColor: colors.sidebar }]}>
      {/* Logo on a translucent tile, name in two tones. */}
      <View style={[baseStyles.sidebarHeader, { paddingTop: topInset + 14 }]}>
        <View style={baseStyles.logoTile}><Icon name="cow" size={18} color="#FFFFFF" /></View>
        <Text style={baseStyles.logoText}>Livestock<Text style={{ color: '#FFFFFF', fontWeight: '800' }}>Pro</Text></Text>
        <View style={{ flex: 1 }} />
        {closable ? <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close menu"><Icon name="xmark" size={18} color="rgba(255,255,255,0.6)" /></Pressable> : null}
      </View>

      {/* Features, grouped into labelled sections. */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 12 }}>
        {MOBILE_SECTIONS.map((section) => (
          <View key={section.labelKey || 'main'}>
            {section.labelKey ? <Text style={baseStyles.sectionLabel}>{t(section.labelKey)}</Text> : <View style={{ height: 8 }} />}
            {section.items.map((item) => {
              const href = mobilePath(item);
              const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
              return <NavItem key={item.key} icon={item.icon} label={t(item.labelKey)} active={active} onPress={() => onNavigate(href)} />;
            })}
          </View>
        ))}
      </ScrollView>

      {/* Footer, apart from the features: offline sync status, then Sign out. */}
      <View style={[baseStyles.sidebarFooter, { paddingBottom: bottomInset + 8 }]}>
        <Pressable onPress={() => { haptics.select(); triggerSync(); }} style={baseStyles.syncRow} accessibilityRole="button">
          <View style={{ width: 20, alignItems: 'center' }}>
            <Icon name={syncing ? 'arrows-rotate' : lastError ? 'triangle-exclamation' : 'cloud'} size={12} color={lastError ? '#FFD54F' : '#FFFFFF'} />
          </View>
          <Text style={baseStyles.syncText} numberOfLines={1}>{syncLine}{failedCount > 0 ? ` · ${t('sync.recordsFailed', { count: failedCount })}` : ''}</Text>
        </Pressable>
        <NavItem icon="right-from-bracket" label={t('nav.signOut')} onPress={() => { onClose(); signOut(); }} danger />
      </View>
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
        top: topInset + 54, right: width <= 480 ? 10 : 16, width: Math.min(360, width - 20), backgroundColor: colors.card,
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
  sidebarHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 16, paddingHorizontal: 18, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)' },
  logoTile: { width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  logoText: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  sectionLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.2, color: 'rgba(255,255,255,0.35)', paddingTop: 16, paddingBottom: 6, paddingHorizontal: 20 },
  navItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, paddingLeft: 17, paddingRight: 20, borderLeftWidth: 3, borderLeftColor: 'transparent' },
  navItemActive: { backgroundColor: 'rgba(255,255,255,0.12)', borderLeftColor: '#FFFFFF' },
  navText: { fontSize: 13, fontWeight: '500' },
  sidebarFooter: { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)', paddingTop: 6 },
  syncRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, paddingLeft: 20, paddingRight: 20 },
  syncText: { color: 'rgba(255,255,255,0.5)', fontSize: 11, flex: 1 },

  topbar: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, borderBottomWidth: 1 },
  topbarBtn: { width: 40, height: 40, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: 4, right: 4, minWidth: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  avatar: { width: 34, height: 34, borderRadius: 17, overflow: 'hidden' },
  avatarText: { fontWeight: '700', fontSize: 13 },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 8, borderWidth: 1, paddingHorizontal: 13, minHeight: 42, marginBottom: 10 },
  searchInput: { flex: 1, fontSize: 13, paddingVertical: 10 },

  notifPanel: { position: 'absolute', borderRadius: 12, overflow: 'hidden' },
  notifHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1 },
  notifItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 1 },
  notifIcon: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  notifFooter: { paddingVertical: 12, alignItems: 'center', borderTopWidth: 1 },
});
