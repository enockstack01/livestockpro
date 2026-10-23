import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRepository } from '../../src/db/repository';
import { useToast } from '../../src/lib/toast';
import { useTheme } from '../../src/theme/ThemeProvider';
import DateField from '../../src/components/DateField';
import ExportButton, { useFarmIdentity } from '../../src/components/ExportButton';
import { printDoc } from '../../src/lib/exportDoc';
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, FilterBar, FormGroup, Page, PageHeader, Select, Spinner } from '../../src/ui/kit';
import { useBreakpoint } from '../../src/ui/layout';
import { buildFarmReport } from '../../../shared/farmReport';

const TABLES = ['animals', 'health_records', 'breeding_records', 'feeding_records', 'production_records', 'finance_records', 'tasks'];

/* Twin of client/src/pages/Reports.jsx: the whole farm, or one animal's own
   report (profile, then only its records and totals). Sections without
   records are left out, every value is shown in full, and the report
   exports to PDF, Excel and CSV or prints (shared/farmReport.js). */
export default function ReportsScreen() {
  const { t, i18n } = useTranslation();
  const repo = useRepository();
  const showToast = useToast();
  const params = useLocalSearchParams();
  const router = useRouter();
  const identity = useFarmIdentity();
  const [data, setData] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [animalId, setAnimalId] = useState(params.animal ? String(params.animal) : '');

  const load = useCallback(async () => {
    const rows = await Promise.all(TABLES.map((k) => repo.list(k)));
    setData(Object.fromEntries(TABLES.map((k, i) => [k, rows[i] || []])));
  }, [repo]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (params.animal) setAnimalId(String(params.animal)); }, [params.animal]);

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
    showToast(t('reportsPage.reportRefreshed'), 'success');
  }

  const { farmName, livestockId } = identity;
  const doc = useMemo(
    () => (data ? buildFarmReport(data, { dateFrom, dateTo, animalId }, t, { farmName, livestockId }) : null),
    [data, dateFrom, dateTo, animalId, t, farmName, livestockId]
  );
  const animalOptions = useMemo(() => [
    { value: '', label: t('reportsPage.allAnimals') },
    ...(data ? [...data.animals].sort((a, b) => String(a.tag_id).localeCompare(String(b.tag_id))) : [])
      .map((a) => ({ value: a.id, label: [a.tag_id, a.name, a.species && t(`enums.species.${a.species}`, { defaultValue: a.species })].filter(Boolean).join(' · ') }))
  ], [data, t]);

  if (!doc) return <Page><Spinner /></Page>;
  const filtered = Boolean(dateFrom || dateTo || animalId);

  return (
    <Page refreshing={refreshing} onRefresh={refresh}>
      <PageHeader title={t('reportsPage.title')} subtitle={t('reportsPage.subtitle')}>
        <Button variant="secondary" icon="print" title={t('reportsPage.print')} disabled={doc.empty} onPress={() => printDoc(doc, t, i18n.language).catch(() => {})} />
        <ExportButton variant="primary" label={t('reportsPage.exportReport')} disabled={doc.empty} build={() => doc} />
      </PageHeader>

      <Card style={{ marginBottom: 16 }}>
        <CardBody>
          <FilterBar>
            <FormGroup label={t('reportsPage.fromDate')} style={{ flex: 1, minWidth: 140 }}><DateField value={dateFrom} onChange={setDateFrom} /></FormGroup>
            <FormGroup label={t('reportsPage.toDate')} style={{ flex: 1, minWidth: 140 }}><DateField value={dateTo} onChange={setDateTo} /></FormGroup>
          </FilterBar>
          <FormGroup label={t('reportsPage.animalTag')}>
            <Select value={animalId} options={animalOptions} onChange={(v) => { setAnimalId(v); router.setParams({ animal: v || undefined }); }} />
          </FormGroup>
          {filtered ? <Button variant="secondary" size="sm" icon="xmark" title={t('reportsPage.clearFilters')} onPress={() => { setDateFrom(''); setDateTo(''); setAnimalId(''); router.setParams({ animal: undefined }); }} style={{ alignSelf: 'flex-start' }} /> : null}
        </CardBody>
      </Card>

      <ReportView doc={doc} />
    </Page>
  );
}

