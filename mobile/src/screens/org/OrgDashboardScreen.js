import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import Icon from '../../components/Icon';
import { useApi } from '../../api/client';
import { useTheme } from '../../theme/ThemeProvider';
import { Button, Card, CardBody, CardHeader, EmptyState, FormGroup, Muted, Page, Select, Spinner } from '../../ui/kit';
import { OrgBanner, UsageMeter, useOrgData, useOrgMember } from './orgShared';

/* Organization dashboard on the phone: the same summary as the web
   (client/src/pages/org/OrgDashboard.jsx), livestock only, built from the
   hourly farmer summaries. Every alert opens the farmers behind it. */

const LEAF = '#2E7D32';
const AMBER = '#F9A825';
const RED = '#C62828';
const SLATE = '#5B6B5D';

function Kpi({ icon, color = LEAF, ink = '#FFFFFF', label, value, sub, onPress }) {
  const { colors } = useTheme();
  const Wrap = onPress ? Pressable : View;
  return (
    <Wrap onPress={onPress} style={[styles.kpi, { borderColor: colors.border, backgroundColor: colors.card }]}>
      <View style={[styles.kpiIcon, { backgroundColor: color }]}><Icon name={icon} size={12} color={ink} /></View>
      <Text style={{ fontSize: 12, color: colors.textLight }} numberOfLines={2}>{label}</Text>
      <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text }}>{value}</Text>
      {sub ? <Text style={{ fontSize: 11, color: colors.textLight }} numberOfLines={2}>{sub}</Text> : null}
      {onPress ? <View style={styles.kpiGo}><Icon name="chevron-right" size={10} color={colors.textLight} /></View> : null}
    </Wrap>
  );
}

/* Horizontal bars with the value at the end of each bar. */
function Bars({ rows, color = LEAF }) {
  const { colors } = useTheme();
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <View style={{ gap: 9 }}>
      {rows.map((r) => (
        <View key={r.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ width: 92, fontSize: 12.5, color: colors.text }} numberOfLines={1}>{r.label}</Text>
          <View style={{ flex: 1, height: 14, borderRadius: 4, backgroundColor: colors.bg, overflow: 'hidden' }}>
            <View style={{ width: `${r.value ? Math.max(4, (r.value / max) * 100) : 0}%`, height: '100%', backgroundColor: r.color || color, borderRadius: 4 }} />
          </View>
          <Text style={{ width: 40, textAlign: 'right', fontSize: 13, fontWeight: '800', color: colors.text }}>{r.value.toLocaleString()}</Text>
        </View>
      ))}
    </View>
  );
}

/* A small table (location and disease summaries). */
function MiniTable({ head, rows }) {
  const { colors } = useTheme();
  return (
    <View>
      <View style={[styles.tr, { borderBottomColor: colors.border }]}>
        {head.map((h, i) => <Text key={h} style={[styles.th, { color: colors.textLight }, i === 0 ? styles.first : styles.num]} numberOfLines={1}>{h}</Text>)}
      </View>
      {rows.map((r, j) => (
        <View key={`${r[0]}-${j}`} style={[styles.tr, j < rows.length - 1 && { borderBottomColor: colors.border }, j === rows.length - 1 && { borderBottomWidth: 0 }]}>
          {r.map((c, i) => <Text key={i} style={[styles.td, { color: colors.text }, i === 0 ? styles.first : [styles.num, { fontWeight: '700' }]]} numberOfLines={2}>{c}</Text>)}
        </View>
      ))}
    </View>
  );
}

/* The last 24 months, newest first, for the month range filter. */
function monthOptions(lang) {
  const out = [];
  const d = new Date();
  d.setDate(1);
  for (let i = 0; i < 24; i++) {
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    out.push({ value: key, label: d.toLocaleString(lang, { month: 'long', year: 'numeric' }) });
    d.setMonth(d.getMonth() - 1);
  }
  return out;
}

const NO_FILTERS = { from: '', to: '', district: '', sector: '', cell: '' };

