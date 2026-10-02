import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import Icon from '../../components/Icon';
import { useTheme } from '../../theme/ThemeProvider';
import { Card, CardHeader, CardBody, useTint } from '../../ui/kit';
import { useChartColors } from '../../ui/charts';
import { MiniColumns } from '../../ui/microViz';
import { haptics } from '../../lib/haptics';
import { QUICK_ACTIONS, UPCOMING_WINDOW_DAYS, relativeDay, summarizeAlerts } from '../../../../shared/dashboardFeed';

/* The dashboard's activity cards, identical to the web's
   (client/src/components/dashboard/DashboardFeed.jsx): Recent Activity
   (weekly chart + compact rows with signed amounts), Upcoming Events
   (30-day timeline + swipeable date cards), Alerts (count chips that filter
   a list of late/soon badges) and Quick Actions (launcher grid). */

function useGo() {
  const router = useRouter();
  return (path) => { haptics.tap(); router.replace(path); };
}

function useToneColor(tone) {
  const { colors } = useTheme();
  const tint = useTint(tone);
  return { fg: tone === 'green' ? colors.primary : colors[tone] || colors.blue, bg: tint.bg };
}

function Empty({ icon, text, color }) {
  const { colors } = useTheme();
  return (
    <View style={{ alignItems: 'center', gap: 8, paddingVertical: 24 }}>
      <Icon name={icon} size={22} color={color || colors.border} />
      <Text style={{ fontSize: 13, color: colors.textLight, textAlign: 'center' }}>{text}</Text>
    </View>
  );
}

function Chip({ tone, icon, size = 34 }) {
  const c = useToneColor(tone);
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.3, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={icon} size={size * 0.38} color={c.fg} />
    </View>
  );
}

function CountPill({ value, danger }) {
  const { colors } = useTheme();
  const red = useTint('red');
  return (
    <View style={{ minWidth: 24, paddingVertical: 2, paddingHorizontal: 8, borderRadius: 999, backgroundColor: danger ? red.bg : colors.bg }}>
      <Text style={{ fontSize: 12, fontWeight: '700', textAlign: 'center', color: danger ? colors.red : colors.textLight }}>{value}</Text>
    </View>
  );
}

function Row({ chip, name, sub, end, onPress, last }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, !last && { borderBottomWidth: 1, borderBottomColor: colors.border }, pressed && { backgroundColor: colors.bg }]}>
      {chip}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text }} numberOfLines={1}>{name}</Text>
        <Text style={{ fontSize: 11.5, color: colors.textLight }} numberOfLines={1}>{sub}</Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 2 }}>{end}</View>
    </Pressable>
  );
}

export function RecentActivity({ activity }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const cc = useChartColors();
  const go = useGo();
  const { items, weeks } = activity;
  const total = weeks.reduce((s, w) => s + w.count, 0);
  return (
    <Card>
      <CardHeader title={t('dashboardFeed.recentActivity')} icon="clock-rotate-left" iconColor={colors.purple} />
      <CardBody style={{ paddingVertical: 14 }}>
        {total > 0 ? (
          <View style={[styles.chartBlock, { borderBottomColor: colors.border }]}>
            <View style={styles.chartHead}>
              <Text style={{ fontSize: 11.5, fontWeight: '600', color: colors.textLight }}>{t('dashboardFeed.last12Weeks')}</Text>
              <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text }}>{total}</Text>
            </View>
            <MiniColumns values={weeks.map((w) => w.count)} color={cc.brand} height={44} />
            <View style={styles.axisSpread}>
              <Text style={{ fontSize: 10, color: colors.textLight }}>{weeks[0].label}</Text>
              <Text style={{ fontSize: 10, color: colors.textLight }}>{weeks[weeks.length - 1].label}</Text>
            </View>
          </View>
        ) : null}
        {items.length === 0 ? <Empty icon="inbox" text={t('dashboardFeed.noActivity')} /> : items.map((a, i) => (
          <Row
            key={a.id}
            last={i === items.length - 1}
            onPress={() => go(a.link)}
            chip={<Chip tone={a.color} icon={a.icon} />}
            name={a.name}
            sub={a.sub}
            end={(
              <>
                {a.value ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    {a.valueTone ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: a.valueTone === 'pos' ? colors.primary : colors.red }} /> : null}
                    <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text }}>{a.value}</Text>
                  </View>
                ) : null}
                <Text style={{ fontSize: 11, color: colors.textLight }}>{relativeDay(a.iso, t)}</Text>
              </>
            )}
          />
        ))}
      </CardBody>
    </Card>
  );
}

