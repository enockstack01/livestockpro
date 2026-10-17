import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import Icon from '../../components/Icon';
import { useTheme } from '../../theme/ThemeProvider';
import { useBreakpoint } from '../../ui/layout';
import { haptics } from '../../lib/haptics';
import { computeHerdProfile } from '../../../../shared/dashboardFeed';
import GlanceTiles from './GlanceTiles';

/* Herd profile overview, the twin of the web's
   (client/src/components/dashboard/HerdProfile.jsx): Pine farm banner and
   species chips, then five charts that show what is happening on the farm,
   every one labelled with its numbers: herd health, herd size over 12
   months with the animals added, born and lost each month, this month's
   movement, the herd by species (or breed) split female and male, and the
   age structure. One chart per row on phones, two per row on tablets.
   Brand colours only: Leaf main series, Amber comparison, Alert Red for
   losses and critical. */

const LEAF = '#2E7D32';
const AMBER = '#F9A825';
const RED = '#C62828';
const STONE = '#8A948B';
const INK = '#1C2B1E';

function ChartCard({ icon, title, aside, children, style }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.chartCard, { borderColor: colors.border, backgroundColor: colors.card }, style]}>
      <View style={styles.chartHead}>
        <View style={[styles.chartIcon, { backgroundColor: colors.leaf }]}><Icon name={icon} size={11} color="#FFFFFF" /></View>
        <Text style={[styles.chartTitle, { color: colors.primaryDark }]} numberOfLines={2}>{title}</Text>
        {aside}
      </View>
      {children}
    </View>
  );
}

function Pill({ value, children }) {
  return (
    <View style={[styles.pill, { backgroundColor: value < 0 ? RED : '#1B5E20' }]}>
      <Text style={styles.pillText}>{children}</Text>
    </View>
  );
}

function Note({ children }) {
  const { colors } = useTheme();
  return <Text style={{ fontSize: 12, color: colors.textLight, marginTop: 10, lineHeight: 17 }}>{children}</Text>;
}

function Legend({ items }) {
  const { colors } = useTheme();
  return (
    <View style={styles.legend}>
      {items.map(([label, color]) => (
        <View key={label} style={styles.legendItem}>
          <View style={[styles.legendSwatch, { backgroundColor: color }]} />
          <Text style={{ fontSize: 11.5, color: colors.textLight }}>{label}</Text>
        </View>
      ))}
    </View>
  );
}

function HealthRing({ segments, total, pct, label, size, colors }) {
  const stroke = 15;
  const r = (size - stroke) / 2 - 1;
  const c = size / 2;
  const circ = 2 * Math.PI * r;
  const visible = segments.filter((s) => s.value > 0 && total > 0);
  const gap = visible.length > 1 ? 3 : 0;
  let offset = 0;
  const arcs = visible.map((s) => {
    const len = Math.max(0, (s.value / total) * circ - gap);
    const arc = { ...s, dash: `${len} ${circ - len}`, offset: -offset };
    offset += (s.value / total) * circ;
    return arc;
  });
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={[StyleSheet.absoluteFill, { transform: [{ rotate: '-90deg' }] }]}>
        <Circle cx={c} cy={c} r={r} stroke={colors.border} strokeWidth={stroke} fill="none" />
        {arcs.map((a) => <Circle key={a.key} cx={c} cy={c} r={r} stroke={a.color} strokeWidth={stroke} strokeDasharray={a.dash} strokeDashoffset={a.offset} fill="none" />)}
      </Svg>
      <Text style={{ fontSize: Math.round(size * 0.19), fontWeight: '800', color: colors.text }}>{pct}%</Text>
      <Text style={{ fontSize: 11, color: colors.textLight }}>{label}</Text>
    </View>
  );
}

