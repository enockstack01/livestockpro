import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useUser } from '@clerk/expo';
import Icon from '../components/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { useRepository } from '../db/repository';
import { useSync } from '../sync/SyncProvider';
import { useAccount } from '../account/AccountProvider';
import { useToast } from '../lib/toast';
import { haptics } from '../lib/haptics';
import { fmtDate } from '../lib/shared';
import { Badge, Card, CardBody, CardHeader, Page, PageHeader, Spinner, useTint } from '../ui/kit';
import { MiniColumns } from '../ui/microViz';
import { greeting } from '../../../shared/navigation';
import { relativeDay } from '../../../shared/dashboardFeed';
import { COLLECTOR_KINDS, animalsToCheck, computeCollectorStats, openTasks } from '../../../shared/teamDashboard';

/* The data collector's dashboard, matching the web's CollectorDashboard:
   today's count in a Pine hero, one big button per kind of record, open
   tasks with a one tap "done", animals to check and their recent entries.
   Entries are the rows this phone recorded (the local user_id column holds
   the recorder), so the count is right even before the next sync. */
export default function CollectorDashboard() {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const repo = useRepository();
  const router = useRouter();
  const { user } = useUser();
  const { account } = useAccount();
  const showToast = useToast();
  const { syncing, lastSyncedAt, triggerSync } = useSync();
  const [data, setData] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [animals, health, breeding, feeding, production, tasks] = await Promise.all([
      repo.list('animals'), repo.list('health_records'), repo.list('breeding_records'),
      repo.list('feeding_records'), repo.list('production_records'), repo.list('tasks', { order: 'due_date ASC' }),
    ]);
    setData({ animals, health, breeding, feeding, production, tasks });
  }, [repo]);
  useEffect(() => { load(); }, [load, lastSyncedAt]);

  const stats = useMemo(() => (data && user ? computeCollectorStats(data, user.id, { by: (r) => r.user_id }) : null), [data, user]);
  if (!data || !stats) return <Spinner />;

  const tasks = openTasks(data.tasks);
  const check = animalsToCheck(data.animals);
  const dayName = (d) => new Date(d.date + 'T00:00:00').toLocaleDateString(i18n.language, { weekday: 'short' });
  const go = (path) => { haptics.tap(); router.replace(path); };

  async function markDone(task) {
    await repo.update('tasks', task.id, { status: 'Completed' });
    showToast(t('collectorDash.taskDone'), 'success');
    load();
  }
  const onRefresh = async () => { setRefreshing(true); await triggerSync(); await load(); setRefreshing(false); };

  return (
    <Page refreshing={refreshing || syncing} onRefresh={onRefresh}>
      <PageHeader title={greeting(t, user && user.firstName)} subtitle={t('collectorDash.subtitle')} />

      <View style={[styles.hero, { backgroundColor: '#14532D' }]}>
        <Text style={styles.eyebrow}>{account && account.farm ? t('collectorDash.recordingFor', { farm: account.farm }) : t('collectorDash.recording')}</Text>
        <View style={styles.countRow}>
          <Text style={styles.count}>{stats.today}</Text>
          <Text style={styles.countLabel}>{t('collectorDash.entriesToday', { count: stats.today })}</Text>
        </View>
        <View style={styles.facts}>
          <Text style={styles.fact}>{t('collectorDash.thisWeek', { count: stats.week })}</Text>
          {stats.streak > 1 ? <View style={styles.streak}><Icon name="fire" size={11} color="#1C2B1E" /><Text style={styles.streakText}>{t('collectorDash.streak', { count: stats.streak })}</Text></View> : null}
        </View>
        <View style={{ marginTop: 14 }}>
          <MiniColumns values={stats.perDay.map((d) => d.count)} color="#FFFFFF" height={56} />
          <View style={styles.axis}>{stats.perDay.map((d) => <Text key={d.date} style={styles.axisText}>{dayName(d).slice(0, 2)}</Text>)}</View>
        </View>
      </View>

      <Text style={[styles.section, { color: colors.forest }]}>{t('collectorDash.whatRecording')}</Text>
      <View style={styles.tiles}>
        {COLLECTOR_KINDS.map((k) => (
          <Pressable key={k.key} onPress={() => go(`${k.path}?new=1`)} accessibilityRole="button" style={({ pressed }) => [styles.tile, { backgroundColor: colors.card, borderColor: colors.border, transform: [{ scale: pressed ? 0.97 : 1 }] }]}>
            <View style={[styles.tileIcon, { backgroundColor: colors.primary }]}><Icon name={k.icon} size={22} color="#FFFFFF" /></View>
            <Text style={[styles.tileLabel, { color: colors.text }]} numberOfLines={2}>{t(`collectorDash.add.${k.kind}`)}</Text>
            {stats.byKind[k.kind] ? <View style={[styles.tileCount, { backgroundColor: colors.forest }]}><Text style={styles.tileCountText}>{stats.byKind[k.kind]}</Text></View> : null}
          </Pressable>
        ))}
      </View>

      <View style={{ gap: 20 }}>
        <Card>
          <CardHeader title={t('collectorDash.myTasks')} icon="list-check" iconColor={colors.primary} />
          <CardBody style={{ paddingVertical: 8 }}>
            {tasks.length === 0 ? <Empty icon="circle-check" text={t('collectorDash.noTasks')} /> : tasks.map((task, i) => (
              <View key={task.id} style={[styles.row, i < tasks.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
                <Pressable onPress={() => markDone(task)} accessibilityRole="button" accessibilityLabel={t('collectorDash.markDone')} style={[styles.check, { borderColor: colors.primary }]}><Icon name="check" size={13} color={colors.primary} /></Pressable>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.rowName, { color: colors.text }]} numberOfLines={1}>{task.title}</Text>
                  <Text style={[styles.rowSub, { color: colors.textLight }]}>{task.due_date ? t('collectorDash.due', { date: fmtDate(task.due_date) }) : t('collectorDash.noDueDate')}</Text>
                </View>
              </View>
            ))}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t('collectorDash.toCheck')} icon="triangle-exclamation" iconColor={colors.orange} />
          <CardBody style={{ paddingVertical: 8 }}>
            {check.length === 0 ? <Empty icon="heart-circle-check" text={t('collectorDash.allWell')} /> : check.map((a, i) => (
              <Pressable key={a.id} onPress={() => go('/health?new=1')} style={[styles.row, i < check.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.rowName, { color: colors.text }]} numberOfLines={1}>{a.tag_id || a.name}</Text>
                  <Text style={[styles.rowSub, { color: colors.textLight }]} numberOfLines={1}>{[a.species, a.location].filter(Boolean).join(' · ')}</Text>
                </View>
                <Badge label={a.health_status} color={a.health_status === 'Critical' ? 'red' : 'orange'} />
              </Pressable>
            ))}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t('collectorDash.myEntries')} icon="clock-rotate-left" iconColor={colors.primary} />
          <CardBody style={{ paddingVertical: 8 }}>
            {stats.recent.length === 0 ? <Empty icon="inbox" text={t('collectorDash.noEntries')} /> : stats.recent.map((r, i) => (
              <Pressable key={r.id} onPress={() => go(r.path)} style={[styles.row, i < stats.recent.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
                <KindChip tone={r.tone} icon={r.icon} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.rowName, { color: colors.text }]} numberOfLines={1}>{r.name || t(r.labelKey)}</Text>
                  <Text style={[styles.rowSub, { color: colors.textLight }]}>{t(r.labelKey)}</Text>
                </View>
                <Text style={{ fontSize: 11, color: colors.textLight }}>{relativeDay(r.iso, t)}</Text>
              </Pressable>
            ))}
          </CardBody>
        </Card>
      </View>
      <View style={{ height: 8 }} />
    </Page>
  );
}