function EventCard({ e, onPress }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const c = useToneColor(e.color);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.eventCard, { borderColor: pressed ? c.fg : colors.border, backgroundColor: colors.card }]} accessibilityLabel={e.title}>
      <View style={styles.eventTop}>
        <View>
          <Text style={{ fontSize: 24, fontWeight: '800', color: colors.text, lineHeight: 26 }}>{e.day}</Text>
          <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textLight, textTransform: 'uppercase' }}>{e.month}</Text>
        </View>
        <Chip tone={e.color} icon={e.icon} size={28} />
      </View>
      <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text }} numberOfLines={1}>{e.name}</Text>
      <Text style={{ fontSize: 11, color: colors.textLight }} numberOfLines={1}>{t(e.labelKey)}</Text>
      <View style={[styles.countdown, { backgroundColor: c.bg }]}>
        <Text style={{ fontSize: 11, fontWeight: '700', color: c.fg }}>{e.daysLeft === 0 ? t('dashboardFeed.today') : t('dashboardFeed.inDays', { count: e.daysLeft })}</Text>
      </View>
    </Pressable>
  );
}

/* One timeline stop per day: its date above, and how many events fall on
   it inside the dot when there is more than one (same as the web). */
function timelineStops(items) {
  const byDay = new Map();
  items.forEach((e) => {
    const s = byDay.get(e.daysLeft) || { daysLeft: e.daysLeft, day: e.day, color: e.color, count: 0 };
    s.count++;
    if (s.color !== e.color) s.color = 'blue';
    byDay.set(e.daysLeft, s);
  });
  return [...byDay.values()];
}

function TimelineStop({ s }) {
  const { colors } = useTheme();
  const c = useToneColor(s.color);
  return (
    <View style={[styles.timelineStop, { left: `${(s.daysLeft / UPCOMING_WINDOW_DAYS) * 100}%` }]}>
      <Text style={{ fontSize: 10, fontWeight: '700', color: colors.text }}>{s.day}</Text>
      <View style={[styles.timelineDot, { backgroundColor: c.fg, borderColor: colors.card }]}>
        {s.count > 1 ? <Text style={{ fontSize: 10, fontWeight: '800', color: '#FFFFFF' }}>{s.count}</Text> : null}
      </View>
    </View>
  );
}

export function UpcomingEvents({ items }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const go = useGo();
  return (
    <Card>
      <CardHeader title={t('dashboardFeed.upcomingEvents')} icon="calendar-days" iconColor={colors.blue} right={items.length ? <CountPill value={items.length} /> : null} />
      <CardBody style={{ paddingVertical: 14 }}>
        {items.length === 0 ? <Empty icon="calendar" text={t('dashboardFeed.noUpcoming')} /> : (
          <>
            <View style={{ paddingHorizontal: 6, paddingTop: 4, paddingBottom: 14 }}>
              <View style={{ height: 36 }}>
                <View style={[styles.track, { backgroundColor: colors.border }]} />
                {timelineStops(items).map((s) => <TimelineStop key={s.daysLeft} s={s} />)}
              </View>
              <View style={styles.axisSpread}>
                <Text style={{ fontSize: 10.5, color: colors.textLight }}>{t('dashboardFeed.today')}</Text>
                <Text style={{ fontSize: 10.5, color: colors.textLight }}>+15</Text>
                <Text style={{ fontSize: 10.5, color: colors.textLight }}>+{UPCOMING_WINDOW_DAYS}</Text>
              </View>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={142} decelerationRate="fast" contentContainerStyle={{ gap: 10, paddingBottom: 2 }}>
              {items.map((e) => <EventCard key={e.id} e={e} onPress={() => go(e.link)} />)}
            </ScrollView>
          </>
        )}
      </CardBody>
    </Card>
  );
}

