import { useState } from 'react';
import { Linking, Share, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import { useApi } from '../../api/client';
import { useTheme } from '../../theme/ThemeProvider';
import { useToast } from '../../lib/toast';
import { haptics } from '../../lib/haptics';
import { Button, Card, CardBody, CardHeader, EmptyState, FormGroup, Input, Modal, Muted, Page, PageHeader } from '../../ui/kit';
import { Pill, UsageMeter, orgErrorText, useOrgData, useOrgMember, useTick } from './orgShared';
import { formatTimeLeft, inviteMessage, LINK_STATUS_TONE, timeLeft } from '../../../../shared/org';

/* Referral links for field officers: generate a link (optionally capped),
   then share it on WhatsApp or by SMS, copy it, or show its QR code for a
   field day; watch the live countdown. Organization admins can revoke. */
export default function OrgLinksScreen() {
  const { t, i18n } = useTranslation();
  const api = useApi();
  const showToast = useToast();
  const { colors } = useTheme();
  const { orgId, isAdmin, readOnly } = useOrgMember();
  const org = useOrgData(api, orgId ? `/organizations/${orgId}` : null);
  const links = useOrgData(api, orgId ? `/organizations/${orgId}/referral-links` : null);
  const [maxUses, setMaxUses] = useState('');
  const [busy, setBusy] = useState(false);
  const [fresh, setFresh] = useState(null);
  useTick(true);

  async function generate() {
    setBusy(true);
    const { data, error } = await api.http('POST', `/organizations/${orgId}/referral-links`, { max_uses: maxUses === '' ? null : Number(maxUses) });
    setBusy(false);
    if (error) { showToast(orgErrorText(t, error), 'error'); return; }
    haptics.success && haptics.success();
    setFresh(data);
    links.reload();
  }
  async function revoke(l) {
    const { error } = await api.http('DELETE', `/organizations/${orgId}/referral-links/${l.id}`);
    if (error) { showToast(orgErrorText(t, error), 'error'); return; }
    showToast(t('org.links.revoked'), 'success');
    links.reload();
  }

  const o = org.data;
  return (
    <Page refreshing={false} onRefresh={links.reload}>
      <PageHeader title={t('org.links.title')} subtitle={t('org.links.subtitle', { hours: o ? o.referral_link_hours : 6 })} />
      {o ? <View style={{ marginBottom: 14 }}><UsageMeter used={o.usage.used} limit={o.usage.limit} /></View> : null}
      {!readOnly ? (
        <Card style={{ marginBottom: 14 }}>
          <CardHeader title={t('org.links.newLink')} icon="wand-magic-sparkles" />
          <CardBody>
            <FormGroup label={t('org.links.maxUses')}>
              <Input value={maxUses} onChangeText={(v) => setMaxUses(v.replace(/[^0-9]/g, ''))} keyboardType="number-pad" placeholder={t('org.links.unlimited')} />
            </FormGroup>
            <Muted style={{ marginBottom: 12 }}>{t('org.links.maxUsesHint')}</Muted>
            <Button title={t('org.links.generate')} icon="link" onPress={generate} loading={busy} disabled={busy || (o && o.usage.used >= o.usage.limit)} block />
          </CardBody>
        </Card>
      ) : <Muted style={{ marginBottom: 14 }}>{t('org.readOnly')}</Muted>}

      <Card>
        <CardHeader title={t('org.links.allLinks')} icon="list" />
        <CardBody flush>
          {(links.data || []).length === 0 ? <EmptyState icon="link" title={t('org.links.empty')} compact /> : links.data.map((l, i) => {
            const left = timeLeft(l.expires_at);
            const status = l.status === 'active' && !left.ms ? 'expired' : l.status;
            return (
              <View key={l.id} style={[styles.linkRow, i < links.data.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
                <View style={{ flex: 1, gap: 4 }}>
                  <Pill tone={LINK_STATUS_TONE[status] || 'gray'} label={t(`org.links.status.${status}`)} />
                  <Text style={{ fontSize: 13, color: colors.text, fontWeight: status === 'active' ? '800' : '400' }}>{status === 'active' ? formatTimeLeft(t, left) : new Date(l.expires_at).toLocaleString(i18n.language)}</Text>
                  <Muted>{t('org.links.joinedCount', { count: l.use_count })}{l.max_uses ? ` / ${l.max_uses}` : ''}{l.created_by_name ? ` · ${l.created_by_name}` : ''}</Muted>
                </View>
                {isAdmin && status === 'active' && !readOnly ? <Button title={t('org.links.revoke')} icon="ban" variant="secondary" size="sm" onPress={() => revoke(l)} /> : null}
              </View>
            );
          })}
        </CardBody>
      </Card>

      <ShareModal link={fresh} orgName={o ? o.name : ''} onClose={() => setFresh(null)} />
    </Page>
  );
}

function ShareModal({ link, orgName, onClose }) {
  const { t } = useTranslation();
  const showToast = useToast();
  const { colors } = useTheme();
  if (!link) return null;
  const left = timeLeft(link.expires_at);
  const hours = Math.round((new Date(link.expires_at) - new Date(link.created_at)) / 3600000);
  const message = inviteMessage(t, orgName, link.url, hours);
  async function copy() {
    await Clipboard.setStringAsync(link.url);
    showToast(t('org.links.copied'), 'success');
  }
  async function whatsapp() {
    const url = `whatsapp://send?text=${encodeURIComponent(message)}`;
    try {
      if (await Linking.canOpenURL(url)) return Linking.openURL(url);
    } catch { /* fall back to the web link */ }
    return Linking.openURL(`https://wa.me/?text=${encodeURIComponent(message)}`);
  }
  return (
    <Modal open onClose={onClose} title={t('org.links.ready')} footer={<Button title={t('common.done')} onPress={onClose} />}>
      <Muted style={{ marginBottom: 10 }}>{t('org.links.readyHint')}</Muted>
      <View style={[styles.urlBox, { borderColor: colors.border, backgroundColor: colors.bg }]}><Text selectable style={{ color: colors.text, fontSize: 12.5 }}>{link.url}</Text></View>
      <View style={styles.actions}>
        <Button title={t('org.links.copy')} icon="copy" size="sm" onPress={copy} />
        <Button title="WhatsApp" icon="paper-plane" variant="secondary" size="sm" onPress={whatsapp} />
        <Button title={t('org.links.sms')} icon="comment-sms" variant="secondary" size="sm" onPress={() => Linking.openURL(`sms:?body=${encodeURIComponent(message)}`)} />
        <Button title={t('org.mobile.share')} icon="share-nodes" variant="secondary" size="sm" onPress={() => Share.share({ message })} />
      </View>
      <View style={[styles.qr, { borderColor: colors.border }]}>
        <View style={{ backgroundColor: '#FFFFFF', padding: 8, borderRadius: 8 }}>
          <QRCode value={link.url} size={180} color="#1C2B1E" backgroundColor="#FFFFFF" />
        </View>
        <Text style={{ fontSize: 22, fontWeight: '800', color: colors.primaryDark, marginTop: 10 }}>{formatTimeLeft(t, left)}</Text>
        <Muted>{t('org.links.validFor', { hours })}{link.max_uses ? ` · ${t('org.links.maxUsesShort', { count: link.max_uses })}` : ''}</Muted>
        <Muted style={{ textAlign: 'center', marginTop: 6 }}>{t('org.links.scanToJoin')}</Muted>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12 },
  urlBox: { borderWidth: 1, borderRadius: 8, padding: 10, marginBottom: 10 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  qr: { borderWidth: 1, borderRadius: 12, padding: 14, alignItems: 'center' }
});
