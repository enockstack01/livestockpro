import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import Icon from '../../components/Icon';
import { useTheme } from '../../theme/ThemeProvider';
import { Card, CardHeader, CardBody, useTint } from '../../ui/kit';
import { Grid } from '../../ui/layout';
import { haptics } from '../../lib/haptics';
import { QUICK_ACTIONS } from '../../../../shared/dashboardFeed';

/* The dashboard's activity cards, laid out like the CropManager dashboard
   and identical to the web's (client/src/components/dashboard/
   DashboardFeed.jsx): Recent Activity (timeline), Upcoming Events (date
   badges), Alerts (colour-coded) and Quick Actions. */

const TONE = { green: 'green', orange: 'orange', red: 'red', blue: 'blue', purple: 'purple' };

function useGo() {
  const router = useRouter();
  return (path) => { haptics.tap(); router.replace(path); };
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

function TimelineDot({ tone, icon }) {
  const { colors } = useTheme();
  const tint = useTint(TONE[tone] || 'green');
  const fg = tone === 'green' ? colors.primary : colors[tone] || tint.fg;
  return (
    <View style={[styles.dot, { backgroundColor: tint.bg, borderColor: colors.card }]}>
      <Icon name={icon} size={9} color={fg} />
    </View>
  );
}

export function RecentActivity({ items }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const go = useGo();
  return (
    <Card>
      <CardHeader title={t('dashboardFeed.recentActivity')} icon="clock" iconColor={colors.purple} />
      <CardBody style={{ paddingVertical: 16 }}>
        {items.length === 0 ? <Empty icon="inbox" text={t('dashboardFeed.noActivity')} /> : (
          <View style={{ paddingLeft: 26 }}>
            <View style={[styles.line, { backgroundColor: colors.border }]} />
            {items.map((a, i) => (
              <Pressable key={a.id} onPress={() => go(a.link)} style={{ paddingBottom: i === items.length - 1 ? 0 : 16 }}>
                <View style={{ position: 'absolute', left: -26, top: 0 }}><TimelineDot tone={a.color} icon={a.icon} /></View>
                <Text style={{ fontSize: 13, color: colors.text, lineHeight: 19 }}>
                  <Text style={{ fontWeight: '600' }}>{a.title}</Text>{a.text ? ` — ${a.text}` : ''}
                </Text>
                <Text style={{ fontSize: 11, color: colors.textLight, marginTop: 2 }}>{a.date}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </CardBody>
    </Card>
  );
}

export function UpcomingEvents({ items }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const go = useGo();
  return (
    <Card>
      <CardHeader title={t('dashboardFeed.upcomingEvents')} icon="calendar-check" iconColor={colors.blue} />
      <CardBody style={{ paddingVertical: 8 }}>
        {items.length === 0 ? <Empty icon="calendar" text={t('dashboardFeed.noUpcoming')} /> : items.map((e, i) => (
          <Pressable key={e.id} onPress={() => go(e.link)} style={[styles.event, i < items.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
            <View style={[styles.dateBadge, { backgroundColor: colors.primaryLight }]}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: colors.primary }}>{e.day}</Text>
              <Text style={{ fontSize: 9, fontWeight: '600', color: colors.primary, opacity: 0.75, textTransform: 'uppercase' }}>{e.month}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text }} numberOfLines={2}>{e.title}</Text>
              <Text style={{ fontSize: 11, color: colors.textLight, marginTop: 2 }} numberOfLines={1}>{e.meta}</Text>
            </View>
          </Pressable>
        ))}
      </CardBody>
    </Card>
  );
}

const ALERT_COLOR = { red: 'red', orange: 'orange', blue: 'blue', purple: 'blue', green: 'green' };

function AlertRow({ a, onPress }) {
  const { colors } = useTheme();
  const tone = ALERT_COLOR[a.color] || 'blue';
  const tint = useTint(tone);
  const fg = tone === 'green' ? colors.primary : colors[tone];
  return (
    <Pressable onPress={onPress} style={[styles.alert, { backgroundColor: tint.bg, borderLeftColor: fg }]}>
      <Icon name={a.icon} size={14} color={fg} style={{ marginTop: 2 }} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 12, fontWeight: '600', color: fg, marginBottom: 2 }}>{a.title}</Text>
        <Text style={{ fontSize: 12, color: colors.textLight }}>{a.sub}</Text>
      </View>
    </Pressable>
  );
}

export function AlertsCard({ items }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const go = useGo();
  return (
    <Card>
      <CardHeader title={t('dashboardFeed.alerts')} icon="bell" iconColor={colors.orange} />
      <CardBody style={{ paddingVertical: 16, gap: 8 }}>
        {items.length === 0
          ? <Empty icon="circle-check" color={colors.primary} text={t('dashboardFeed.allClear')} />
          : items.slice(0, 8).map((a) => <AlertRow key={a.id} a={a} onPress={() => go(a.link)} />)}
      </CardBody>
    </Card>
  );
}

export function QuickActions() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const go = useGo();
  return (
    <Card>
      <CardHeader title={t('dashboardFeed.quickActions')} icon="bolt" iconColor={colors.purple} />
      <CardBody style={{ paddingVertical: 16 }}>
        <Grid minItemWidth={150} gap={10}>
          {QUICK_ACTIONS.map((a) => (
            <Pressable
              key={a.key}
              onPress={() => go(a.noAdd ? a.path : `${a.path}?new=1`)}
              style={({ pressed }) => [styles.action, { borderColor: pressed ? colors.primary : colors.border, backgroundColor: pressed ? colors.primaryLight : colors.card }]}
            >
              <View style={[styles.actionIcon, { backgroundColor: colors.primaryLight }]}><Icon name={a.icon} size={12} color={colors.primary} /></View>
              <Text style={{ flex: 1, fontSize: 12, fontWeight: '500', color: colors.text }} numberOfLines={2}>{t(a.labelKey)}</Text>
            </Pressable>
          ))}
        </Grid>
      </CardBody>
    </Card>
  );
}

const styles = StyleSheet.create({
  line: { position: 'absolute', left: 10, top: 6, bottom: 6, width: 2 },
  dot: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  event: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  dateBadge: { width: 44, height: 44, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  alert: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 8, borderLeftWidth: 3 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 14, borderWidth: 1, borderRadius: 8 },
  actionIcon: { width: 28, height: 28, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
});
