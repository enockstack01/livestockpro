import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import Icon from '../../components/Icon';
import { useTheme } from '../../theme/ThemeProvider';
import { useBreakpoint } from '../../ui/layout';
import { haptics } from '../../lib/haptics';
import { computeHerdProfile } from '../../../../shared/dashboardFeed';
import GlanceTiles from './GlanceTiles';

/* Herd Profile — the first section of the dashboard, laid out like the
   CropManager Farm Profile card and identical to the web's
   (client/src/components/dashboard/HerdProfile.jsx): branded farm banner,
   species chips, herd-health ring + legend, "Farm at a glance" tiles, and
   the herd by species (or by breed once a species is picked). */

function HealthRing({ segments, total, pct, label, size, colors }) {
  const stroke = Math.round(size * 0.11);
  const r = (size - stroke) / 2 - 2;
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
        <Circle cx={c} cy={c} r={r} stroke={colors.bg} strokeWidth={stroke} fill="none" />
        {arcs.map((a) => (
          <Circle key={a.key} cx={c} cy={c} r={r} stroke={a.color} strokeWidth={stroke} strokeDasharray={a.dash} strokeDashoffset={a.offset} strokeLinecap={gap ? 'butt' : 'round'} fill="none" />
        ))}
      </Svg>
      <Text style={{ fontSize: Math.round(size * 0.2), fontWeight: '800', color: colors.text }}>{pct}%</Text>
      <Text style={{ fontSize: 11, fontWeight: '500', color: colors.textLight }}>{label}</Text>
    </View>
  );
}

