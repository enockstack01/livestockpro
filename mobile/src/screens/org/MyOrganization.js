import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import Icon from '../../components/Icon';
import { useApi } from '../../api/client';
import { useTheme } from '../../theme/ThemeProvider';
import { useToast } from '../../lib/toast';
import { Button, Card, CardBody, CardHeader, Input, Modal, Muted } from '../../ui/kit';
import { orgErrorText } from './orgShared';
import { ORG_TYPE_ICONS, tokenFromLink } from '../../../../shared/org';

/* The farmer's side of an organization on the phone (twin of the web's
   components/org/MyOrganization.jsx). */
export function useMyOrganization(enabled = true) {
  const api = useApi();
  const [state, setState] = useState({ loading: true, data: null });
  const apiRef = useRef(api);
  apiRef.current = api;
  const reload = useCallback(async () => {
    if (!enabled) return;
    const { data } = await apiRef.current.http('GET', '/me/organization');
    setState({ loading: false, data: data || null });
  }, [enabled]);
  useEffect(() => { reload(); }, [reload]);
  return { ...state, reload };
}

function Check({ checked, onChange, label }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={() => onChange(!checked)} style={styles.check} accessibilityRole="checkbox" accessibilityState={{ checked }}>
      <View style={[styles.box, { borderColor: checked ? colors.primary : colors.border, backgroundColor: checked ? colors.primary : colors.card }]}>
        {checked ? <Icon name="check" size={11} color="#FFFFFF" /> : null}
      </View>
      <Text style={{ flex: 1, fontSize: 13.5, lineHeight: 19, color: colors.text }}>{label}</Text>
    </Pressable>
  );
}
export { Check };

function OrgMark({ org }) {
  const { colors } = useTheme();
  return <View style={[styles.mark, { backgroundColor: colors.leaf }]}><Icon name={ORG_TYPE_ICONS[org.type] || 'building'} size={18} color="#FFFFFF" /></View>;
}
export { OrgMark };

/* Shown over the app when Logistack imported this farmer into an
   organization: nothing is shared until they accept. */
export function ConsentRequest({ mine, onAnswered }) {
  const { t } = useTranslation();
  const api = useApi();
  const showToast = useToast();
  const [detail, setDetail] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!mine || mine.status !== 'pending_consent') return null;
  async function answer(accept) {
    setBusy(true);
    const { error } = await api.http('POST', '/me/organization/consent', { accept, detail_access: detail });
    setBusy(false);
    if (error) { showToast(orgErrorText(t, error), 'error'); return; }
    showToast(accept ? t('org.my.accepted', { name: mine.organization.name }) : t('org.my.declined'), 'success');
    onAnswered();
  }
  return (
    <Modal open onClose={() => {}} title={t('org.my.requestTitle')}
      footer={<><Button title={t('org.my.decline')} variant="secondary" onPress={() => answer(false)} disabled={busy} /><Button title={t('org.my.accept')} icon="handshake" onPress={() => answer(true)} disabled={busy} /></>}>
      <View style={styles.orgRow}><OrgMark org={mine.organization} /><Text style={styles.orgName}>{mine.organization.name}</Text></View>
      <Muted style={{ marginVertical: 10 }}>{t('org.my.requestText', { name: mine.organization.name })}</Muted>
      <Check checked={detail} onChange={setDetail} label={t('org.join.detailLabel', { name: mine.organization.name })} />
      <Muted style={{ fontSize: 11.5, marginTop: 8 }}>{t('org.join.privacy')}</Muted>
    </Modal>
  );
}

export default function MyOrganizationCard() {
  const { t, i18n } = useTranslation();
  const api = useApi();
  const router = useRouter();
  const showToast = useToast();
  const { colors } = useTheme();
  const { data: mine, reload } = useMyOrganization();
  const [leaving, setLeaving] = useState(false);
  const [link, setLink] = useState('');

  async function toggleDetail(on) {
    const { error } = await api.http('PATCH', '/me/organization', { detail_access: on });
    if (error) { showToast(orgErrorText(t, error), 'error'); return; }
    reload();
  }
  async function leave() {
    const { error } = await api.http('POST', '/me/organization/leave', {});
    setLeaving(false);
    if (error) { showToast(orgErrorText(t, error), 'error'); return; }
    showToast(t('org.my.left'), 'success');
    reload();
  }
  function openLink() {
    const token = tokenFromLink(link);
    if (!token) { showToast(t('org.my.badLink'), 'error'); return; }
    router.push(`/join/${token}`);
  }

  return (
    <Card style={{ marginBottom: 16 }}>
      <CardHeader title={t('org.my.title')} icon="people-group" />
      <CardBody>
        {!mine ? (
          <>
            <Muted style={{ marginBottom: 10 }}>{t('org.my.none')}</Muted>
            <Input value={link} onChangeText={setLink} placeholder={t('org.my.pasteLink')} autoCapitalize="none" />
            <Button title={t('org.my.open')} variant="secondary" onPress={openLink} disabled={!link.trim()} style={{ marginTop: 10, alignSelf: 'flex-start' }} />
          </>
        ) : (
          <>
            <View style={styles.orgRow}>
              <OrgMark org={mine.organization} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.orgName, { color: colors.text }]}>{mine.organization.name}</Text>
                <Muted>{mine.status === 'active' ? t('org.my.since', { date: new Date(mine.joined_at).toLocaleDateString(i18n.language) }) : t('org.my.waiting')}</Muted>
              </View>
            </View>
            {mine.status === 'active' ? (
              <>
                <Muted style={{ marginVertical: 10 }}>{t('org.my.sharing')}</Muted>
                <Check checked={mine.detail_access} onChange={toggleDetail} label={t('org.join.detailLabel', { name: mine.organization.name })} />
                {mine.organization.contact_phone || mine.organization.contact_email ? <Muted style={{ marginTop: 8 }}>{t('org.my.contact')}: {[mine.organization.contact_phone, mine.organization.contact_email].filter(Boolean).join(' · ')}</Muted> : null}
                <Button title={t('org.my.leave')} icon="right-from-bracket" variant="secondary" onPress={() => setLeaving(true)} style={{ marginTop: 14, alignSelf: 'flex-start' }} />
              </>
            ) : null}
          </>
        )}
      </CardBody>
      <Modal open={leaving} onClose={() => setLeaving(false)} title={t('org.my.leave')}
        footer={<><Button title={t('common.cancel')} variant="secondary" onPress={() => setLeaving(false)} /><Button title={t('org.my.leave')} variant="danger" onPress={leave} /></>}>
        <Text style={{ color: colors.text }}>{mine ? t('org.my.leaveConfirm', { name: mine.organization.name }) : ''}</Text>
      </Modal>
    </Card>
  );
}

const styles = StyleSheet.create({
  check: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingVertical: 6 },
  box: { width: 22, height: 22, borderRadius: 5, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  mark: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  orgRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  orgName: { fontSize: 15.5, fontWeight: '800' }
});