function KindChip({ k, active, onPress }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const c = useToneColor(k.color);
  return (
    <Pressable onPress={onPress} accessibilityRole="tab" accessibilityState={{ selected: active }} style={[styles.kind, { backgroundColor: c.bg, borderColor: active ? c.fg : colors.border, borderWidth: active ? 2 : 1 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Icon name={k.icon} size={12} color={c.fg} />
        <Text style={{ fontSize: 17, fontWeight: '800', color: colors.text }}>{k.count}</Text>
      </View>
      <Text style={{ fontSize: 10.5, fontWeight: '600', color: colors.textLight }} numberOfLines={1}>{t(`dashboardFeed.alertKinds.${k.key}`)}</Text>
    </Pressable>
  );
}

function AlertBadge({ days }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const red = useTint('red');
  const blue = useTint('blue');
  if (days == null) return null;
  const late = days < 0;
  return (
    <View style={{ paddingVertical: 3, paddingHorizontal: 8, borderRadius: 999, backgroundColor: late ? red.bg : blue.bg }}>
      <Text style={{ fontSize: 11, fontWeight: '700', color: late ? colors.red : colors.blue }}>
        {late ? t('dashboardFeed.daysLate', { count: -days }) : days === 0 ? t('dashboardFeed.today') : t('dashboardFeed.inDays', { count: days })}
      </Text>
    </View>
  );
}

export function AlertsCard({ items }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const go = useGo();
  const [kind, setKind] = useState('');
  const kinds = useMemo(() => summarizeAlerts(items), [items]);
  const shown = (kind ? items.filter((a) => a.kind === kind) : items).slice(0, 6);
  return (
    <Card>
      <CardHeader title={t('dashboardFeed.alerts')} icon="bell" iconColor={colors.orange} right={items.length ? <CountPill value={items.length} danger /> : null} />
      <CardBody style={{ paddingVertical: 14 }}>
        {items.length === 0 ? <Empty icon="circle-check" color={colors.primary} text={t('dashboardFeed.allClear')} /> : (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} style={[styles.kindsBar, { borderBottomColor: colors.border }]}>
              {kinds.map((k) => <KindChip key={k.key} k={k} active={kind === k.key} onPress={() => { haptics.select(); setKind(kind === k.key ? '' : k.key); }} />)}
            </ScrollView>
            {shown.map((a, i) => (
              <Row key={a.id} last={i === shown.length - 1} onPress={() => go(a.link)} chip={<Chip tone={a.color} icon={a.icon} />} name={a.name} sub={t(`dashboardFeed.alertKinds.${a.kind}`)} end={<AlertBadge days={a.days} />} />
            ))}
          </>
        )}
      </CardBody>
    </Card>
  );
}

function LauncherButton({ a, onPress }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const c = useToneColor(a.tone);
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={t(a.fullKey)} style={({ pressed }) => [styles.launcher, pressed && { backgroundColor: colors.bg }]}>
      {({ pressed }) => (
        <>
          <View style={[styles.launcherIcon, { backgroundColor: c.bg, transform: [{ scale: pressed ? 0.94 : 1 }] }]}>
            <Icon name={a.icon} size={20} color={c.fg} />
            {!a.noAdd ? (
              <View style={[styles.plus, { backgroundColor: c.fg, borderColor: colors.card }]}><Icon name="plus" size={9} color="#FFFFFF" /></View>
            ) : null}
          </View>
          <Text style={{ fontSize: 11.5, fontWeight: '600', color: colors.text, textAlign: 'center' }} numberOfLines={2}>{t(a.labelKey)}</Text>
        </>
      )}
    </Pressable>
  );
}

export function QuickActions() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const go = useGo();
  const [w, setW] = useState(0);
  const cols = w >= 700 ? 8 : 4;
  return (
    <Card>
      <CardHeader title={t('dashboardFeed.quickActions')} icon="bolt" iconColor={colors.purple} />
      <CardBody style={{ paddingVertical: 14 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 8 }} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
          {w > 0 && QUICK_ACTIONS.map((a) => (
            <View key={a.key} style={{ width: w / cols }}>
              <LauncherButton a={a} onPress={() => go(a.noAdd ? a.path : `${a.path}?new=1`)} />
            </View>
          ))}
        </View>
      </CardBody>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9, paddingHorizontal: 4, borderRadius: 8 },
  chartBlock: { paddingHorizontal: 4, paddingTop: 4, paddingBottom: 14, marginBottom: 4, borderBottomWidth: 1 },
  chartHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 },
  axisSpread: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  track: { position: 'absolute', left: 0, right: 0, bottom: 10, height: 2, borderRadius: 1 },
  timelineStop: { position: 'absolute', bottom: 0, width: 28, marginLeft: -14, alignItems: 'center', gap: 2 },
  timelineDot: { minWidth: 20, height: 20, paddingHorizontal: 3, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  eventCard: { width: 132, gap: 2, padding: 12, borderWidth: 1, borderRadius: 12 },
  eventTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  countdown: { alignSelf: 'flex-start', marginTop: 8, paddingVertical: 2, paddingHorizontal: 8, borderRadius: 999 },
  kindsBar: { paddingBottom: 12, marginBottom: 4, borderBottomWidth: 1, flexGrow: 0 },
  kind: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12, gap: 2 },
  launcher: { alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 2, borderRadius: 12 },
  launcherIcon: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  plus: { position: 'absolute', right: -4, bottom: -4, width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
});
