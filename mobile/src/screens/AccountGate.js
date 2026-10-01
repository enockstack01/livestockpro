import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useUser } from '@clerk/expo';
import { useTranslation } from 'react-i18next';
import AuthShell from '../components/AuthShell';
import { makeAuthStyles } from '../components/AuthStyles';
import Icon from '../components/Icon';
import { Button, FormGroup, Input } from '../ui/kit';
import { useSignOut } from '../ui/AppShell';
import { useTheme } from '../theme/ThemeProvider';
import { useToast } from '../lib/toast';
import { haptics } from '../lib/haptics';
import { useApi } from '../api/client';
import { useAccount } from '../account/AccountProvider';
import { ACCOUNT_TYPES, ACCOUNT_TYPE_ICONS } from '../../../shared/account';

/* The mobile twin of the web's components/AccountGate.jsx: shown instead of
   the app until an admin approves the account — the request form first,
   then a "request sent" page (or rejected / on hold), on the same green
   brand shell as sign-in. */
export default function AccountGate() {
  const { account, loadError, checking, refresh, setAccount } = useAccount();
  const [editing, setEditing] = useState(false);

  if (!account && loadError) return <LoadError onRetry={refresh} checking={checking} />;
  if (!account || account.status === 'none' || editing) {
    return <RequestForm account={account || { status: 'none' }} onSubmitted={(next) => { setEditing(false); setAccount(next); }} />;
  }
  return <StatusScreen account={account} refresh={refresh} checking={checking} onResubmit={() => setEditing(true)} />;
}

function useGateStyles() {
  const { colors, radius } = useTheme();
  return useMemo(() => ({ auth: makeAuthStyles(colors, radius), gate: makeGateStyles(colors) }), [colors, radius]);
}

function LoadError({ onRetry, checking }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { auth, gate } = useGateStyles();
  const signOut = useSignOut();
  return (
    <AuthShell>
      <ScrollView contentContainerStyle={auth.content}>
        <View style={[gate.stateIcon, { backgroundColor: 'rgba(249,168,37,0.15)' }]}><Icon name="wifi" size={34} color={colors.orange} /></View>
        <Text style={[auth.title, gate.center]}>{t('account.loadFailedTitle')}</Text>
        <Text style={[auth.subtitle, gate.center]}>{t('account.loadFailedMessage')}</Text>
        <Button title={t('account.retry')} icon="rotate" loading={checking} onPress={onRetry} block />
        <Button title={t('nav.signOut')} icon="right-from-bracket" variant="secondary" onPress={signOut} block />
      </ScrollView>
    </AuthShell>
  );
}

