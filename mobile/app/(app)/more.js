import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@clerk/expo';
import { useSQLiteContext } from 'expo-sqlite';
import { useSync } from '../../src/sync/SyncProvider';
import { useConfirm } from '../../src/lib/confirm';
import { wipeLocalData } from '../../src/db/schema';

const LINKS = [
  { href: '/feeding', label: 'Feeding', icon: 'nutrition' },
  { href: '/breeding', label: 'Breeding', icon: 'heart' },
  { href: '/production', label: 'Production', icon: 'stats-chart' },
  { href: '/finance', label: 'Finance', icon: 'cash' },
  { href: '/reports', label: 'Reports', icon: 'document-text' },
  { href: '/settings', label: 'Settings', icon: 'settings' },
];

export default function MoreScreen() {
  const router = useRouter();
  const { signOut } = useAuth();
  const db = useSQLiteContext();
  const { syncing, lastSyncedAt, lastError, failedCount, triggerSync } = useSync();
  const confirm = useConfirm();

  async function confirmSignOut() {
    const ok = await confirm({
      title: 'Sign out?',
      message: 'You can sign back in any time — your data stays synced to your account.',
      confirmLabel: 'Sign out',
      destructive: true,
    });
    if (!ok) return;
    await wipeLocalData(db); // don't leak this account's cached data to whoever signs in next
    await signOut();
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, gap: 10 }}>
      <SyncStatusCard syncing={syncing} lastSyncedAt={lastSyncedAt} lastError={lastError} failedCount={failedCount} onRefresh={triggerSync} />

      {LINKS.map((item) => (
        <Pressable key={item.href} style={styles.row} onPress={() => router.push(item.href)}>
          <Ionicons name={item.icon} size={20} color="#2E7D32" style={{ width: 28 }} />
          <Text style={styles.rowLabel}>{item.label}</Text>
          <Ionicons name="chevron-forward" size={18} color="#B0BEC5" />
        </Pressable>
      ))}

      <Pressable style={[styles.row, styles.signOutRow]} onPress={confirmSignOut}>
        <Ionicons name="log-out-outline" size={20} color="#D32F2F" style={{ width: 28 }} />
        <Text style={[styles.rowLabel, { color: '#D32F2F' }]}>Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}

function SyncStatusCard({ syncing, lastSyncedAt, lastError, failedCount, onRefresh }) {
  return (
    <Pressable style={styles.syncCard} onPress={onRefresh}>
      <Ionicons name={syncing ? 'sync' : lastError ? 'warning' : 'checkmark-circle'} size={20} color={lastError ? '#E65100' : '#2E7D32'} />
      <View style={{ flex: 1 }}>
        <Text style={styles.syncTitle}>
          {syncing ? 'Syncing…' : lastError ? 'Sync issue' : 'Synced'}
        </Text>
        <Text style={styles.syncSubtitle}>
          {lastError ? lastError : lastSyncedAt ? `Last synced ${new Date(lastSyncedAt).toLocaleTimeString()}` : 'Not synced yet — tap to sync'}
          {failedCount > 0 ? ` · ${failedCount} record${failedCount === 1 ? '' : 's'} failed to sync` : ''}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7F5' },
  syncCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#ECEFF1', marginBottom: 6 },
  syncTitle: { fontWeight: '700', color: '#263238', fontSize: 14 },
  syncSubtitle: { color: '#607D8B', fontSize: 12, marginTop: 2 },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#ECEFF1' },
  rowLabel: { flex: 1, fontSize: 15, color: '#263238', fontWeight: '600' },
  signOutRow: { marginTop: 10 },
});
