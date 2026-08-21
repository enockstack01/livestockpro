import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@clerk/expo';
import { useSQLiteContext } from 'expo-sqlite';
import { useTranslation } from 'react-i18next';
import { useSync } from '../../src/sync/SyncProvider';
import { useConfirm } from '../../src/lib/confirm';
import { useToast } from '../../src/lib/toast';
import { wipeLocalData, getPendingSyncCount } from '../../src/db/schema';
import Icon from '../../src/components/Icon';
import ResponsiveScreen from '../../src/components/ResponsiveScreen';
import { useTheme } from '../../src/theme/ThemeProvider';

/* Icon names match client/src/components/Layout.jsx's sidebar exactly
   (fa-wheat-awn, fa-venus-mars, fa-gauge, fa-coins, fa-chart-bar, fa-gear). */
const LINKS = [
  { href: '/feeding', key: 'feeding', icon: 'wheat-awn' },
  { href: '/breeding', key: 'breeding', icon: 'venus-mars' },
  { href: '/production', key: 'production', icon: 'gauge' },
  { href: '/finance', key: 'finance', icon: 'coins' },
  { href: '/reports', key: 'reports', icon: 'chart-bar' },
  { href: '/settings', key: 'settings', icon: 'gear' },
];

export default function MoreScreen() {
  const { t } = useTranslation();
  const { colors, radius, shadow } = useTheme();
  const styles = useMemo(() => makeStyles(colors, radius, shadow), [colors, radius, shadow]);
  const router = useRouter();
  const { signOut } = useAuth();
  const db = useSQLiteContext();
  const { syncing, lastSyncedAt, lastError, failedCount, triggerSync } = useSync();
  const confirm = useConfirm();
  const showToast = useToast();

  async function confirmSignOut() {
    const ok = await confirm({
      title: t('confirmDialogs.signOutTitle'),
      message: t('confirmDialogs.signOutMessage'),
      confirmLabel: t('confirmDialogs.signOutConfirm'),
      destructive: true,
    });
    if (!ok) return;
    // Give queued offline edits one last chance to reach the server before
    // wiping the local cache — the prompt above promises data stays synced.
    await triggerSync();
    if ((await getPendingSyncCount(db)) > 0) {
      showToast(t('confirmDialogs.signOutSyncPending'), 'error');
      return;
    }
    await wipeLocalData(db); // don't leak this account's cached data to whoever signs in next
    await signOut();
  }

  return (
    <ResponsiveScreen>
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, gap: 10 }}>
      <SyncStatusCard styles={styles} colors={colors} syncing={syncing} lastSyncedAt={lastSyncedAt} lastError={lastError} failedCount={failedCount} onRefresh={triggerSync} />

      {LINKS.map((item) => (
        <Pressable key={item.href} style={styles.row} onPress={() => router.push(item.href)}>
          <Icon name={item.icon} size={18} color={colors.primary} style={{ width: 28 }} />
          <Text style={styles.rowLabel}>{t(`nav.${item.key}`)}</Text>
          <Icon name="chevron-right" size={14} color={colors.textLight} />
        </Pressable>
      ))}

      <Pressable style={[styles.row, styles.signOutRow]} onPress={confirmSignOut}>
        <Icon name="right-from-bracket" size={18} color={colors.red} style={{ width: 28 }} />
        <Text style={[styles.rowLabel, { color: colors.red }]}>{t('nav.signOut')}</Text>
      </Pressable>
    </ScrollView>
    </ResponsiveScreen>
  );
}

function SyncStatusCard({ styles, colors, syncing, lastSyncedAt, lastError, failedCount, onRefresh }) {
  const { t } = useTranslation();
  return (
    <Pressable style={styles.syncCard} onPress={onRefresh}>
      <Icon name={syncing ? 'arrows-rotate' : lastError ? 'triangle-exclamation' : 'circle-check'} size={18} color={lastError ? colors.orange : colors.primary} />
      <View style={{ flex: 1 }}>
        <Text style={styles.syncTitle}>
          {syncing ? t('sync.syncing') : lastError ? t('sync.syncIssue') : t('sync.synced')}
        </Text>
        <Text style={styles.syncSubtitle}>
          {lastError ? lastError : lastSyncedAt ? t('sync.lastSynced', { time: new Date(lastSyncedAt).toLocaleTimeString() }) : t('sync.notSyncedYet')}
          {failedCount > 0 ? ` · ${t('sync.recordsFailed', { count: failedCount })}` : ''}
        </Text>
      </View>
    </Pressable>
  );
}

function makeStyles(colors, radius, shadow) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    syncCard: {
      flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: radius.card, padding: 14, marginBottom: 6,
      shadowColor: shadow.color, shadowOpacity: shadow.opacity, shadowRadius: shadow.radius, shadowOffset: shadow.offset, elevation: shadow.elevation,
    },
    syncTitle: { fontWeight: '700', color: colors.text, fontSize: 14 },
    syncSubtitle: { color: colors.textLight, fontSize: 12, marginTop: 2 },
    row: {
      flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: radius.card, padding: 16,
      shadowColor: shadow.color, shadowOpacity: shadow.opacity, shadowRadius: shadow.radius, shadowOffset: shadow.offset, elevation: shadow.elevation,
    },
    rowLabel: { flex: 1, fontSize: 15, color: colors.text, fontWeight: '600' },
    signOutRow: { marginTop: 10 },
  });
}
