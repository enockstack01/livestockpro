import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useApi } from '../../api/client';
import { useTheme } from '../../theme/ThemeProvider';
import { useToast } from '../../lib/toast';
import ExportButton from '../../components/ExportButton';
import { StatusBadge } from '../../components/Badges';
import { Button, Card, CardBody, CardHeader, EmptyState, FormGroup, Input, Modal, Muted, Page, PageHeader, Select, Spinner } from '../../ui/kit';
import { Pill, orgErrorText, useOrgData, useOrgMember } from './orgShared';
import { farmerExportRows } from '../../../../shared/org';
import { exportMeta } from '../../../../shared/recordExport';
import { fmtDate } from '../../../../shared/format';

/* The organization's farmers on the phone (twin of the web's
   pages/org/OrgFarmers.jsx): search, district filter, the dashboard's
   drill-downs (?ids=&label=), export to PDF, Excel or CSV, the read only
   records of farmers who gave that permission, and (organization admins)
   removal with a reason. */

const NUMBER_COLUMNS = [6, 8];
const ACCOUNT_TONE = { pending: 'orange', on_hold: 'gray', rejected: 'red' };
const EMPTY_FARMER = { full_name: '', email: '', phone: '', district: '', sector: '', cell: '' };

/* Staff register a farmer by email (twin of the web's RegisterFarmer): a new
   farmer is emailed an invitation to set a password; one with an account is
   asked in the app. A system admin still approves the account. */
function RegisterFarmerModal({ open, onClose, orgId, onDone }) {
  const { t } = useTranslation();
  const api = useApi();
  const showToast = useToast();
  const { colors } = useTheme();
  const [form, setForm] = useState(EMPTY_FARMER);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  async function submit() {
    if (!form.full_name.trim() || !form.email.trim()) { setError(t('org.enrol.required')); return; }
    setBusy(true);
    setError('');
    const { data, error: err } = await api.http('POST', `/organizations/${orgId}/farmers/register`, form);
    setBusy(false);
    if (err) { setError(orgErrorText(t, err)); return; }
    showToast(t(data.result === 'invited' ? 'org.enrol.invited' : 'org.enrol.asked', { email: form.email.trim() }), 'success');
    setForm(EMPTY_FARMER);
    onDone();
    onClose();
  }
  return (
    <Modal open={open} onClose={onClose} title={t('org.enrol.title')}
      footer={<><Button title={t('common.cancel')} variant="secondary" onPress={onClose} /><Button title={t('org.enrol.submit')} icon="user-plus" loading={busy} disabled={busy} onPress={submit} /></>}>
      <Muted style={{ marginBottom: 12 }}>{t('org.enrol.intro')}</Muted>
      <FormGroup label={`${t('account.fullName')} *`}><Input value={form.full_name} onChangeText={set('full_name')} /></FormGroup>
      <FormGroup label={`${t('org.enrol.email')} *`}><Input value={form.email} onChangeText={set('email')} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} /></FormGroup>
      <FormGroup label={t('settings.phoneNumber')}><Input value={form.phone} onChangeText={set('phone')} keyboardType="phone-pad" /></FormGroup>
      <FormGroup label={t('org.fields.district')}><Input value={form.district} onChangeText={set('district')} /></FormGroup>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <FormGroup label={t('org.fields.sector')} style={{ flex: 1 }}><Input value={form.sector} onChangeText={set('sector')} /></FormGroup>
        <FormGroup label={t('org.fields.cell')} style={{ flex: 1 }}><Input value={form.cell} onChangeText={set('cell')} /></FormGroup>
      </View>
      <Muted style={{ fontSize: 12 }}>{t('org.enrol.after')}</Muted>
      {error ? <Text style={{ color: colors.red, marginTop: 8 }}>{error}</Text> : null}
    </Modal>
  );
}

