import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useApi } from '../../api/client';
import { useTheme } from '../../theme/ThemeProvider';
import { useToast } from '../../lib/toast';
import { useAccount } from '../../account/AccountProvider';
import { Button, Card, CardBody, CardHeader, EmptyState, FormGroup, IconButton, Input, Muted, Page, PageHeader, Select, Spinner } from '../../ui/kit';
import { Pill, orgErrorText, useOrgData, useOrgMember } from './orgShared';
import { OrgFields, emptyOrgForm } from './OrgGate';

/* Mobile twins of the web's pages/org/OrgManage.jsx: organization staff,
   the organization profile and its activity log. */
const MEMBER_ROLES = ['org_admin', 'org_staff'];

/* Staff (organization admins): invite by email, change a member's role,
   remove a member. An organization keeps at least one admin. */
export function OrgStaffScreen() {
  const { t, i18n } = useTranslation();
  const api = useApi();
  const showToast = useToast();
  const { colors } = useTheme();
  const { orgId, readOnly } = useOrgMember();
  const members = useOrgData(api, orgId ? `/organizations/${orgId}/members` : null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('org_staff');
  const [busy, setBusy] = useState(false);
  const roleOptions = MEMBER_ROLES.map((r) => ({ value: r, label: t(`org.roles.${r}`) }));

  async function invite() {
    setBusy(true);
    const { error } = await api.http('POST', `/organizations/${orgId}/members`, { email: email.trim(), role });
    setBusy(false);
    if (error) { showToast(orgErrorText(t, error), 'error'); return; }
    showToast(t('org.staff.invited', { email: email.trim() }), 'success');
    setEmail('');
    members.reload();
  }
  async function changeRole(m, next) {
    if (next === m.role) return;
    const { error } = await api.http('PATCH', `/organizations/${orgId}/members/${m.id}`, { role: next });
    if (error) { showToast(orgErrorText(t, error), 'error'); return; }
    members.reload();
  }
  async function remove(m) {
    const { error } = await api.http('DELETE', `/organizations/${orgId}/members/${m.id}`);
    if (error) { showToast(orgErrorText(t, error), 'error'); return; }
    members.reload();
  }

  const list = members.data || [];
  return (
    <Page refreshing={false} onRefresh={members.reload}>
      <PageHeader title={t('org.staff.title')} subtitle={t('org.staff.subtitle')} />
      {!readOnly ? (
        <Card style={styles.card}>
          <CardHeader title={t('org.staff.invite')} icon="user-plus" />
          <CardBody>
            <FormGroup label={t('auth.emailAddress')}><Input value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" /></FormGroup>
            <FormGroup label={t('org.staff.role')}><Select value={role} options={roleOptions} onChange={setRole} placeholder={t('org.staff.role')} /></FormGroup>
            <Muted style={{ marginBottom: 12 }}>{t('org.staff.inviteHint')}</Muted>
            <Button title={t('org.staff.sendInvite')} icon="paper-plane" onPress={invite} loading={busy} disabled={busy || !email.trim()} block />
          </CardBody>
        </Card>
      ) : <Muted style={{ marginBottom: 14 }}>{t('org.readOnly')}</Muted>}

      <Card>
        <CardBody flush>
          {!members.data ? <Spinner /> : list.length === 0 ? <EmptyState icon="user-group" title={t('org.staff.title')} compact /> : list.map((m, i) => (
            <View key={m.id} style={[styles.row, i < list.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
              <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                <Text style={{ fontWeight: '800', color: colors.text }} numberOfLines={1}>{m.email}{m.is_me ? ` (${t('org.staff.you')})` : ''}</Text>
                {m.name ? <Muted>{m.name}</Muted> : null}
                <View style={styles.inline}>
                  <Pill tone={m.status === 'active' ? 'green' : 'orange'} label={t(`org.staff.statuses.${m.status}`)} />
                  <Muted>{t('org.staff.since')}: {new Date(m.joined_at || m.created_at).toLocaleDateString(i18n.language)}</Muted>
                </View>
                {m.is_me || readOnly
                  ? <Text style={{ color: colors.text, fontSize: 13 }}>{t(`org.roles.${m.role}`)}</Text>
                  : <View style={{ maxWidth: 220 }}><Select compact value={m.role} options={roleOptions} onChange={(r) => changeRole(m, r)} placeholder={t('org.staff.role')} /></View>}
              </View>
              {!m.is_me && !readOnly ? <IconButton icon="user-xmark" danger label={t('org.staff.remove')} onPress={() => remove(m)} /> : null}
            </View>
          ))}
        </CardBody>
      </Card>
    </Page>
  );
}

/* Organization profile: details and logo (organization admins edit, staff read). */
export function OrgProfileScreen() {
  const { t } = useTranslation();
  const api = useApi();
  const showToast = useToast();
  const { colors } = useTheme();
  const { refresh } = useAccount();
  const { orgId, isAdmin, readOnly } = useOrgMember();
  const org = useOrgData(api, orgId ? `/organizations/${orgId}` : null);
  const [form, setForm] = useState(emptyOrgForm());
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (org.data) {
      const o = org.data;
      setForm({ name: o.name || '', type: o.type || 'other', country: o.country || '', district: o.district || '', sector: o.sector || '', contact_email: o.contact_email || '', contact_phone: o.contact_phone || '', description: o.description || '', logo: o.logo || null });
    }
  }, [org.data]);
  const editable = isAdmin && !readOnly;

  async function save() {
    setBusy(true);
    const { error } = await api.http('PATCH', `/organizations/${orgId}`, form);
    setBusy(false);
    if (error) { showToast(orgErrorText(t, error), 'error'); return; }
    showToast(t('org.profile.saved'), 'success');
    org.reload();
    refresh();
  }

  if (!org.data) return <Page><Spinner /></Page>;
  const o = org.data;
  const rows = [
    [t('org.profile.status'), t(`org.status.${o.status}`)],
    [t('org.profile.farmerLimit'), o.max_farmers],
    [t('org.profile.farmersNow'), o.active_farmers],
    [t('org.profile.linkValidity'), t('org.profile.hours', { count: o.referral_link_hours })]
  ];
  return (
    <Page refreshing={false} onRefresh={org.reload}>
      <PageHeader title={t('org.profile.title')} subtitle={t('org.profile.subtitle')} />
      <Card style={styles.card}>
        <CardHeader title={t('org.profile.details')} icon="building" />
        <CardBody>
          <OrgFields form={form} setForm={setForm} editable={editable} withLogo={editable || Boolean(form.logo)} />
          {editable ? <Button title={t('common.save')} icon="floppy-disk" onPress={save} loading={busy} disabled={busy} block /> : null}
        </CardBody>
      </Card>
      <Card style={styles.card}>
        <CardHeader title={t('org.profile.limits')} icon="gauge" />
        <CardBody>
          {rows.map(([label, value]) => (
            <View key={label} style={[styles.readRow, { borderBottomColor: colors.border }]}>
              <Text style={{ color: colors.textLight, fontSize: 13, flex: 1 }}>{label}</Text>
              <Text style={{ color: colors.text, fontSize: 13.5, fontWeight: '700' }}>{value}</Text>
            </View>
          ))}
          <Muted style={{ marginTop: 10 }}>{t('org.profile.limitHint')}</Muted>
        </CardBody>
      </Card>
    </Page>
  );
}

/* The organization's own activity log (organization admins). */
export function OrgActivityScreen() {
  const { t, i18n } = useTranslation();
  const api = useApi();
  const { colors } = useTheme();
  const { orgId } = useOrgMember();
  const log = useOrgData(api, orgId ? `/organizations/${orgId}/audit` : null);
  const rows = log.data || [];
  return (
    <Page refreshing={false} onRefresh={log.reload}>
      <PageHeader title={t('org.activity.title')} subtitle={t('org.activity.subtitle')} />
      <Card>
        <CardBody flush>
          {!log.data ? <Spinner /> : rows.length === 0 ? <EmptyState icon="clock-rotate-left" title={t('org.activity.empty')} compact /> : rows.map((r, i) => {
            const details = auditDetails(t, r, i18n.language);
            return (
              <View key={r.id} style={[styles.row, i < rows.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Text style={{ fontWeight: '800', color: colors.text }}>{t(`org.audit.${r.action.replace('.', '_')}`, { defaultValue: r.action })}</Text>
                  {details ? <Text style={{ color: colors.text, fontSize: 13 }}>{details}</Text> : null}
                  <Muted>{new Date(r.at).toLocaleString(i18n.language)} · {t('org.activity.by')}: {r.actor_email || r.actor_id || '—'}</Muted>
                </View>
              </View>
            );
          })}
        </CardBody>
      </Card>
    </Page>
  );
}

function auditDetails(t, r, lang) {
  const d = r.details || {};
  if (r.action === 'organization.limit') return t('org.audit.limitDetail', { from: d.from, to: d.to, reason: d.reason || '' });
  if (d.reason) return d.reason;
  if (d.email) return `${d.email}${d.role ? ` · ${t(`org.roles.${d.role}`, { defaultValue: d.role })}` : ''}`;
  if (d.name) return d.name;
  if (d.expires_at) return t('org.audit.expires', { time: new Date(d.expires_at).toLocaleString(lang) });
  if (d.rows !== undefined) return t('org.audit.importDetail', { rows: d.rows, added: d.added });
  return '';
}

const styles = StyleSheet.create({
  card: { marginBottom: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  readRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderBottomWidth: 1 }
});
