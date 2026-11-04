import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useUser } from '@clerk/expo';
import Icon from '../components/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { useLanguage } from '../i18n/LanguageProvider';
import { useSync } from '../sync/SyncProvider';
import { useAccount } from '../account/AccountProvider';
import { haptics } from '../lib/haptics';
import { accountDisplayName } from '../../../shared/account';
import { LanguagePanel } from '../ui/HeaderTools';
import { Page } from '../ui/kit';
import { MOBILE_SECTIONS, mobilePath, orgSections, useSignOut } from '../ui/AppShell';

/* The phone's menu page (the More tab), as in the CropManager app: your
   profile on a forest card (photo, name, email, Livestock ID), every page
   of the app grouped like the sidebar, then language, dark mode, sync and
   sign out. */
export default function MoreScreen() {
  const { t } = useTranslation();
  const { colors, scheme, setThemePreference } = useTheme();
  const router = useRouter();
  const { user } = useUser();
  const { account } = useAccount();
  const { language, languages } = useLanguage();
  const { syncing, lastSyncedAt, lastError, triggerSync } = useSync();
  const signOut = useSignOut();
  const [langOpen, setLangOpen] = useState(false);
  const [badImage, setBadImage] = useState(false);

  const isOrg = Boolean(account && account.kind === 'organization');
  const sections = isOrg ? orgSections(account.organization && account.organization.role) : MOBILE_SECTIONS;
  const roleName = accountDisplayName(t, account, account?.role);
  const name = (!isOrg && user?.fullName) || roleName;
  const initials = (name.match(/\b\w/g) || ['U']).slice(0, 2).join('').toUpperCase();
  const email = user?.primaryEmailAddress?.emailAddress || '';
  const langLabel = (languages.find((l) => l.code === String(language || 'en').slice(0, 2)) || {}).nativeLabel;
  const dark = scheme === 'dark';
  const syncLine = syncing ? t('sync.syncing') : lastError ? t('sync.syncIssue')
    : lastSyncedAt ? t('sync.lastSynced', { time: new Date(lastSyncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }) : t('sync.notSyncedYet');
  const go = (href) => router.replace(href);

  const group = (label, rows) => (
    <View key={label || 'main'} style={{ marginBottom: 16 }}>
      {label ? <Text style={[styles.groupLabel, { color: colors.textLight }]}>{label}</Text> : null}
      <View style={[styles.group, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {rows.map(({ key, ...r }, i) => <Row key={key} {...r} last={i === rows.length - 1} />)}
      </View>
    </View>
  );

  return (
    <Page>
      <Pressable onPress={() => { haptics.select(); go('/settings'); }} accessibilityRole="button" accessibilityLabel={t('nav.settings')} style={({ pressed }) => [styles.profile, { backgroundColor: colors.forest, transform: [{ scale: pressed ? 0.98 : 1 }] }]}>
        <View pointerEvents="none" style={styles.profileGlow} />
        {user?.imageUrl && !badImage
          ? <Image source={{ uri: user.imageUrl }} onError={() => setBadImage(true)} style={styles.avatar} />
          : <View style={[styles.avatar, { backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }]}><Text style={[styles.initials, { color: colors.forest }]}>{initials}</Text></View>}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.name} numberOfLines={1}>{name}</Text>
          {email ? <Text style={styles.email} numberOfLines={1}>{email}</Text> : null}
          {name !== roleName ? <Text style={styles.email} numberOfLines={1}>{roleName}</Text> : null}
          {account && account.livestockId ? <Text style={styles.id}>{account.livestockId}</Text> : null}
        </View>
        <Icon name="chevron-right" size={14} color="#FFFFFF" />
      </Pressable>

      {sections.map((sec) => group(sec.labelKey ? t(sec.labelKey) : null, sec.items.map((it) => ({ key: it.key, icon: it.icon, label: t(it.labelKey), onPress: () => go(mobilePath(it)) }))))}

      {group(t('settings.preferences'), [
        { key: 'language', icon: 'globe', label: t('settings.language'), value: langLabel, onPress: () => setLangOpen(true) },
        { key: 'theme', icon: dark ? 'sun' : 'moon', label: dark ? t('settings.themeLight') : t('settings.themeDark'), onPress: () => setThemePreference(dark ? 'light' : 'dark') },
        ...(!isOrg ? [{ key: 'sync', icon: syncing ? 'arrows-rotate' : lastError ? 'triangle-exclamation' : 'cloud', label: syncLine, onPress: triggerSync, plain: true }] : []),
        { key: 'signout', icon: 'right-from-bracket', label: t('nav.signOut'), onPress: signOut, danger: true },
      ])}

      <LanguagePanel open={langOpen} onClose={() => setLangOpen(false)} />
    </Page>
  );
}

/* One tappable line: round icon, label, value, chevron. */
function Row({ icon, label, value, onPress, danger, plain, last }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={() => { haptics.select(); onPress(); }}
      accessibilityRole="button"
      style={({ pressed }) => [styles.row, { borderBottomColor: colors.border }, last && { borderBottomWidth: 0 }, pressed && { backgroundColor: colors.primaryLight }]}
    >
      <View style={[styles.rowIcon, { backgroundColor: danger ? colors.red + '1F' : colors.primaryLight }]}>
        <Icon name={icon} size={14} color={danger ? colors.red : colors.primary} />
      </View>
      <Text style={[styles.rowLabel, { color: danger ? colors.red : plain ? colors.textLight : colors.text }, plain && { fontWeight: '500', fontSize: 14 }]} numberOfLines={1}>{label}</Text>
      {value ? <Text style={{ fontSize: 13, color: colors.textLight }} numberOfLines={1}>{value}</Text> : null}
      {danger || plain ? null : <Icon name="chevron-right" size={12} color={colors.textLight} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  profile: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 20, padding: 18, overflow: 'hidden', marginBottom: 20 },
  profileGlow: { position: 'absolute', width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(255,255,255,0.05)', top: -70, right: -40 },
  avatar: { width: 56, height: 56, borderRadius: 28 },
  initials: { fontSize: 20, fontWeight: '700' },
  name: { fontSize: 19, fontWeight: '700', color: '#FFFFFF' },
  email: { fontSize: 13, color: 'rgba(255,255,255,0.85)' },
  id: { fontSize: 12, fontWeight: '700', color: '#F9A825', marginTop: 3, letterSpacing: 0.5 },
  groupLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, marginLeft: 4 },
  group: { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 56, paddingHorizontal: 16, borderBottomWidth: 1 },
  rowIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { flex: 1, fontSize: 15, fontWeight: '600' },
});
