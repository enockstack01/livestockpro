import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Icon from '../../components/Icon';
import { useTheme } from '../../theme/ThemeProvider';
import { useChartColors } from '../../ui/charts';
import { Meter, Ring, SplitBar, TileGrid } from '../../ui/microViz';
import { Badge } from './GlanceTiles';

/* Key insights as tiles — figure, short label, small chart — identical to
   the web's client/src/components/dashboard/InsightTiles.jsx. The full
   sentence is the tile's accessibility label. */

const TONE_ICON = { good: 'circle-check', warn: 'triangle-exclamation', bad: 'circle-exclamation', info: 'circle-info' };
const PART_ICON = { recovered: 'heart-pulse', died: 'skull', female: 'venus', male: 'mars' };

function Figure({ children, sub, icon, iconColor }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      {icon ? <Icon name={icon} size={16} color={iconColor} /> : null}
      <Text style={[styles.figure, { color: colors.text }]} numberOfLines={1}>{children}</Text>
      {sub ? <Text style={[styles.sub, { color: colors.textLight, flexShrink: 1 }]} numberOfLines={1}>{sub}</Text> : null}
    </View>
  );
}

function Viz({ v, color, partColors, t }) {
  const { colors } = useTheme();
  if (v.kind === 'ring') {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Ring pct={v.pct} color={color} label={v.figure} />
        <View style={{ gap: 6, flexShrink: 1 }}>
          {v.sub ? <Text style={[styles.sub, { color: colors.textLight }]} numberOfLines={1}>{v.sub}</Text> : null}
          {v.overdue > 0 ? <View style={{ alignSelf: 'flex-start' }}><Badge tone="red" icon="clock">{v.overdue}</Badge></View> : null}
        </View>
      </View>
    );
  }
  if (v.kind === 'meter') {
    return (
      <View style={{ gap: 8 }}>
        <Figure sub={v.sub}>{v.figure}</Figure>
        <Meter value={v.value} max={v.max} color={color} />
      </View>
    );
  }
  if (v.kind === 'split') {
    const parts = v.parts.map((p) => ({ ...p, color: partColors[p.key] }));
    return (
      <View style={{ gap: 8 }}>
        <Figure>{v.figure}</Figure>
        <SplitBar parts={parts} />
        <View style={{ flexDirection: 'row', gap: 12 }}>
          {parts.map((p) => (
            <View key={p.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }} accessibilityLabel={`${t(`analytics.part.${p.key}`)}: ${p.value}`}>
              <Icon name={PART_ICON[p.key]} size={11} color={p.color} />
              <Text style={{ fontSize: 12, fontWeight: '700', color: colors.text }}>{p.value}</Text>
            </View>
          ))}
        </View>
      </View>
    );
  }
  if (v.kind === 'trend') {
    return (
      <View style={{ gap: 4 }}>
        <Figure icon={v.dir === 'up' ? 'arrow-trend-up' : 'arrow-trend-down'} iconColor={color}>{v.figure}</Figure>
        {v.sub ? <Text style={[styles.sub, { color: colors.textLight }]}>{v.sub}</Text> : null}
      </View>
    );
  }
  return <Figure icon={v.icon} iconColor={color}>{v.figure}</Figure>;
}

export default function InsightTiles({ insights }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const cc = useChartColors();
  const tone = { good: cc.status.good, warn: cc.status.warning, bad: cc.status.critical, info: cc.series[0] };
  const partColors = { recovered: cc.status.good, died: cc.neutral, female: cc.series[4], male: cc.series[0] };
  return (
    <TileGrid>
      {insights.map((ins) => {
        const color = tone[ins.tone];
        return (
          <View key={ins.id} accessible accessibilityLabel={t(`analytics.insight.${ins.key}`, ins.vars)} style={[styles.tile, { borderColor: colors.border, borderTopColor: color, backgroundColor: colors.card }]}>
            <View style={styles.labelRow}>
              <Icon name={TONE_ICON[ins.tone]} size={12} color={color} style={{ marginTop: 1 }} />
              <Text style={[styles.label, { color: colors.textLight }]} numberOfLines={2}>{t(`analytics.insightLabel.${ins.key}`, ins.vars)}</Text>
            </View>
            <View style={{ marginTop: 'auto' }}>
              <Viz v={ins.viz} color={color} partColors={partColors} t={t} />
            </View>
          </View>
        );
      })}
    </TileGrid>
  );
}

const styles = StyleSheet.create({
  tile: { flexGrow: 1, gap: 10, padding: 12, borderWidth: 1, borderTopWidth: 3, borderRadius: 12, minHeight: 142 },
  labelRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, minHeight: 30 },
  label: { flex: 1, fontSize: 11.5, fontWeight: '600', lineHeight: 15 },
  figure: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  sub: { fontSize: 11.5, fontWeight: '600' },
});