function HealthChart({ p, t, enumLabel, colors }) {
  const total = p.segments.reduce((s, x) => s + x.value, 0);
  return (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
        <HealthRing segments={p.segments} total={total} pct={p.healthyPct} label={t('herdProfile.healthy')} size={136} colors={colors} />
        <View style={{ flex: 1, minWidth: 130, gap: 9 }}>
          {p.segments.map((s) => (
            <View key={s.key} style={[styles.statusRow, s.value === 0 && { opacity: 0.55 }]}>
              <View style={[styles.statusDot, { backgroundColor: s.color }]} />
              <Text style={[styles.statusLabel, { color: colors.text }]} numberOfLines={1}>{enumLabel('animalHealthStatus', s.key)}</Text>
              <Text style={[styles.statusValue, { color: colors.text }]}>{s.value}</Text>
            </View>
          ))}
          {p.deceased > 0 ? (
            <View style={[styles.statusRow, { opacity: 0.55 }]}>
              <View style={[styles.statusDot, { backgroundColor: STONE }]} />
              <Text style={[styles.statusLabel, { color: colors.text }]}>{enumLabel('animalHealthStatus', 'Deceased')}</Text>
              <Text style={[styles.statusValue, { color: colors.text }]}>{p.deceased}</Text>
            </View>
          ) : null}
        </View>
      </View>
      <Note>{t('herdProfile.cases30', { total: p.cases.total, recovered: p.cases.recovered })}</Note>
    </>
  );
}

/* Herd size line (value on every other point and the last), with the
   month's added and born above the baseline and losses below it. */