/* Farmers registered by email who have not signed in yet. */
function WaitingInvites({ orgId, invites, readOnly, onChange }) {
  const { t, i18n } = useTranslation();
  const api = useApi();
  const showToast = useToast();
  const { colors } = useTheme();
  if (!invites.length) return null;
  async function cancel(inv) {
    const { error } = await api.http('DELETE', `/organizations/${orgId}/farmer-invites/${inv.id}`);
    if (error) { showToast(orgErrorText(t, error), 'error'); return; }
    showToast(t('org.enrol.cancelled', { email: inv.email }), 'success');
    onChange();
  }
  return (
    <Card style={{ marginBottom: 14 }}>
      <CardHeader title={t('org.enrol.waitingTitle', { count: invites.length })} icon="envelope-open-text" />
      <CardBody flush>
        {invites.map((inv, i) => (
          <View key={inv.id} style={[styles.inviteRow, i < invites.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontWeight: '800', color: colors.text }} numberOfLines={1}>{inv.full_name}</Text>
              <Muted numberOfLines={1}>{inv.email}</Muted>
              <Muted>{t('org.enrol.sentOn')}: {new Date(inv.created_at).toLocaleDateString(i18n.language)}</Muted>
            </View>
            {!readOnly ? <Button title={t('org.enrol.cancel')} icon="xmark" variant="secondary" size="sm" onPress={() => cancel(inv)} /> : null}
          </View>
        ))}
      </CardBody>
    </Card>
  );
}

/* The farmer list as an export document (same columns as the web's CSV and
   Excel export). */
function farmerExportDoc(t, farmers, sp, { orgName, filtersText }) {
  const [header, ...body] = farmerExportRows(t, farmers, sp);
  const columns = header.map((label, i) => ({ key: `c${i}`, label, type: NUMBER_COLUMNS.includes(i) ? 'number' : 'text', weight: i === 0 ? 1.4 : i === 7 ? 1.6 : 1 }));
  const cell = (v, i) => {
    if (v === null || v === undefined || v === '') return { v: '', text: '' };
    if (NUMBER_COLUMNS.includes(i) && Number.isFinite(Number(v))) return { v: Number(v), text: Number(v).toLocaleString() };
    return { v: String(v), text: String(v) };
  };
  const title = t('org.farmers.title');
  return {
    title,
    subtitle: t('exports.recordsCount', { count: farmers.length }),
    meta: [orgName ? { label: t('org.fields.name'), value: orgName } : null, ...exportMeta(t, { filtersText })].filter(Boolean),
    summary: [],
    sections: [{ key: 'farmers', title, columns, rows: body.map((r) => r.map(cell)) }]
  };
}

