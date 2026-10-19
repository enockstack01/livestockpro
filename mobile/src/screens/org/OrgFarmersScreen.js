import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useApi } from '../../api/client';
import { useTheme } from '../../theme/ThemeProvider';
import { useToast } from '../../lib/toast';
import { shareCsv } from '../../lib/shareCsv';
import { Button, Card, EmptyState, Input, Muted, Page, PageHeader, Spinner } from '../../ui/kit';
import { Pill, useOrgData, useOrgMember } from './orgShared';
import { farmerExportRows, toCsv } from '../../../../shared/org';

/* The organization's farmers on the phone: search, the dashboard's
   drill-downs (?ids=&label=) and a CSV export through the share sheet. */
export default function OrgFarmersScreen() {
  const { t, i18n } = useTranslation();
  const api = useApi();
  const router = useRouter();
  const showToast = useToast();
  const { colors } = useTheme();
  const { orgId, name } = useOrgMember();
  const params = useLocalSearchParams();
  const ids = params.ids ? String(params.ids) : null;
  const label = params.label ? String(params.label) : '';
  const [q, setQ] = useState('');
  const list = useOrgData(api, orgId ? `/organizations/${orgId}/farmers${ids !== null ? `?ids=${encodeURIComponent(ids)}` : ''}` : null);
  const sp = (s) => t(`enums.species.${s}`, { defaultValue: s });

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (list.data || []).filter((f) => !needle || [f.name, f.farm_name, f.phone, f.district, f.sector, f.cell].some((v) => (v || '').toLowerCase().includes(needle)));
  }, [list.data, q]);

  async function exportCsv() {
    const csv = toCsv(farmerExportRows(t, rows, sp));
    const ok = await shareCsv(csv, `${(name || 'Organization').replace(/[^\w-]+/g, '_')}_farmers_${new Date().toISOString().slice(0, 10)}.csv`);
    if (!ok) showToast(t('org.mobile.shareUnavailable'), 'error');
  }

  return (
    <Page refreshing={list.loading && Boolean(list.data)} onRefresh={list.reload}>
      <PageHeader title={t('org.farmers.title')} subtitle={label ? t('org.farmers.filteredBy', { label }) : t('org.farmers.subtitle', { count: (list.data || []).length })}>
        <Button title={t('org.farmers.exportCsv')} icon="file-csv" variant="secondary" size="sm" onPress={exportCsv} disabled={!rows.length} />
      </PageHeader>
      <Input value={q} onChangeText={setQ} placeholder={t('org.farmers.searchPlaceholder')} style={{ marginBottom: 12 }} />
      {ids !== null ? <Button title={t('org.farmers.showAll')} icon="xmark" variant="secondary" size="sm" onPress={() => router.setParams({ ids: undefined, label: undefined })} style={{ alignSelf: 'flex-start', marginBottom: 12 }} /> : null}
      {!list.data ? <Spinner /> : rows.length === 0 ? (
        <EmptyState icon="users" title={t('org.farmers.empty')} message={t('org.farmers.emptyHint')} />
      ) : rows.map((f) => (
        <Card key={f.farmer_id} style={{ marginBottom: 10 }}>
          <View style={styles.row}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text }} numberOfLines={1}>{f.name}</Text>
              <Muted>{[f.district, f.sector, f.cell].filter(Boolean).join(' · ') || t('org.dash.noLocation')}</Muted>
              {f.phone ? <Muted>{f.phone}</Muted> : null}
            </View>
            {f.status === 'active' ? <Pill tone="green" label={t('org.farmers.status.active')} /> : <Pill tone="orange" label={t(`org.farmers.status.${f.status}`)} />}
          </View>
          <View style={[styles.stats, { borderTopColor: colors.border }]}>
            <Stat label={t('org.farmers.colHerd')} value={f.herd_size} />
            <Stat label={t('org.farmers.colOpenCases')} value={f.open_cases} tone={f.critical_now ? colors.red : f.open_cases ? colors.orange : null} />
            <Stat label={t('org.farmers.colLastActivity')} value={f.last_activity ? new Date(f.last_activity).toLocaleDateString(i18n.language) : '—'} />
          </View>
          {f.main_species.length ? <Muted style={{ paddingHorizontal: 14, paddingBottom: 12 }}>{f.main_species.map((s) => `${sp(s.species)} ${s.count}`).join(', ')}</Muted> : null}
        </Card>
      ))}
    </Page>
  );
}

function Stat({ label, value, tone }) {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ fontSize: 11, color: colors.textLight }} numberOfLines={1}>{label}</Text>
      <Text style={{ fontSize: 14, fontWeight: '800', color: tone || colors.text }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 14 },
  stats: { flexDirection: 'row', gap: 8, borderTopWidth: 1, paddingHorizontal: 14, paddingVertical: 10 }
});