export default function HerdProfileCard({ animals, profile, glance, onOpen }) {
  const { t } = useTranslation();
  const { colors, shadow } = useTheme();
  const { width, isWide } = useBreakpoint();
  const [species, setSpecies] = useState('');
  const p = useMemo(() => computeHerdProfile(animals, species), [animals, species]);
  const enumLabel = (group, v) => t(`enums.${group}.${v}`, { defaultValue: v });
  const shown = p.byGroup.slice(0, 8);
  const ringTotal = p.segments.reduce((s, x) => s + x.value, 0);
  const ringSize = width <= 480 ? 150 : 170;

  const health = p.living > 0 ? (
    <View style={styles.health}>
      <HealthRing segments={p.segments} total={ringTotal} pct={p.healthyPct} label={t('herdProfile.healthy')} size={ringSize} colors={colors} />
      <View style={{ flex: 1, gap: 9, maxWidth: 320 }}>
        {p.segments.map((s) => (
          <View key={s.key} style={[styles.legendRow, s.value === 0 && { opacity: 0.45 }]}>
            <View style={[styles.legendDot, { backgroundColor: s.color }]} />
            <Text style={[styles.legendLabel, { color: colors.textLight }]} numberOfLines={1}>{enumLabel('animalHealthStatus', s.key)}</Text>
            <Text style={[styles.legendValue, { color: colors.text }]}>{s.value}</Text>
          </View>
        ))}
        {p.deceased > 0 ? (
          <View style={[styles.legendRow, { opacity: 0.45 }]}>
            <View style={[styles.legendDot, { backgroundColor: colors.textLight }]} />
            <Text style={[styles.legendLabel, { color: colors.textLight }]}>{enumLabel('animalHealthStatus', 'Deceased')}</Text>
            <Text style={[styles.legendValue, { color: colors.text }]}>{p.deceased}</Text>
          </View>
        ) : null}
      </View>
    </View>
  ) : <Text style={{ textAlign: 'center', fontSize: 13, color: colors.textLight, paddingVertical: 8 }}>{t('herdProfile.empty')}</Text>;

  const glanceSection = (
    <View>
      <Text style={[styles.section, { color: colors.textLight }]}>{t('herdProfile.atAGlance')}</Text>
      <GlanceTiles g={glance} onOpen={onOpen} />
    </View>
  );

  const groups = shown.length ? (
    <View>
      <Text style={[styles.section, { color: colors.textLight }]}>{p.groupBy === 'species' ? t('herdProfile.bySpecies') : t('herdProfile.byBreed')}</Text>
      <View style={{ gap: 12 }}>
        {shown.map((g) => (
          <View key={g.name}>
            <View style={styles.groupRow}>
              <Text style={[styles.groupName, { color: colors.text }]} numberOfLines={1}>{p.groupBy === 'species' ? enumLabel('species', g.name) : g.name}</Text>
              <Text style={{ fontSize: 11, color: colors.textLight }}>{t('herdProfile.healthyOf', { healthy: g.healthy, count: g.count })}</Text>
              <Text style={[styles.groupCount, { color: colors.text }]}>{g.count}</Text>
            </View>
            <View style={[styles.bar, { backgroundColor: colors.bg }]}>
              <View style={{ width: `${Math.max(4, (g.count / p.maxGroup) * 100)}%`, height: '100%', borderRadius: 4, backgroundColor: colors.primary }} />
            </View>
          </View>
        ))}
        {p.byGroup.length > shown.length ? <Text style={{ fontSize: 11, color: colors.textLight }}>{t('herdProfile.more', { count: p.byGroup.length - shown.length })}</Text> : null}
      </View>
    </View>
  ) : null;

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, shadowColor: shadow.color, shadowOpacity: shadow.opacity, shadowRadius: shadow.radius, shadowOffset: shadow.offset, elevation: shadow.elevation }]}>
      {/* Branded banner */}
      <View style={styles.banner}>
        <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" preserveAspectRatio="none">
          <Defs>
            <LinearGradient id="herdBanner" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor="#1B5E20" />
              <Stop offset="1" stopColor="#1B5E20" />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#herdBanner)" />
        </Svg>
        <View style={styles.bannerCircle} />
        <View style={styles.eyebrowRow}>
          <Icon name="cow" size={11} color="rgba(255,255,255,0.85)" />
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

      {/* Species chips */}
      {p.speciesList.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 20, paddingTop: 14 }}>
          {['', ...p.speciesList].map((s) => {
            const active = s === species;
            return (
              <Pressable key={s || 'all'} onPress={() => { haptics.select(); setSpecies(s); }} style={[styles.chip, { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary : colors.card }]} accessibilityRole="tab" accessibilityState={{ selected: active }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: active ? '#FFFFFF' : colors.text }}>{s ? enumLabel('species', s) : t('herdProfile.allSpecies')}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      {/* Body: side by side on wide screens, stacked on phones */}
      <View style={styles.body}>
        {isWide ? (
          <>
            <View style={{ flexDirection: 'row', gap: 32, alignItems: 'center' }}>
              <View style={{ width: 380 }}>{health}</View>
              <View style={{ flex: 1 }}>{glanceSection}</View>
            </View>
            {groups}
          </>
        ) : (
          <>
            {health}
            {glanceSection}
            {groups}
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 10, overflow: 'hidden', marginBottom: 24 },
  banner: { overflow: 'hidden', paddingTop: 18, paddingBottom: 16, paddingHorizontal: 20, backgroundColor: '#1B5E20' },
  bannerCircle: { display: 'none' },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  eyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', color: 'rgba(255,255,255,0.85)' },
  head: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 },
  farmName: { fontSize: 20, fontWeight: '800', color: '#FFFFFF', lineHeight: 25 },
  farmPlace: { fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  count: { fontSize: 22, fontWeight: '800', color: '#FFFFFF' },
  countSub: { fontSize: 11, fontWeight: '500', color: 'rgba(255,255,255,0.8)' },
  chip: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1 },
  body: { padding: 20, gap: 22 },
  health: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legendDot: { width: 10, height: 10, borderRadius: 3 },
  legendLabel: { flex: 1, fontSize: 12 },
  legendValue: { fontSize: 12, fontWeight: '700' },
  section: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 },
  groupRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 5 },
  groupName: { flex: 1, fontSize: 13, fontWeight: '600' },
  groupCount: { fontSize: 12, fontWeight: '700', minWidth: 32, textAlign: 'right' },
  bar: { height: 8, borderRadius: 4, overflow: 'hidden' },
});