export default function OrgFarmersScreen() {
  const { t, i18n } = useTranslation();
  const api = useApi();
  const router = useRouter();
  const showToast = useToast();
  const { colors } = useTheme();
  const { orgId, name, isAdmin, readOnly } = useOrgMember();
  const params = useLocalSearchParams();
  const ids = params.ids ? String(params.ids) : null;
  const label = params.label ? String(params.label) : '';
  const [q, setQ] = useState('');
  const [district, setDistrict] = useState('');
  const [removing, setRemoving] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const list = useOrgData(api, orgId ? `/organizations/${orgId}/farmers${ids !== null ? `?ids=${encodeURIComponent(ids)}` : ''}` : null);
  const invites = useOrgData(api, orgId ? `/organizations/${orgId}/farmer-invites` : null);
  const [registering, setRegistering] = useState(false);
  const sp = (s) => t(`enums.species.${s}`, { defaultValue: s });

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (list.data || []).filter((f) => (!district || f.district === district) && (!needle || [f.name, f.farm_name, f.phone, f.district, f.sector, f.cell].some((v) => (v || '').toLowerCase().includes(needle))));
  }, [list.data, q, district]);
  const districts = [...new Set((list.data || []).map((f) => f.district).filter(Boolean))].sort();
  const filtersText = [label, district, q.trim() ? `"${q.trim()}"` : ''].filter(Boolean).join(' · ');

  async function remove() {
    setBusy(true);
    const { error } = await api.http('DELETE', `/organizations/${orgId}/farmers/${removing.farmer_id}`, { reason });
    setBusy(false);
    if (error) { showToast(orgErrorText(t, error), 'error'); return; }
    showToast(t('org.farmers.removed', { name: removing.name }), 'success');
    setRemoving(null);
    setReason('');
    list.reload();
  }

  return (
    <Page refreshing={list.loading && Boolean(list.data)} onRefresh={list.reload}>
      <PageHeader title={t('org.farmers.title')} subtitle={label ? t('org.farmers.filteredBy', { label }) : t('org.farmers.subtitle', { count: (list.data || []).length })}>
        <ExportButton disabled={!rows.length} build={() => farmerExportDoc(t, rows, sp, { orgName: name, filtersText })} />
        {!readOnly ? <Button title={t('org.links.generate')} icon="link" variant="secondary" size="sm" onPress={() => router.push('/organization/links')} /> : null}
        {!readOnly ? <Button title={t('org.enrol.button')} icon="user-plus" size="sm" onPress={() => setRegistering(true)} /> : null}
      </PageHeader>
      <WaitingInvites orgId={orgId} invites={invites.data || []} readOnly={readOnly} onChange={() => { invites.reload(); list.reload(); }} />
      <RegisterFarmerModal open={registering} onClose={() => setRegistering(false)} orgId={orgId} onDone={() => { invites.reload(); list.reload(); }} />
      <Input value={q} onChangeText={setQ} placeholder={t('org.farmers.searchPlaceholder')} style={{ marginBottom: 10 }} />
      {districts.length ? (
        <View style={{ marginBottom: 12 }}>
          <Select compact value={district} onChange={setDistrict} placeholder={t('org.fields.district')}
            options={[{ value: '', label: `${t('org.fields.district')}: ${t('org.filters.all')}` }, ...districts.map((x) => ({ value: x, label: x }))]} />
        </View>
      ) : null}
      {ids !== null ? <Button title={t('org.farmers.showAll')} icon="xmark" variant="secondary" size="sm" onPress={() => router.setParams({ ids: undefined, label: undefined })} style={{ alignSelf: 'flex-start', marginBottom: 12 }} /> : null}
      {!list.data ? <Spinner /> : rows.length === 0 ? (
        <EmptyState icon="users" title={t('org.farmers.empty')} message={t('org.farmers.emptyHint')} />
      ) : rows.map((f) => {
        const canOpen = f.detail_access && f.status === 'active';
        return (
          <Card key={f.farmer_id} style={{ marginBottom: 10 }}>
            <View style={styles.row}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text }} numberOfLines={1}>{f.name}</Text>
                {f.farm_name && f.farm_name !== f.name ? <Muted>{f.farm_name}</Muted> : null}
                <Muted>{[f.district, f.sector, f.cell].filter(Boolean).join(' · ') || t('org.dash.noLocation')}</Muted>
                {f.phone ? <Muted>{f.phone}</Muted> : null}
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                {f.status === 'active' ? <Pill tone="green" label={t('org.farmers.status.active')} /> : <Pill tone="orange" label={t(`org.farmers.status.${f.status}`)} />}
                {f.account_status && f.account_status !== 'approved' ? <Pill tone={ACCOUNT_TONE[f.account_status] || 'gray'} label={t(`org.enrol.account.${f.account_status}`)} /> : null}
              </View>
            </View>
            <View style={[styles.stats, { borderTopColor: colors.border }]}>
              <Stat label={t('org.farmers.colHerd')} value={f.herd_size} />
              <Stat label={t('org.farmers.colOpenCases')} value={f.open_cases} tone={f.critical_now ? colors.red : f.open_cases ? colors.orange : null} />
              <Stat label={t('org.farmers.colJoined')} value={f.joined_at ? fmtDate(f.joined_at) : '—'} />
              <Stat label={t('org.farmers.colLastActivity')} value={f.last_activity ? new Date(f.last_activity).toLocaleDateString(i18n.language) : '—'} />
            </View>
            {f.main_species.length ? <Muted style={{ paddingHorizontal: 14, paddingBottom: 10 }}>{f.main_species.map((s) => `${sp(s.species)} ${s.count}`).join(', ')}</Muted> : null}
            <View style={[styles.actions, { borderTopColor: colors.border }]}>
              {canOpen
                ? <Button title={t('org.farmers.viewRecords')} icon="folder-open" variant="secondary" size="sm" onPress={() => router.push(`/organization/farmers/${f.farmer_id}`)} />
                : <Muted style={{ flex: 1 }}>{t('org.farmers.noDetail')}</Muted>}
              {isAdmin && !readOnly ? <Button title={t('org.farmers.remove')} icon="user-minus" variant="secondary" size="sm" onPress={() => { setReason(''); setRemoving(f); }} /> : null}
            </View>
          </Card>
        );
      })}

      <Modal open={Boolean(removing)} onClose={() => setRemoving(null)} title={t('org.farmers.removeTitle')}
        footer={<><Button title={t('common.cancel')} variant="secondary" onPress={() => setRemoving(null)} /><Button title={t('org.farmers.remove')} icon="user-minus" variant="danger" loading={busy} disabled={busy} onPress={remove} /></>}>
        <Text style={{ color: colors.text, marginBottom: 12 }}>{removing ? t('org.farmers.removeConfirm', { name: removing.name }) : ''}</Text>
        <FormGroup label={t('org.farmers.reason')}><Input value={reason} onChangeText={setReason} /></FormGroup>
      </Modal>
    </Page>
  );
}

