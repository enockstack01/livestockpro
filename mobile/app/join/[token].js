import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth, useUser } from '@clerk/expo';
import { useTranslation } from 'react-i18next';
import * as SecureStore from 'expo-secure-store';
import AuthShell from '../../src/components/AuthShell';
import Icon from '../../src/components/Icon';
import { SplashReadyOnMount } from '../../src/components/AppSplash';
import { useApi } from '../../src/api/client';
import { useAccount } from '../../src/account/AccountProvider';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Button, FormGroup, Input, Muted, Spinner } from '../../src/ui/kit';
import { Check, OrgMark } from '../../src/screens/org/MyOrganization';
import { orgErrorText, useTick } from '../../src/screens/org/orgShared';
import { formatTimeLeft, timeLeft } from '../../../shared/org';
import { JOIN_TOKEN_KEY } from '../../src/lib/joinToken';

/* livestockpro://join/<token> and https://livestockpro.agricoders.com/join/<token>:
   a farmer opens an organization's referral link on the phone. The link is
   checked on the server when the screen opens and again on submit. Signed
   out, the farmer signs up or in and is brought back here (the token waits
   in secure storage); signed in, they agree and join. */
export default function JoinScreen() {
  const { token } = useLocalSearchParams();
  const { t } = useTranslation();
  const router = useRouter();
  const api = useApi();
  const { colors } = useTheme();
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const accountCtx = useAccount();
  const [state, setState] = useState({ loading: true });
  const [consent, setConsent] = useState(false);
  const [detail, setDetail] = useState(false);
  const [form, setForm] = useState({ full_name: '', phone: '', district: '', sector: '', cell: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [joined, setJoined] = useState(null);

  useEffect(() => { SecureStore.setItemAsync(JOIN_TOKEN_KEY, String(token)).catch(() => {}); }, [token]);
  useEffect(() => { if (user) setForm((f) => ({ ...f, full_name: f.full_name || user.fullName || '' })); }, [user]);
  useEffect(() => {
    if (!isLoaded) return undefined;
    let live = true;
    api.http('GET', `/join/${encodeURIComponent(String(token))}`).then(({ data, error: err }) => {
      if (!live) return;
      if (err && !err.networkError) SecureStore.deleteItemAsync(JOIN_TOKEN_KEY).catch(() => {});
      setState(err ? { loading: false, error: err } : { loading: false, data, offset: new Date(data.server_time).getTime() - Date.now() });
    });
    return () => { live = false; };
  }, [api, token, isLoaded, isSignedIn]);
  useTick(Boolean(state.data) && !joined);

  async function join() {
    if (!consent) { setError(t('org.join.consentRequired')); return; }
    setBusy(true);
    setError('');
    const { data, error: err } = await api.http('POST', `/join/${encodeURIComponent(String(token))}`, { consent: true, detail_access: detail, profile: form });
    setBusy(false);
    if (err) { setError(orgErrorText(t, err)); return; }
    await SecureStore.deleteItemAsync(JOIN_TOKEN_KEY).catch(() => {});
    setJoined(data.organization);
    if (accountCtx && accountCtx.refresh) accountCtx.refresh();
  }

  const org = state.data && state.data.organization;
  const me = state.data && state.data.me;
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  let body;

  if (state.loading || !isLoaded) body = <Spinner />;
  else if (state.error) {
    body = (
      <View style={styles.center}>
        <View style={[styles.stateIcon, { backgroundColor: colors.red }]}><Icon name="link-slash" size={26} color="#FFFFFF" /></View>
        <Text style={[styles.title, { color: colors.primaryDark }]}>{t('org.join.unavailableTitle')}</Text>
        <Muted style={{ textAlign: 'center' }}>{orgErrorText(t, state.error)}</Muted>
        <Button title={t('org.join.goHome')} variant="secondary" onPress={() => { SecureStore.deleteItemAsync(JOIN_TOKEN_KEY).catch(() => {}); router.replace('/'); }} style={{ marginTop: 16 }} />
      </View>
    );
  } else if (joined) {
    body = (
      <View style={styles.center}>
        <View style={[styles.stateIcon, { backgroundColor: colors.leaf }]}><Icon name="circle-check" size={26} color="#FFFFFF" /></View>
        <Text style={[styles.title, { color: colors.primaryDark }]}>{t('org.join.joinedTitle', { name: joined.name })}</Text>
        <Muted style={{ textAlign: 'center' }}>{t('org.join.joinedMessage', { name: joined.name })}</Muted>
        <Button title={t('org.join.openApp')} icon="arrow-right" onPress={() => router.replace('/')} style={{ marginTop: 16 }} />
      </View>
    );
  } else {
    const left = timeLeft(state.data.expires_at, state.offset);
    body = (
      <>
        <Muted style={{ fontWeight: '700' }}>{t('org.join.invitedBy')}</Muted>
        <View style={styles.orgRow}>
          <OrgMark org={org} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: colors.primaryDark, textAlign: 'left', marginTop: 0 }]}>{org.name}</Text>
            <Muted>{[t(`org.types.${org.type}`), org.district, org.sector].filter(Boolean).join(' · ')}</Muted>
          </View>
        </View>
        <View style={[styles.note, { borderColor: colors.border, backgroundColor: colors.bg }]}>
          <Icon name="share-nodes" size={13} color={colors.leaf} />
          <Text style={{ flex: 1, fontSize: 13.5, lineHeight: 19, color: colors.text }}>{t('org.join.shareExplain', { name: org.name })}</Text>
        </View>
        <Muted style={{ marginBottom: 14 }}>{t('org.join.expiresIn', { time: formatTimeLeft(t, left) })}</Muted>

        {!isSignedIn ? (
          <View style={{ gap: 10 }}>
            <Text style={{ fontWeight: '800', color: colors.primaryDark }}>{t('org.join.createAccount')}</Text>
            <Button title={t('auth.signUp')} icon="user-plus" onPress={() => router.push('/sign-up')} block />
            <Button title={t('auth.signIn')} variant="secondary" onPress={() => router.push('/sign-in')} block />
          </View>
        ) : me && me.state !== 'can_join' ? (
          <Muted style={{ color: colors.red }}>{t(`org.join.state.${me.state}`, { name: me.organization || org.name })}</Muted>
        ) : (
          <>
            <FormGroup label={t('account.fullName')}><Input value={form.full_name} onChangeText={set('full_name')} /></FormGroup>
            <FormGroup label={t('settings.phoneNumber')}><Input value={form.phone} onChangeText={set('phone')} keyboardType="phone-pad" /></FormGroup>
            <FormGroup label={t('org.fields.district')}><Input value={form.district} onChangeText={set('district')} /></FormGroup>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <FormGroup label={t('org.fields.sector')} style={{ flex: 1 }}><Input value={form.sector} onChangeText={set('sector')} /></FormGroup>
              <FormGroup label={t('org.fields.cell')} style={{ flex: 1 }}><Input value={form.cell} onChangeText={set('cell')} /></FormGroup>
            </View>
            <Check checked={consent} onChange={setConsent} label={t('org.join.consentLabel', { name: org.name })} />
            <Check checked={detail} onChange={setDetail} label={t('org.join.detailLabel', { name: org.name })} />
            <Muted style={{ fontSize: 11.5, marginVertical: 8 }}>{t('org.join.privacy')}</Muted>
            {error ? <Text style={{ color: colors.red, marginBottom: 8 }}>{error}</Text> : null}
            <Button title={t('org.join.joinButton', { name: org.name })} icon="handshake" onPress={join} loading={busy} disabled={busy || !consent} block />
          </>
        )}
      </>
    );
  }

  return (
    <AuthShell>
      <SplashReadyOnMount />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">{body}</ScrollView>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 20, paddingBottom: 40, maxWidth: 480, width: '100%', alignSelf: 'center' },
  center: { alignItems: 'center', paddingVertical: 30, gap: 8 },
  stateIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: '800', textAlign: 'center', marginTop: 8 },
  orgRow: { flexDirection: 'row', gap: 12, alignItems: 'center', marginVertical: 10 },
  note: { flexDirection: 'row', gap: 10, borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 10 }
});
