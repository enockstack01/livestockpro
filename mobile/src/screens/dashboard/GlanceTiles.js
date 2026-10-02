import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Icon from '../../components/Icon';
import { useTheme } from '../../theme/ThemeProvider';
import { useTint } from '../../ui/kit';
import { useChartColors } from '../../ui/charts';
import { Meter, MiniColumns, Sparkline, TileGrid } from '../../ui/microViz';
import { haptics } from '../../lib/haptics';
import { fmtMoney } from '../../../../shared/chartPalette';

/* "Farm at a glance": each headline number with a small chart behind it —
   identical to the web's client/src/components/dashboard/GlanceTiles.jsx.
   Data from shared/analytics.js computeGlance(). */

function Tile({ icon, tone, label, value, badge, onPress, children }) {
  const { colors } = useTheme();
  const tint = useTint(tone);
  const fg = tone === 'green' ? colors.primary : colors[tone];
  return (
    <Pressable
      onPress={() => { haptics.tap(); onPress(); }}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
      style={({ pressed }) => [styles.tile, { borderColor: pressed ? colors.primary : colors.border, backgroundColor: colors.card, transform: [{ scale: pressed ? 0.98 : 1 }] }]}
    >
      <View style={styles.head}>
        <View style={[styles.icon, { backgroundColor: tint.bg }]}><Icon name={icon} size={12} color={fg} /></View>
        <Text style={[styles.label, { color: colors.textLight }]} numberOfLines={2}>{label}</Text>
      </View>
      <View style={styles.valueRow}>
        <Text style={[styles.value, { color: colors.text }]} numberOfLines={1}>{value}</Text>
        {badge}
      </View>
      <View style={{ marginTop: 'auto', paddingTop: 2 }}>{children}</View>
    </Pressable>
  );
}

export function Badge({ tone, icon, children }) {
  const { colors } = useTheme();
  const tint = useTint(tone);
  const fg = tone === 'green' ? colors.primary : colors[tone];
  return (
    <View style={[styles.badge, { backgroundColor: tint.bg }]}>
      <Icon name={icon} size={9} color={fg} />
      <Text style={{ fontSize: 11, fontWeight: '700', color: fg }}>{children}</Text>
    </View>
  );
}

export default function GlanceTiles({ g, onOpen }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const cc = useChartColors();
  const muted = { fontSize: 11.5, color: colors.textLight };
  const caption = { fontSize: 11, fontWeight: '600', color: colors.textLight, marginTop: 6 };

  return (
    <TileGrid>
      <Tile icon="cow" tone="green" label={t('dashboardPage.totalAnimals')} value={g.animals.total.toLocaleString()} onPress={() => onOpen('/animals')}
        badge={g.animals.addedThisMonth > 0 ? <Badge tone="green" icon="arrow-up">{g.animals.addedThisMonth}</Badge> : null}>
        <Sparkline values={g.animals.series} color={cc.brand} />
      </Tile>

      <Tile icon="paw" tone="purple" label={t('dashboardPage.pregnant')} value={String(g.pregnant.count)} onPress={() => onOpen('/breeding')}
        badge={g.pregnant.females > 0 ? <Text style={muted}><Icon name="venus" size={10} color={colors.textLight} /> {g.pregnant.females}</Text> : null}>
        <Meter value={g.pregnant.count} max={Math.max(g.pregnant.count, g.pregnant.females)} color={cc.series[6]} style={{ marginTop: 12 }} />
        <Text style={caption}>{g.pregnant.females > 0 ? Math.round((g.pregnant.count / g.pregnant.females) * 100) : 0}%</Text>
      </Tile>

      <Tile icon="baby" tone="blue" label={t('dashboardPage.newborns')} value={String(g.newborns.total)} onPress={() => onOpen('/breeding')}>
        <MiniColumns values={g.newborns.series} color={cc.series[0]} />
      </Tile>

      <Tile icon="list-check" tone={g.tasks.overdue > 0 ? 'red' : 'orange'} label={t('dashboardPage.pendingTasks')} value={String(g.tasks.pending)} onPress={() => onOpen('/tasks')}
        badge={g.tasks.overdue > 0 ? <Badge tone="red" icon="clock">{g.tasks.overdue}</Badge> : null}>
        <Meter value={g.tasks.done} max={g.tasks.total} color={cc.brand} style={{ marginTop: 12 }} />
        <Text style={caption}><Icon name="circle-check" size={10} color={cc.brand} /> {g.tasks.done} / {g.tasks.total}</Text>
      </Tile>

      <Tile icon="arrow-trend-up" tone="blue" label={t('dashboardPage.monthlyIncome')} value={fmtMoney(g.income.month)} onPress={() => onOpen('/finance')}>
        <Sparkline values={g.income.series} color={cc.positive} />
      </Tile>

      <Tile icon="arrow-trend-down" tone="red" label={t('dashboardPage.monthlyExpenses')} value={fmtMoney(g.expense.month)} onPress={() => onOpen('/finance')}>
        <Sparkline values={g.expense.series} color={cc.negative} />
      </Tile>

      <Tile wide icon="scale-balanced" tone={g.net.month >= 0 ? 'blue' : 'red'} label={t('dashboardPage.profitLoss')} value={fmtMoney(g.net.month)} onPress={() => onOpen('/finance')}
        badge={<Text style={muted}>{t('dashboardPage.sixMonths')}: <Text style={{ fontWeight: '700', color: colors.text }}>{fmtMoney(g.net.total)}</Text></Text>}>
        <MiniColumns values={g.net.series} color={cc.positive} negColor={cc.negative} height={48} />
        <View style={styles.axis}>{g.monthNames.map((m, i) => <Text key={i} style={{ flex: 1, textAlign: 'center', fontSize: 10, color: colors.textLight }}>{m}</Text>)}</View>
      </Tile>
    </TileGrid>
  );
}

const styles = StyleSheet.create({
  tile: { flexGrow: 1, gap: 6, padding: 12, paddingBottom: 10, borderWidth: 1, borderRadius: 12, minHeight: 128 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  icon: { width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  label: { flex: 1, fontSize: 11.5, fontWeight: '600', lineHeight: 14 },
  valueRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  value: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 2, paddingHorizontal: 7, borderRadius: 999 },
  axis: { flexDirection: 'row', gap: 4, marginTop: 4 },
});