function Stat({ label, value, tone }) {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ fontSize: 11, color: colors.textLight }} numberOfLines={1}>{label}</Text>
      <Text style={{ fontSize: 13.5, fontWeight: '800', color: tone || colors.text }} numberOfLines={1}>{value}</Text>
    </View>
  );
}

/* Read only herd records of one farmer, shown only with their permission. */
export function OrgFarmerRecordsScreen() {
  const { t } = useTranslation();
  const api = useApi();
  const router = useRouter();
  const { colors } = useTheme();
  const { farmerId } = useLocalSearchParams();
  const { orgId } = useOrgMember();
  const rec = useOrgData(api, orgId && farmerId ? `/organizations/${orgId}/farmers/${farmerId}/records` : null);
  const farmers = useOrgData(api, orgId && farmerId ? `/organizations/${orgId}/farmers?ids=${farmerId}` : null);
  const f = (farmers.data || [])[0];
  const sp = (s) => t(`enums.species.${s}`, { defaultValue: s });
  const back = <Button title={t('ai.back')} icon="arrow-left" variant="secondary" size="sm" onPress={() => router.replace('/organization/farmers')} />;

  if (rec.error) {
    return (
      <Page>
        <PageHeader title={t('org.farmers.records')}>{back}</PageHeader>
        <EmptyState icon="lock" title={orgErrorText(t, rec.error)} />
      </Page>
    );
  }
  if (!rec.data) return <Page><Spinner /></Page>;
  const r = rec.data;
  const sections = [
    { key: 'animals', icon: 'cow', rows: r.animals, render: (a) => ({ title: a.tag_id, lines: [[sp(a.species), a.breed, a.sex ? t(`enums.sex.${a.sex}`, a.sex) : ''].filter(Boolean).join(' · ')], status: a.health_status }) },
    { key: 'health_records', icon: 'stethoscope', rows: r.health, render: (h) => ({ title: `${h.tag_id || '—'} · ${h.disease || '—'}`, lines: [h.treatment, fmtDate(h.check_date)].filter(Boolean), status: h.status }) },
    { key: 'breeding_records', icon: 'venus-mars', rows: r.breeding, render: (b) => ({ title: b.tag_id || '—', lines: [
      `${t('tables.breeding_records.fields.breeding_date')}: ${fmtDate(b.breeding_date) || '—'}`,
      b.pregnancy_status ? `${t('tables.breeding_records.fields.pregnancy_status')}: ${t(`enums.pregnancyStatus.${b.pregnancy_status}`, b.pregnancy_status)}` : '',
      b.birth_date ? `${t('tables.breeding_records.fields.birth_date')}: ${fmtDate(b.birth_date)}` : ''
    ].filter(Boolean) }) }
  ];
  return (
    <Page refreshing={false} onRefresh={rec.reload}>
      <PageHeader title={f ? f.name : t('org.farmers.records')} subtitle={t('org.farmers.readOnly')}>{back}</PageHeader>
      {sections.map((s) => (
        <Card key={s.key} style={{ marginBottom: 14 }}>
          <CardHeader title={`${t(`tables.${s.key}.label`)} (${s.rows.length})`} icon={s.icon} />
          <CardBody flush>
            {s.rows.length === 0 ? <EmptyState icon={s.icon} title={t('analytics.noData')} compact /> : s.rows.map((row, i) => {
              const v = s.render(row);
              return (
                <View key={row.id} style={[styles.recRow, i < s.rows.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <Text style={{ fontWeight: '800', color: colors.text }} numberOfLines={1}>{v.title}</Text>
                    {v.lines.map((line) => <Muted key={line}>{line}</Muted>)}
                  </View>
                  {v.status ? <StatusBadge status={v.status} /> : null}
                </View>
              );
            })}
          </CardBody>
        </Card>
      ))}
    </Page>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 14 },
  stats: { flexDirection: 'row', gap: 8, borderTopWidth: 1, paddingHorizontal: 14, paddingVertical: 10 },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8, borderTopWidth: 1, paddingHorizontal: 14, paddingVertical: 10 },
  recRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 11 },
  inviteRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 11 }
});