function ReportView({ doc }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { width } = useBreakpoint();
  const wide = width >= 820;
  return (
    <View>
      <View style={[styles.head, { borderBottomColor: colors.primary }]}>
        <Text style={[styles.title, { color: colors.primary }]}>{doc.title}</Text>
        {doc.subtitle ? <Text style={{ color: colors.textLight, marginTop: 2 }}>{doc.subtitle}</Text> : null}
        <View style={styles.meta}>
          {doc.meta.map((m) => <Text key={m.label} style={{ color: colors.textLight, fontSize: 12 }}>{m.label}: <Text style={{ color: colors.text, fontWeight: '700' }}>{m.value}</Text></Text>)}
        </View>
      </View>

      {doc.profile ? (
        <Card style={{ marginBottom: 14 }}>
          <CardHeader title={t('reportsPage.animalProfile')} icon="id-card" />
          <CardBody>
            <View style={styles.profile}>
              {doc.profile.map((p) => (
                <View key={p.label} style={[styles.kv, p.wide && { width: '100%' }]}>
                  <Text style={{ color: colors.textLight, fontSize: 12 }}>{p.label}</Text>
                  <Text style={{ color: colors.text, fontSize: 14, fontWeight: '700' }}>{p.value}</Text>
                </View>
              ))}
            </View>
          </CardBody>
        </Card>
      ) : null}

      {doc.summary.length ? (
        <View style={styles.summary}>
          {doc.summary.map((s) => (
            <View key={s.label} style={[styles.box, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={{ color: colors.textLight, fontSize: 11, fontWeight: '700', textTransform: 'uppercase' }} numberOfLines={2}>{s.label}</Text>
              <Text style={{ color: colors.primary, fontSize: 18, fontWeight: '800', marginTop: 4 }}>{s.value}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {doc.empty ? (
        <Card><CardBody><EmptyState icon="inbox" title={t('reportsPage.nothingToReport')} message={t('reportsPage.noRecordsMatchFilters')} /></CardBody></Card>
      ) : doc.sections.map((s) => (
        <Card key={s.key} style={{ marginBottom: 14 }}>
          <CardHeader title={s.title} right={<Badge label={t('exports.recordsCount', { count: s.rows.length })} />} />
          {wide ? (
            <View>
              <View style={[styles.tr, { backgroundColor: colors.primary }]}>
                {s.columns.map((c) => <Text key={c.key} style={[styles.th, { flex: c.weight || 1 }]}>{c.label}</Text>)}
              </View>
              {s.rows.map((row, i) => (
                <View key={i} style={[styles.tr, { borderBottomColor: colors.border, backgroundColor: i % 2 ? colors.bg : 'transparent' }]}>
                  {row.map((cell, j) => <Text key={j} style={[styles.td, { flex: s.columns[j].weight || 1, color: colors.text, textAlign: ['number', 'money'].includes(s.columns[j].type) ? 'right' : 'left' }]}>{cell.text || '—'}</Text>)}
                </View>
              ))}
            </View>
          ) : (
            <CardBody>
              {s.rows.map((row, i) => (
                <View key={i} style={[styles.block, { borderColor: colors.border }, i === s.rows.length - 1 && { marginBottom: 0 }]}>
                  {row.map((cell, j) => (cell.text ? (
                    <View key={j} style={styles.pair}>
                      <Text style={[styles.pairLabel, { color: colors.textLight }]}>{s.columns[j].label}</Text>
                      <Text style={[styles.pairValue, { color: colors.text }, j === 0 && { fontWeight: '700' }]}>{cell.text}</Text>
                    </View>
                  ) : null))}
                </View>
              ))}
            </CardBody>
          )}
        </Card>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  head: { borderBottomWidth: 2, paddingBottom: 10, marginBottom: 14 },
  title: { fontSize: 20, fontWeight: '800' },
  meta: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 2, marginTop: 6 },
  profile: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 10 },
  kv: { width: '50%', paddingRight: 10 },
  summary: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  box: { flexGrow: 1, flexBasis: '45%', borderWidth: 1, borderRadius: 10, padding: 12 },
  tr: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: 'transparent' },
  th: { color: '#FFFFFF', fontWeight: '700', fontSize: 12, padding: 8 },
  td: { fontSize: 13, padding: 8 },
  block: { borderWidth: 1, borderRadius: 8, padding: 10, marginBottom: 10 },
  pair: { flexDirection: 'row', gap: 10, paddingVertical: 3 },
  pairLabel: { width: 120, fontSize: 12 },
  pairValue: { flex: 1, fontSize: 13 }
});
