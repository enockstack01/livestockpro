import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useApi } from '../api/client';
import { useTheme } from '../theme/ThemeProvider';
import { useToast } from '../lib/toast';
import { useConfirm } from '../lib/confirm';
import { fmtDate } from '../lib/shared';
import { Button, Card, CardBody, CardHeader, EmptyState, FormGroup, IconButton, Input, Modal, Page, PageHeader, Spinner } from '../ui/kit';
import { MiniColumns } from '../ui/microViz';
import { useChartColors } from '../ui/charts';
import { relativeDay } from '../../../shared/dashboardFeed';

const EMPTY = { full_name: '', email: '', phone: '' };

function errText(t, error) {
  if (error && error.code && t(`team.errors.${error.code}`, { defaultValue: '' })) return t(`team.errors.${error.code}`);
  return (error && error.message) || t('auth.somethingWentWrong');
}

/* The farm manager's team of data collectors (twin of the web's pages/Team.jsx):
   invite by email, see each collector's entries this week, remove someone. */
export default function TeamScreen() {
  const { t } = useTranslation();
  const api = useApi();
  const { colors } = useTheme();
  const cc = useChartColors();
  const showToast = useToast();
  const confirm = useConfirm();
  const [team, setTeam] = useState(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const { data, error: err } = await api.http('GET', '/team');
    if (err) { showToast(errText(t, err), 'error'); return; }
    setTeam(data);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);

  async function invite() {
    if (!form.full_name.trim() || !form.email.trim()) { setError(t('team.required')); return; }
    setBusy(true);
    setError('');
    const { error: err } = await api.http('POST', '/team/invites', form);
    setBusy(false);
    if (err) { setError(errText(t, err)); return; }
    showToast(t('team.invited', { email: form.email.trim() }), 'success');
    setForm(EMPTY);
    setOpen(false);
    load();
  }

  async function cancelInvite(inv) {
    const { error: err } = await api.http('DELETE', `/team/invites/${inv.id}`);
    if (err) { showToast(errText(t, err), 'error'); return; }
    showToast(t('team.inviteCancelled', { email: inv.email }), 'success');
    load();
  }

  async function removeMember(m) {
    const ok = await confirm({ title: t('team.removeTitle'), message: t('team.removeMessage', { name: m.name || m.email }), confirmLabel: t('team.remove'), destructive: true });
    if (!ok) return;
    const { error: err } = await api.http('DELETE', `/team/members/${m.id}`);
    if (err) { showToast(errText(t, err), 'error'); return; }
    showToast(t('team.removed', { name: m.name || m.email }), 'success');
    load();
  }

  if (!team) return <Spinner />;
  const total14 = team.perDay.reduce((s, d) => s + d.count, 0);
  const full = team.members.length + team.invites.length >= team.limit;
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Page>
      <PageHeader title={t('team.title')} subtitle={t('team.subtitle')}>
        <Button title={t('team.addCollector')} icon="user-plus" disabled={full} onPress={() => { setError(''); setOpen(true); }} />
      </PageHeader>

      <Card>
        <CardBody>
          <View style={styles.head}>
            <Text style={{ fontSize: 11.5, fontWeight: '600', color: colors.textLight }}>{t('team.entries14')}</Text>
            <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text }}>{total14}</Text>
          </View>
          <MiniColumns values={team.perDay.map((d) => d.count)} color={cc.brand} height={48} />
        </CardBody>
      </Card>

      <View style={{ height: 20 }} />
      <Card>
        <CardHeader title={t('team.members')} icon="people-group" iconColor={colors.primary} />
        <CardBody style={{ paddingVertical: 8 }}>
          {team.members.length === 0 ? <EmptyState icon="user-plus" title={t('team.empty')} compact /> : team.members.map((m, i) => (
            <View key={m.id} style={[styles.row, i < team.members.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
              <View style={[styles.avatar, { backgroundColor: colors.primary }]}><Text style={styles.avatarText}>{(m.name || m.email || '?')[0].toUpperCase()}</Text></View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text }} numberOfLines={1}>{m.name || m.email}</Text>
                <Text style={{ fontSize: 11.5, color: colors.textLight }} numberOfLines={1}>{t('team.lastActive', { when: m.last ? relativeDay(m.last, t) : t('team.notYet') })}</Text>
              </View>
              <View style={[styles.count, { backgroundColor: colors.primary }]}><Text style={styles.countText}>{m.week}</Text></View>
              <IconButton icon="user-minus" danger label={t('team.remove')} onPress={() => removeMember(m)} />
            </View>
          ))}
        </CardBody>
      </Card>

      {team.invites.length > 0 ? (
        <>
          <View style={{ height: 20 }} />
          <Card>
            <CardHeader title={t('team.waitingTitle', { count: team.invites.length })} icon="envelope-open-text" iconColor={colors.primary} />
            <CardBody style={{ paddingVertical: 8 }}>
              {team.invites.map((inv, i) => (
                <View key={inv.id} style={[styles.row, i < team.invites.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text }} numberOfLines={1}>{inv.name}</Text>
                    <Text style={{ fontSize: 11.5, color: colors.textLight }} numberOfLines={1}>{inv.email} · {fmtDate(inv.invited_at)}</Text>
                  </View>
                  <Button title={t('common.cancel')} variant="secondary" size="sm" onPress={() => cancelInvite(inv)} />
                </View>
              ))}
            </CardBody>
          </Card>
        </>
      ) : null}
      <View style={{ height: 24 }} />

      <Modal open={open} onClose={() => setOpen(false)} title={t('team.inviteTitle')}
        footer={<><Button title={t('common.cancel')} variant="secondary" onPress={() => setOpen(false)} /><Button title={t('team.sendInvite')} icon="paper-plane" loading={busy} onPress={invite} /></>}>
        <Text style={{ fontSize: 13, color: colors.textLight, marginBottom: 12 }}>{t('team.inviteIntro')}</Text>
        <FormGroup label={t('account.fullName')} required><Input value={form.full_name} onChangeText={set('full_name')} /></FormGroup>
        <FormGroup label={t('team.email')} required><Input value={form.email} onChangeText={set('email')} keyboardType="email-address" autoCapitalize="none" /></FormGroup>
        <FormGroup label={t('settings.phoneNumber')}><Input value={form.phone} onChangeText={set('phone')} keyboardType="phone-pad" /></FormGroup>
        <Text style={{ fontSize: 12.5, color: colors.textLight }}>{t('team.inviteAfter')}</Text>
        {error ? <Text style={{ fontSize: 13, color: colors.red, marginTop: 10 }}>{error}</Text> : null}
      </Modal>
    </Page>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  avatar: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  count: { minWidth: 28, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, alignItems: 'center' },
  countText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
});