/* Monthly columns with the value on top of each column. */
function Columns({ months, series, lang }) {
  const { colors } = useTheme();
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const label = (k) => new Date(`${k}-01T00:00:00`).toLocaleString(lang, { month: 'short' });
  const show = months.slice(-6);
  const off = months.length - show.length;
  return (
    <View>
      <View style={styles.cols}>
        {show.map((m, i) => (
          <View key={m} style={styles.colGroup}>
            <View style={styles.colBars}>
              {series.map((s) => {
                const v = s.values[off + i] || 0;
                return (
                  <View key={s.name} style={styles.colWrap}>
                    <Text style={{ fontSize: 9.5, fontWeight: '700', color: colors.text }}>{v ? Math.round(v) : ''}</Text>
                    <View style={{ width: '100%', height: `${v ? Math.max(4, (v / max) * 100) : 0}%`, backgroundColor: s.color, borderTopLeftRadius: 3, borderTopRightRadius: 3 }} />
                  </View>
                );
              })}
            </View>
            <Text style={{ fontSize: 10, color: colors.textLight, marginTop: 4 }}>{label(m)}</Text>
          </View>
        ))}
      </View>
      {series.length > 1 ? (
        <View style={styles.legend}>
          {series.map((s) => <View key={s.name} style={styles.legendItem}><View style={[styles.swatch, { backgroundColor: s.color }]} /><Text style={{ fontSize: 11.5, color: colors.textLight }}>{s.name}</Text></View>)}
        </View>
      ) : null}
    </View>
  );
}