function StatusScreen({ account, refresh, checking, onResubmit }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { auth, gate } = useGateStyles();
  const showToast = useToast();
  const signOut = useSignOut();

  const STATES = {
    pending: { icon: 'paper-plane', tint: colors.primary, bg: colors.primaryLight, title: t('account.pendingTitle'), message: t('account.pendingMessage') },
    rejected: { icon: 'circle-xmark', tint: colors.red, bg: 'rgba(211,47,47,0.12)', title: t('account.rejectedTitle'), message: t('account.rejectedMessage') },
    on_hold: { icon: 'circle-pause', tint: colors.orange, bg: 'rgba(249,168,37,0.15)', title: t('account.onHoldTitle'), message: t('account.onHoldMessage') }
  };
  const state = STATES[account.status] || STATES.pending;
  const r = account.request || {};

  async function checkStatus() {
    const next = await refresh();
    if (!next) showToast(t('account.loadFailedMessage'), 'error');
    else if (next.status === account.status) showToast(t('account.stillUnchanged'), 'info');
  }

  const rows = [
    [t('account.accountType'), t(`account.types.${account.accountType || 'farmer'}`)],
    [t('account.fullName'), r.full_name],
    [t('account.farmName'), r.farm_name],
    [t('settings.location'), r.location],
    [t('settings.phoneNumber'), r.phone]
  ].filter(([, v]) => v);

  return (
    <AuthShell>
      <ScrollView contentContainerStyle={auth.content}>
        <View style={[gate.stateIcon, { backgroundColor: state.bg }]}><Icon name={state.icon} size={34} color={state.tint} /></View>
        <Text style={[auth.title, gate.center]}>{state.title}</Text>
        <Text style={[auth.subtitle, gate.center]}>{state.message}</Text>

        {account.reviewNote && account.status !== 'pending' ? (
          <View style={gate.box}>
            <Text style={gate.boxHead}>{t('account.adminNote')}</Text>
            <Text style={gate.muted}>{account.reviewNote}</Text>
          </View>
        ) : null}

        {account.status === 'pending' ? (
          <View style={gate.box}>
            <View style={gate.boxHeadRow}>
              <Text style={gate.boxHead}>{t('account.yourRequest')}</Text>
              {account.submittedAt ? <Text style={gate.muted}>{t('account.submittedOn', { date: new Date(account.submittedAt).toLocaleDateString() })}</Text> : null}
            </View>
            {rows.map(([label, value], i) => (
              <View key={label} style={[gate.row, i === rows.length - 1 && { borderBottomWidth: 0 }]}>
                <Text style={gate.rowLabel}>{label}</Text>
                <Text style={gate.rowValue} numberOfLines={2}>{value}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {account.status === 'rejected'
          ? <Button title={t('account.resubmit')} icon="pen-to-square" onPress={onResubmit} block />
          : <Button title={t('account.checkStatus')} icon="rotate" loading={checking} onPress={checkStatus} block />}
        <Button title={t('nav.signOut')} icon="right-from-bracket" variant="secondary" onPress={signOut} block />
      </ScrollView>
    </AuthShell>
  );
}

function RequestForm({ account, onSubmitted }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { auth, gate } = useGateStyles();
  const { user } = useUser();
  const api = useApi();
  const showToast = useToast();
  const signOut = useSignOut();
  const prev = account.request || {};
  const [accountType, setAccountType] = useState(account.status === 'none' ? '' : (account.accountType || ''));
  const [form, setForm] = useState({
    full_name: prev.full_name || user?.fullName || '',
    farm_name: prev.farm_name || '',
    location: prev.location || '',
    phone: prev.phone || '',
    herd_size: prev.herd_size || '',
    livestock_types: prev.livestock_types || '',
    notes: prev.notes || ''
  });
  const [submitting, setSubmitting] = useState(false);
  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));
  const email = user?.primaryEmailAddress?.emailAddress || '';

  async function submit() {
    if (!accountType) { showToast(t('account.chooseType'), 'error'); return; }
    if (!form.full_name.trim() || !form.location.trim() || !form.phone.trim()) { showToast(t('account.requiredFields'), 'error'); return; }
    setSubmitting(true);
    const { data, error } = await api.requestAccount({ ...form, account_type: accountType });
    setSubmitting(false);
    if (error) { showToast(t('account.submitFailed', { message: error.message }), 'error'); return; }
    haptics.success();
    onSubmitted(data);
  }

  return (
    <AuthShell>
      <ScrollView contentContainerStyle={[auth.content, { justifyContent: 'flex-start', gap: 0 }]} keyboardShouldPersistTaps="handled">
        <Text style={auth.title}>{t('account.requestTitle')}</Text>
        <Text style={[auth.subtitle, { marginBottom: 20 }]}>{t('account.requestSubtitle')}</Text>

        <FormGroup label={t('account.accountType')} required>
          <View style={gate.typeGrid}>
            {ACCOUNT_TYPES.map((type) => {
              const active = accountType === type;
              return (
                <Pressable
                  key={type}
                  onPress={() => { haptics.select(); setAccountType(type); }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  style={[gate.typeOption, active && { borderColor: colors.primary, backgroundColor: colors.primaryLight }]}
                >
                  <Icon name={ACCOUNT_TYPE_ICONS[type]} size={14} color={active ? colors.primary : colors.textLight} />
                  <Text style={[gate.typeText, active && { color: colors.primaryDark }]} numberOfLines={2}>{t(`account.types.${type}`)}</Text>
                </Pressable>
              );
            })}
          </View>
        </FormGroup>

        <FormGroup label={t('account.fullName')} required><Input value={form.full_name} onChangeText={set('full_name')} placeholder={t('account.fullNamePlaceholder')} /></FormGroup>
        <FormGroup label={t('account.farmName')}><Input value={form.farm_name} onChangeText={set('farm_name')} placeholder={t('settings.farmNamePlaceholder')} /></FormGroup>
        <FormGroup label={t('settings.location')} required><Input value={form.location} onChangeText={set('location')} placeholder={t('settings.locationPlaceholder')} /></FormGroup>
        <FormGroup label={t('settings.phoneNumber')} required><Input value={form.phone} onChangeText={set('phone')} placeholder={t('settings.phonePlaceholder')} keyboardType="phone-pad" /></FormGroup>
        <FormGroup label={t('account.herdSize')}><Input value={String(form.herd_size)} onChangeText={set('herd_size')} placeholder="0" keyboardType="number-pad" /></FormGroup>
        <FormGroup label={t('account.livestockTypes')}><Input value={form.livestock_types} onChangeText={set('livestock_types')} placeholder={t('account.livestockTypesPlaceholder')} /></FormGroup>
        <FormGroup label={t('account.notes')}><Input value={form.notes} onChangeText={set('notes')} placeholder={t('account.notesPlaceholder')} multiline /></FormGroup>

        <Button title={submitting ? t('account.submitting') : t('account.submit')} icon="paper-plane" loading={submitting} onPress={submit} block />
        <View style={[auth.footerRow, { flexWrap: 'wrap' }]}>
          <Text style={[auth.footerText, { fontSize: 13 }]}>{t('settings.signedInAs', { email })} · </Text>
          <Pressable onPress={signOut}><Text style={[auth.link, { fontSize: 13 }]}>{t('nav.signOut')}</Text></Pressable>
        </View>
      </ScrollView>
    </AuthShell>
  );
}

function makeGateStyles(colors) {
  return StyleSheet.create({
    center: { textAlign: 'center' },
    stateIcon: { width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 8 },
    box: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 16, backgroundColor: colors.bg, marginBottom: 8 },
    boxHeadRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, marginBottom: 4 },
    boxHead: { fontSize: 13, fontWeight: '700', color: colors.text },
    muted: { fontSize: 13, color: colors.textLight, marginTop: 2 },
    row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.border },
    rowLabel: { fontSize: 13, color: colors.textLight },
    rowValue: { fontSize: 13, fontWeight: '600', color: colors.text, flexShrink: 1, textAlign: 'right' },
    typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    typeOption: { flexGrow: 1, flexBasis: '45%', flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 11, paddingHorizontal: 12, borderWidth: 1.5, borderColor: colors.border, borderRadius: 10, backgroundColor: colors.card },
    typeText: { flexShrink: 1, fontSize: 13, fontWeight: '500', color: colors.text }
  });
}