function TrendChart({ trend, t, colors }) {
  const [width, setWidth] = useState(0);
  const w = Math.max(width, 260);
  const padL = 10;
  const padR = 12;
  const lineTop = 20;
  const lineH = 96;
  const moveTop = lineTop + lineH + 24;
  const moveH = 44;
  const labelY = moveTop + moveH + 16;
  const h = labelY + 6;
  const n = trend.length;
  const step = (w - padL - padR) / Math.max(1, n - 1);
  const x = (i) => padL + i * step;
  const max = Math.max(1, ...trend.map((m) => m.herd));
  const min = Math.min(...trend.map((m) => m.herd));
  const lo = Math.max(0, min - Math.ceil((max - min) * 0.25) - 1);
  const y = (v) => lineTop + lineH - ((v - lo) / Math.max(1, max - lo)) * lineH;
  const pts = trend.map((m, i) => [x(i), y(m.herd)]);
  const line = pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`).join(' ');
  const area = `${line} L${x(n - 1).toFixed(1)},${lineTop + lineH} L${x(0).toFixed(1)},${lineTop + lineH} Z`;
  const moveMax = Math.max(1, ...trend.map((m) => Math.max(m.added + m.born, m.lost)));
  const mid = moveTop + moveH * 0.62;
  const barW = Math.min(16, step * 0.5);
  const show = (i) => i === n - 1 || i % 2 === 1;

  return (
    <View onLayout={(e) => setWidth(Math.floor(e.nativeEvent.layout.width))}>
      {width > 0 ? (
        <Svg width={w} height={h}>
          <Path d={area} fill={LEAF} opacity={0.1} />
          <Path d={line} fill="none" stroke={LEAF} strokeWidth={2.5} strokeLinejoin="round" />
          {pts.map(([px, py], i) => (
            <Circle key={`p${i}`} cx={px} cy={py} r={i === n - 1 ? 4.5 : 3} fill={i === n - 1 ? LEAF : colors.card} stroke={LEAF} strokeWidth={2} />
          ))}
          {pts.map(([px, py], i) => (show(i) ? (
            <SvgText key={`v${i}`} x={px} y={py - 8} fontSize={i === n - 1 ? 12 : 10} fontWeight="700" fill={colors.text} textAnchor="middle">{trend[i].herd}</SvgText>
          ) : null))}
          <Line x1={padL - 4} x2={w - padR + 4} y1={mid} y2={mid} stroke={colors.border} />
          {trend.map((m, i) => {
            const upA = (m.added / moveMax) * (moveH * 0.6);
            const upB = (m.born / moveMax) * (moveH * 0.6);
            const down = (m.lost / moveMax) * (moveH * 0.36);
            const cx = x(i);
            const up = m.added + m.born;
            return (
              <G key={m.key}>
                {m.added > 0 ? <Rect x={cx - barW / 2} y={mid - upA} width={barW} height={upA} rx={2} fill={LEAF} /> : null}
                {m.born > 0 ? <Rect x={cx - barW / 2} y={mid - upA - upB} width={barW} height={upB} rx={2} fill={AMBER} /> : null}
                {up > 0 ? <SvgText x={cx} y={mid - upA - upB - 3} fontSize={9} fill={colors.textLight} textAnchor="middle">{`+${up}`}</SvgText> : null}
                {m.lost > 0 ? <Rect x={cx - barW / 2} y={mid + 1} width={barW} height={down} rx={2} fill={RED} /> : null}
                {m.lost > 0 ? <SvgText x={cx} y={mid + down + 10} fontSize={9} fill={RED} textAnchor="middle">{`-${m.lost}`}</SvgText> : null}
                {show(i) ? <SvgText x={cx} y={labelY} fontSize={10} fill={colors.textLight} textAnchor="middle">{m.label}</SvgText> : null}
              </G>
            );
          })}
        </Svg>
      ) : <View style={{ height: h }} />}
      <Legend items={[[t('herdProfile.added'), LEAF], [t('herdProfile.born'), AMBER], [t('herdProfile.lost'), RED]]} />
    </View>
  );
}

function Movement({ month, t, colors }) {
  const rows = [
    { key: 'added', icon: 'plus', value: month.added, color: LEAF, ink: '#FFFFFF' },
    { key: 'born', icon: 'baby', value: month.born, color: AMBER, ink: INK },
    { key: 'lost', icon: 'minus', value: month.lost, color: RED, ink: '#FFFFFF' },
  ];
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <View style={{ gap: 12 }}>
      {rows.map((r) => (
        <View key={r.key} style={styles.moveRow}>
          <View style={[styles.moveIcon, { backgroundColor: r.color }]}><Icon name={r.icon} size={12} color={r.ink} /></View>
          <Text style={{ width: 64, fontSize: 13, color: colors.text }} numberOfLines={1}>{t(`herdProfile.${r.key}`)}</Text>
          <View style={[styles.moveTrack, { backgroundColor: colors.bg }]}>
            <View style={{ width: `${r.value ? Math.max(6, (r.value / max) * 100) : 0}%`, height: '100%', borderRadius: 5, backgroundColor: r.color }} />
          </View>
          <Text style={{ width: 30, textAlign: 'right', fontSize: 15, fontWeight: '800', color: colors.text }}>{r.value}</Text>
        </View>
      ))}
      <View style={[styles.netRow, { borderTopColor: colors.border }]}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text }}>{t('herdProfile.net')}</Text>
        <Pill value={month.net}>{`${month.net > 0 ? '+' : ''}${month.net}`}</Pill>
      </View>
      <Note>{t('herdProfile.bornNote')}</Note>
    </View>
  );
}

function Composition({ groups, label, t, colors }) {
  const shown = groups.slice(0, 7);
  const max = Math.max(1, ...shown.map((g) => g.count));
  return (
    <View style={{ gap: 12 }}>
      {shown.map((g) => (
        <View key={g.name}>
          <View style={styles.compTop}>
            <Text style={{ flex: 1, fontSize: 13, fontWeight: '700', color: colors.text }} numberOfLines={1}>{label(g.name)}</Text>
            <Text style={{ fontSize: 11.5, color: colors.textLight }}>{t('herdProfile.healthyOf', { healthy: g.healthy, count: g.count })}</Text>
            <Text style={{ minWidth: 26, textAlign: 'right', fontSize: 14, fontWeight: '800', color: colors.text }}>{g.count}</Text>
          </View>
          <View style={[styles.stack, { width: `${Math.max(14, (g.count / max) * 100)}%` }]}>
            {[['female', LEAF, '#FFFFFF'], ['male', AMBER, INK], ['unknown', STONE, '#FFFFFF']].map(([k, bg, ink]) => (g[k] > 0 ? (
              <View key={k} style={{ flex: g[k], backgroundColor: bg, alignItems: 'center', justifyContent: 'center', minWidth: 18 }}>
                <Text style={{ fontSize: 10.5, fontWeight: '800', color: ink }}>{g[k]}</Text>
              </View>
            ) : null))}
          </View>
        </View>
      ))}
      {groups.length > shown.length ? <Note>{t('herdProfile.more', { count: groups.length - shown.length })}</Note> : null}
      <Legend items={[[t('herdProfile.female'), LEAF], [t('herdProfile.male'), AMBER], [t('herdProfile.unknown'), STONE]]} />
    </View>
  );
}

function Ages({ ages, unknown, max, t, colors }) {
  return (
    <View>
      <View style={styles.agesRow}>
        {ages.map((a) => (
          <View key={a.key} style={styles.ageCol}>
            <Text style={{ fontSize: 13, fontWeight: '800', color: colors.text }}>{a.value}</Text>
            <View style={styles.ageTrack}>
              <View style={{ width: '100%', height: `${a.value ? Math.max(6, (a.value / max) * 100) : 0}%`, backgroundColor: LEAF, borderTopLeftRadius: 6, borderTopRightRadius: 6, borderBottomLeftRadius: 2, borderBottomRightRadius: 2 }} />
            </View>
            <Text style={{ fontSize: 10, color: colors.textLight, textAlign: 'center', lineHeight: 13 }} numberOfLines={2}>{t(`analytics.${a.key}`)}</Text>
          </View>
        ))}
      </View>
      {unknown > 0 ? <Note>{t('herdProfile.ageUnknown', { count: unknown })}</Note> : null}
    </View>
  );
}

export default function HerdProfileCard({ animals, health, breeding, profile, glance, onOpen }) {
  const { t, i18n } = useTranslation();
  const { colors, shadow } = useTheme();
  const { width } = useBreakpoint();
  const [species, setSpecies] = useState('');
  const p = useMemo(() => computeHerdProfile(animals, species, { health, breeding, lang: i18n.language }), [animals, species, health, breeding, i18n.language]);
  const enumLabel = (group, v) => t(`enums.${group}.${v}`, { defaultValue: v });
  const groupLabel = (name) => (p.groupBy === 'species' ? enumLabel('species', name) : name);
  const twoUp = width >= 700;
  const half = twoUp ? { flexBasis: '48%', flexGrow: 1 } : null;

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, shadowColor: shadow.color, shadowOpacity: shadow.opacity, shadowRadius: shadow.radius, shadowOffset: shadow.offset, elevation: shadow.elevation }]}>
      <View style={styles.banner}>
        <View style={styles.eyebrowRow}>
          <Icon name="cow" size={11} color="rgba(255,255,255,0.9)" />
          <Text style={styles.eyebrow}>{t('herdProfile.eyebrow')}</Text>
        </View>
        <View style={styles.head}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.farmName} numberOfLines={2}>{profile?.farm_name || t('herdProfile.myFarm')}</Text>
            <Text style={styles.farmPlace} numberOfLines={1}>{profile?.location || t('herdProfile.noLocation')}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.count}>{p.living.toLocaleString()}</Text>
            <Text style={styles.countSub} numberOfLines={1}>{species ? `${enumLabel('species', species)} · ` : ''}{t('herdProfile.livingHerd')}</Text>
          </View>
        </View>
      </View>

      {p.speciesList.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingTop: 14 }}>
          {['', ...p.speciesList].map((s) => {
            const active = s === species;
            return (
              <Pressable key={s || 'all'} onPress={() => { haptics.select(); setSpecies(s); }} style={[styles.chip, { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary : colors.card }]} accessibilityRole="tab" accessibilityState={{ selected: active }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: active ? '#FFFFFF' : colors.text }}>{s ? enumLabel('species', s) : t('herdProfile.allSpecies')}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      <View style={styles.body}>
        {p.living > 0 || p.deceased > 0 ? (
          <View style={styles.charts}>
            <ChartCard icon="heart-pulse" title={t('herdProfile.healthTitle')} style={half}>
              <HealthChart p={p} t={t} enumLabel={enumLabel} colors={colors} />
            </ChartCard>
            <ChartCard icon="arrow-right-arrow-left" title={t('herdProfile.movementTitle')} style={half} aside={<Text style={{ fontSize: 11.5, color: colors.textLight }}>{p.month.label}</Text>}>
              <Movement month={p.month} t={t} colors={colors} />
            </ChartCard>
            <ChartCard icon="chart-line" title={t('herdProfile.trendTitle')} style={{ flexBasis: '100%' }}
              aside={<Pill value={p.yearChange}>{t('herdProfile.inYear', { value: `${p.yearChange > 0 ? '+' : ''}${p.yearChange}` })}</Pill>}>
              <TrendChart trend={p.trend} t={t} colors={colors} />
            </ChartCard>
            <ChartCard icon="layer-group" title={p.groupBy === 'species' ? t('herdProfile.bySpecies') : t('herdProfile.byBreed')} style={half}>
              <Composition groups={p.byGroup} label={groupLabel} t={t} colors={colors} />
            </ChartCard>
            <ChartCard icon="hourglass-half" title={t('herdProfile.ageTitle')} style={half}>
              <Ages ages={p.ages} unknown={p.ageUnknown} max={p.maxAge} t={t} colors={colors} />
            </ChartCard>
          </View>
        ) : <Text style={{ textAlign: 'center', fontSize: 13, color: colors.textLight, paddingVertical: 8 }}>{t('herdProfile.empty')}</Text>}

        <View>
          <Text style={[styles.section, { color: colors.textLight }]}>{t('herdProfile.atAGlance')}</Text>
          <GlanceTiles g={glance} onOpen={onOpen} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 12, overflow: 'hidden', marginBottom: 24 },
  banner: { paddingTop: 18, paddingBottom: 16, paddingHorizontal: 18, backgroundColor: '#14532D' },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  eyebrow: { fontSize: 11.5, fontWeight: '700', color: 'rgba(255,255,255,0.9)' },
  head: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 },
  farmName: { fontSize: 20, fontWeight: '800', color: '#FFFFFF', lineHeight: 25 },
  farmPlace: { fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  count: { fontSize: 24, fontWeight: '800', color: '#FFFFFF' },
  countSub: { fontSize: 11, color: 'rgba(255,255,255,0.85)' },
  chip: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1 },
  body: { padding: 16, gap: 22 },
  charts: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  chartCard: { borderWidth: 1, borderRadius: 12, padding: 14, flexBasis: '100%', flexGrow: 1, minWidth: 0 },
  chartHead: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 12 },
  chartIcon: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  chartTitle: { flex: 1, fontSize: 14.5, fontWeight: '700' },
  pill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  pillText: { color: '#FFFFFF', fontSize: 11.5, fontWeight: '700' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendSwatch: { width: 10, height: 10, borderRadius: 3 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusLabel: { flex: 1, fontSize: 13 },
  statusValue: { fontSize: 14, fontWeight: '800' },
  moveRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  moveIcon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  moveTrack: { flex: 1, height: 10, borderRadius: 5, overflow: 'hidden' },
  netRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, paddingTop: 10 },
  compTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 5 },
  stack: { flexDirection: 'row', height: 20, borderRadius: 6, overflow: 'hidden', gap: 2 },
  agesRow: { flexDirection: 'row', gap: 8, height: 160, alignItems: 'flex-end' },
  ageCol: { flex: 1, height: '100%', alignItems: 'center', justifyContent: 'flex-end', gap: 5 },
  ageTrack: { flex: 1, width: '100%', maxWidth: 42, justifyContent: 'flex-end' },
  section: { fontSize: 12, fontWeight: '700', marginBottom: 12 },
});