export default function OrgDashboardScreen() {
  const { t, i18n } = useTranslation();
  const api = useApi();
  const router = useRouter();
  const { colors } = useTheme();
  const { orgId } = useOrgMember();
  const [draft, setDraft] = useState(NO_FILTERS);
  const [filters, setFilters] = useState({});
  const [showFilters, setShowFilters] = useState(false);
  const qs = Object.entries(filters).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  const org = useOrgData(api, orgId ? `/organizations/${orgId}` : null);
  const dash = useOrgData(api, orgId ? `/organizations/${orgId}/dashboard${qs ? `?${qs}` : ''}` : null);
  const farmers = useOrgData(api, orgId ? `/organizations/${orgId}/farmers` : null);
  const [refreshing, setRefreshing] = useState(false);
  const places = useMemo(() => {
    const list = farmers.data || [];
    const uniq = (k, pred = () => true) => [...new Set(list.filter(pred).map((f) => f[k]).filter(Boolean))].sort();
    return {
      districts: uniq('district'),
      sectors: uniq('sector', (f) => !draft.district || f.district === draft.district),
      cells: uniq('cell', (f) => (!draft.district || f.district === draft.district) && (!draft.sector || f.sector === draft.sector))
    };
  }, [farmers.data, draft.district, draft.sector]);
  const months = useMemo(() => monthOptions(i18n.language), [i18n.language]);
  const { reload: reloadOrg } = org;
  const { reload: reloadDash } = dash;
  const onRefresh = useCallback(async () => { setRefreshing(true); await Promise.all([reloadOrg(), reloadDash()]); setRefreshing(false); }, [reloadOrg, reloadDash]);
  const drill = (ids, label) => router.push({ pathname: '/organization/farmers', params: { ids: ids.join(','), label } });

  if (!org.data || !dash.data) return <Page><Spinner /></Page>;
  const o = org.data;
  const d = dash.data;
  const sp = (s) => t(`enums.species.${s}`, { defaultValue: s });
  const setF = (k) => (v) => setDraft((f) => ({ ...f, [k]: v, ...(k === 'district' ? { sector: '', cell: '' } : k === 'sector' ? { cell: '' } : {}) }));
  const all = { value: '', label: t('org.filters.all') };
  const opts = (list) => [all, ...list.map((x) => (typeof x === 'object' ? x : { value: x, label: x }))];
  const active = Object.values(filters).filter(Boolean).length;

  return (
    <Page refreshing={refreshing} onRefresh={onRefresh}>
      <OrgBanner org={o}><UsageMeter used={o.usage.used} limit={o.usage.limit} onDark /></OrgBanner>

      <Button title={active ? `${t('exports.filters')} (${active})` : t('exports.filters')} icon="filter" variant="secondary" size="sm" onPress={() => setShowFilters((v) => !v)} style={{ alignSelf: 'flex-start', marginBottom: 12 }} />
      {showFilters ? (
        <Card style={styles.card}>
          <CardBody>
            <View style={styles.pair}>
              <FormGroup label={t('org.filters.from')} style={{ flex: 1 }}><Select compact value={draft.from} options={opts(months)} onChange={setF('from')} placeholder={t('org.filters.from')} /></FormGroup>
              <FormGroup label={t('org.filters.to')} style={{ flex: 1 }}><Select compact value={draft.to} options={opts(months)} onChange={setF('to')} placeholder={t('org.filters.to')} /></FormGroup>
            </View>
            <FormGroup label={t('org.fields.district')}><Select compact value={draft.district} options={opts(places.districts)} onChange={setF('district')} placeholder={t('org.fields.district')} /></FormGroup>
            <View style={styles.pair}>
              <FormGroup label={t('org.fields.sector')} style={{ flex: 1 }}><Select compact value={draft.sector} options={opts(places.sectors)} onChange={setF('sector')} placeholder={t('org.fields.sector')} /></FormGroup>
              <FormGroup label={t('org.fields.cell')} style={{ flex: 1 }}><Select compact value={draft.cell} options={opts(places.cells)} onChange={setF('cell')} placeholder={t('org.fields.cell')} /></FormGroup>
            </View>
            <View style={styles.pair}>
              <Button title={t('org.filters.apply')} icon="filter" size="sm" onPress={() => setFilters(draft)} />
              {qs ? <Button title={t('common.clearFilters')} variant="secondary" size="sm" onPress={() => { setDraft(NO_FILTERS); setFilters({}); }} /> : null}
            </View>
          </CardBody>
        </Card>
      ) : null}

      <Text style={[styles.section, { color: colors.primaryDark }]}>{t('org.dash.overview')}</Text>
      <View style={styles.grid}>
        <Kpi icon="users" label={t('org.dash.farmers')} value={d.overview.farmers} onPress={() => router.push('/organization/farmers')} />
        <Kpi icon="user-plus" label={t('org.dash.newThisMonth')} value={d.overview.new_this_month.length} onPress={() => drill(d.overview.new_this_month, t('org.dash.newThisMonth'))} />
        <Kpi icon="bolt" label={t('org.dash.active30')} value={d.overview.active_30d.length} sub={t('org.dash.activeSub')} onPress={() => drill(d.overview.active_30d, t('org.dash.active30'))} />
        <Kpi icon="cow" label={t('org.dash.animals')} value={d.herd.animals.toLocaleString()} sub={t('org.dash.pregnant', { count: d.herd.pregnant })} />
        <Kpi icon="stethoscope" color={AMBER} ink="#1C2B1E" label={t('org.dash.openCases')} value={d.health.open_cases} />
      </View>

      <Text style={[styles.section, { color: colors.primaryDark }]}>{t('org.dash.alerts')}</Text>
      <View style={styles.grid}>
        <Kpi icon="moon" color={SLATE} label={t('org.dash.inactive')} value={d.alerts.inactive.length} sub={t('org.dash.inactiveSub')} onPress={() => drill(d.alerts.inactive, t('org.dash.inactive'))} />
        <Kpi icon="triangle-exclamation" color={RED} label={t('org.dash.critical')} value={d.alerts.critical.length} onPress={() => drill(d.alerts.critical, t('org.dash.critical'))} />
        <Kpi icon="virus" color={AMBER} ink="#1C2B1E" label={t('org.dash.diseaseReports')} value={d.alerts.disease_reports.length} sub={t('org.dash.last30')} onPress={() => drill(d.alerts.disease_reports, t('org.dash.diseaseReports'))} />
        <Kpi icon="clock" color={RED} label={t('org.dash.overdue')} value={d.alerts.overdue_tasks.length} onPress={() => drill(d.alerts.overdue_tasks, t('org.dash.overdue'))} />
      </View>

      <Card style={styles.card}>
        <CardHeader title={t('org.dash.herdBySpecies')} icon="layer-group" />
        <CardBody>{d.herd.by_species.length ? <Bars rows={d.herd.by_species.map((s) => ({ label: sp(s.species), value: s.count }))} /> : <EmptyState icon="cow" title={t('analytics.noData')} compact />}</CardBody>
      </Card>
      <Card style={styles.card}>
        <CardHeader title={t('org.dash.herdHealth')} icon="heart-pulse" />
        <CardBody>
          <Bars rows={[
            { label: t('enums.animalHealthStatus.Healthy'), value: d.herd.by_status.Healthy || 0, color: '#1B5E20' },
            { label: t('enums.animalHealthStatus.Under Treatment'), value: d.herd.by_status['Under Treatment'] || 0, color: AMBER },
            { label: t('enums.animalHealthStatus.Critical'), value: d.herd.by_status.Critical || 0, color: RED }
          ]} />
        </CardBody>
      </Card>
      <Card style={styles.card}>
        <CardHeader title={t('org.dash.healthEvents')} icon="notes-medical" />
        <CardBody><Columns months={d.months} lang={i18n.language} series={[{ name: t('org.dash.healthEventsShort'), values: d.health.events, color: LEAF }, { name: t('org.dash.vaccinations'), values: d.health.vaccinations, color: AMBER }, { name: t('org.dash.recovered'), values: d.health.recovered, color: SLATE }]} /></CardBody>
      </Card>
      <Card style={styles.card}>
        <CardHeader title={t('org.dash.births')} icon="baby" />
        <CardBody><Columns months={d.months} lang={i18n.language} series={[{ name: t('org.dash.newborns'), values: d.breeding.newborns, color: LEAF }]} /></CardBody>
      </Card>
      <Card style={styles.card}>
        <CardHeader title={t('org.dash.production')} icon="bottle-droplet" />
        <CardBody><Columns months={d.months} lang={i18n.language} series={[{ name: t('enums.productionType.Milk', { defaultValue: 'Milk' }), values: d.production.milk, color: LEAF }, { name: t('enums.productionType.Eggs', { defaultValue: 'Eggs' }), values: d.production.eggs, color: AMBER }, { name: t('enums.productionType.Meat', { defaultValue: 'Meat' }), values: d.production.meat, color: '#B26A2E' }]} /></CardBody>
      </Card>
      <Card style={styles.card}>
        <CardHeader title={t('org.dash.activity')} icon="chart-line" />
        <CardBody>{d.activity.records.some(Boolean) ? <Columns months={d.months} lang={i18n.language} series={[{ name: t('org.dash.recordsAdded'), values: d.activity.records, color: LEAF }, { name: t('org.dash.animalsAdded'), values: d.activity.animals_added, color: AMBER }]} /> : <EmptyState icon="chart-line" title={t('analytics.noData')} compact />}</CardBody>
      </Card>
      <Card style={styles.card}>
        <CardHeader title={t('org.dash.byLocation')} icon="location-dot" />
        <CardBody>{d.locations.length ? <MiniTable head={[t('org.dash.location'), t('org.dash.farmers'), t('org.dash.animals')]} rows={d.locations.map((l) => [l.label || t('org.dash.noLocation'), l.farmers, l.animals])} /> : <EmptyState icon="location-dot" title={t('analytics.noData')} compact />}</CardBody>
      </Card>
      <Card style={styles.card}>
        <CardHeader title={t('org.dash.topDiseases')} icon="virus" />
        <CardBody>{d.health.diseases_30d.length ? <MiniTable head={[t('org.dash.condition'), t('org.dash.cases'), t('org.dash.farmers')]} rows={d.health.diseases_30d.map((x) => [x.name, x.cases, x.farmers])} /> : <EmptyState icon="virus" title={t('org.dash.noDiseases')} compact />}</CardBody>
      </Card>
      <Muted style={{ textAlign: 'center', marginBottom: 12 }}>{t('org.dash.updated', { time: d.stats_updated_at ? new Date(d.stats_updated_at).toLocaleString(i18n.language) : '' })}</Muted>
    </Page>
  );
}

const styles = StyleSheet.create({
  section: { fontSize: 13, fontWeight: '800', marginBottom: 8, marginTop: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  kpi: { flexBasis: '47%', flexGrow: 1, borderWidth: 1, borderRadius: 12, padding: 12, gap: 3 },
  kpiIcon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  kpiGo: { position: 'absolute', right: 12, top: 14 },
  card: { marginBottom: 14 },
  pair: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  tr: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderBottomWidth: 1 },
  th: { fontSize: 11.5, fontWeight: '700' },
  td: { fontSize: 13 },
  first: { flex: 2 },
  num: { flex: 1, textAlign: 'right' },
  cols: { flexDirection: 'row', gap: 8, height: 130, alignItems: 'flex-end' },
  colGroup: { flex: 1, alignItems: 'center', height: '100%', justifyContent: 'flex-end' },
  colBars: { flex: 1, flexDirection: 'row', gap: 2, alignItems: 'flex-end', width: '100%' },
  colWrap: { flex: 1, height: '100%', justifyContent: 'flex-end', alignItems: 'center' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 10, height: 10, borderRadius: 3 }
});
