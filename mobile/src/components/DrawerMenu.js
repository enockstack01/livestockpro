import { useEffect, useRef } from 'react';
import { Animated, Dimensions, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@clerk/expo';
import { useSQLiteContext } from 'expo-sqlite';
import Icon from './Icon';
import { useTheme } from '../theme/ThemeProvider';
import { useConfirm } from '../lib/confirm';
import { useToast } from '../lib/toast';
import { useSync } from '../sync/SyncProvider';
import { wipeLocalData, getPendingSyncCount } from '../db/schema';

const WIDTH = Math.min(320, Dimensions.get('window').width * 0.82);

/* All sections in one scrollable list — the mobile counterpart to
   client/src/components/Layout.jsx's sidebar. Opened via the hamburger
   button every screen's header renders (see app/(app)/_layout.js). */
const SECTIONS = [
  { href: '/', icon: 'gauge-high', key: 'dashboard' },
  { href: '/animals', icon: 'cow', key: 'animals' },
  { href: '/health', icon: 'stethoscope', key: 'health' },
  { href: '/feeding', icon: 'wheat-awn', key: 'feeding' },
  { href: '/breeding', icon: 'venus-mars', key: 'breeding' },
  { href: '/production', icon: 'gauge', key: 'production' },
  { href: '/finance', icon: 'coins', key: 'finance' },
  { href: '/tasks', icon: 'list-check', key: 'tasks' },
  { href: '/reports', icon: 'chart-bar', key: 'reports' },
  { href: '/settings', icon: 'gear', key: 'settings' },
];

export default function DrawerMenu({ open, onClose }) {
  const { t } = useTranslation();
  const { colors, scheme } = useTheme();
  const router = useRouter();
  const { signOut } = useAuth();
  const db = useSQLiteContext();
  const confirm = useConfirm();
  const showToast = useToast();
  const { triggerSync } = useSync();
  const translateX = useRef(new Animated.Value(-WIDTH)).current;

  useEffect(() => {
    Animated.timing(translateX, { toValue: open ? 0 : -WIDTH, duration: 220, useNativeDriver: true }).start();
  }, [open, translateX]);

  function go(href) {
    onClose();
    router.push(href);
  }

  async function confirmSignOut() {
    const ok = await confirm({
      title: t('confirmDialogs.signOutTitle'),
      message: t('confirmDialogs.signOutMessage'),
      confirmLabel: t('confirmDialogs.signOutConfirm'),
      destructive: true,
    });
    if (!ok) return;
    onClose();
    // Give queued offline edits one last chance to reach the server — the
    // sign-out prompt promises "your data stays synced", so don't wipe the
    // local cache (and the account's only copy of anything still queued)
    // while changes are still pending.
    await triggerSync();
    if ((await getPendingSyncCount(db)) > 0) {
      showToast(t('confirmDialogs.signOutSyncPending'), 'error');
      return;
    }
    await wipeLocalData(db);
    await signOut();
  }

  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: open ? 50 : -1 }]} pointerEvents={open ? 'auto' : 'none'}>
      <Pressable style={[StyleSheet.absoluteFill, styles.backdrop]} onPress={onClose} />
      <Animated.View style={[styles.panel, { width: WIDTH, backgroundColor: colors.card, transform: [{ translateX }] }]}>
        <View style={styles.header}>
          <Icon name="cow" size={28} color={colors.primary} />
          <Text style={[styles.brand, { color: colors.primaryDark }]}>LivestockPro</Text>
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingVertical: 8 }} showsVerticalScrollIndicator={false}>
          {SECTIONS.map((s) => (
            <Pressable key={s.href} style={styles.row} onPress={() => go(s.href)}>
              <Icon name={s.icon} size={18} color={colors.primary} style={{ width: 26 }} />
              <Text style={[styles.rowLabel, { color: colors.text }]}>{t(`nav.${s.key}`)}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <Pressable style={[styles.row, styles.signOutRow, { borderTopColor: colors.border }]} onPress={confirmSignOut}>
          <Icon name="right-from-bracket" size={18} color={colors.red} style={{ width: 26 }} />
          <Text style={[styles.rowLabel, { color: colors.red }]}>{t('nav.signOut')}</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(0,0,0,0.4)' },
  panel: { position: 'absolute', left: 0, top: 0, bottom: 0, paddingTop: 50, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 12, shadowOffset: { width: 2, height: 0 }, elevation: 10 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingBottom: 16 },
  brand: { fontSize: 18, fontWeight: '800' },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, paddingHorizontal: 20 },
  rowLabel: { fontSize: 15, fontWeight: '600' },
  signOutRow: { borderTopWidth: 1, paddingTop: 16, paddingBottom: 24 },
});