function KindChip({ tone, icon }) {
  const c = useTint(tone);
  return <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center' }}><Icon name={icon} size={13} color={c.fg} /></View>;
}

function Empty({ icon, text }) {
  const { colors } = useTheme();
  return (
    <View style={{ alignItems: 'center', gap: 8, paddingVertical: 22 }}>
      <Icon name={icon} size={22} color={colors.primary} />
      <Text style={{ fontSize: 13, color: colors.textLight, textAlign: 'center' }}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: 16, padding: 18, marginBottom: 24 },
  eyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', color: 'rgba(255,255,255,0.8)' },
  countRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10, marginTop: 6, marginBottom: 10 },
  count: { fontSize: 52, fontWeight: '700', color: '#FFFFFF', lineHeight: 58 },
  countLabel: { fontSize: 15, color: 'rgba(255,255,255,0.85)', flexShrink: 1 },
  facts: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
  fact: { fontSize: 13, color: 'rgba(255,255,255,0.9)' },
  streak: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#F9A825', paddingHorizontal: 10, paddingVertical: 2, borderRadius: 999 },
  streakText: { fontSize: 12, fontWeight: '700', color: '#1C2B1E' },
  axis: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 4 },
  axisText: { fontSize: 10.5, color: 'rgba(255,255,255,0.75)' },
  section: { fontSize: 16, fontWeight: '700', marginBottom: 12 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 24 },
  tile: { width: '47.5%', flexGrow: 1, minHeight: 124, alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 16, paddingHorizontal: 8, borderRadius: 16, borderWidth: 1 },
  tileIcon: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  tileLabel: { fontSize: 14, fontWeight: '700', textAlign: 'center' },
  tileCount: { position: 'absolute', top: 8, right: 8, minWidth: 22, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999, alignItems: 'center' },
  tileCountText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  rowName: { fontSize: 13.5, fontWeight: '600' },
  rowSub: { fontSize: 11.5 },
  check: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
});
