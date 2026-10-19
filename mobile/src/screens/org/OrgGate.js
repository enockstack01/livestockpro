import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useUser } from '@clerk/expo';
import { useTranslation } from 'react-i18next';
import AuthShell from '../../components/AuthShell';
import { makeAuthStyles } from '../../components/AuthStyles';
import Icon from '../../components/Icon';
import { useApi } from '../../api/client';
import { useTheme } from '../../theme/ThemeProvider';
import { useToast } from '../../lib/toast';
import { haptics } from '../../lib/haptics';
import { useSignOut } from '../../ui/AppShell';
import { Button, FormGroup, Input } from '../../ui/kit';
import { orgErrorText } from './orgShared';
import { ORG_TYPES, ORG_TYPE_ICONS } from '../../../../shared/org';

/* Mobile twins of the web's components/org/OrgGate.jsx: register an
   organization, wait for Logistack approval, answer a staff invitation. */

function useAuthStyles() {
  const { colors, radius } = useTheme();
  return makeAuthStyles(colors, radius);
}

export function OrgRegisterForm({ onDone, onBack }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const auth = useAuthStyles();
  const { user } = useUser();
  const api = useApi();
  const showToast = useToast();
  const [adminName, setAdminName] = useState(user?.fullName || '');
  const [form, setForm] = useState({ name: '', type: 'cooperative', country: 'Rwanda', district: '', sector: '', contact_email: user?.primaryEmailAddress?.emailAddress || '', contact_phone: '', description: '' });
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  async function submit() {
    if (!form.name.trim() || !form.contact_email.trim() || !form.contact_phone.trim()) { showToast(t('account.requiredFields'), 'error'); return; }
    setBusy(true);
    const { error } = await api.http('POST', '/organizations/register', { ...form, admin_name: adminName });
    setBusy(false);
    if (error) { showToast(orgErrorText(t, error), 'error'); return; }
    haptics.success();
    onDone();
  }

  return (
    <AuthShell>
      <ScrollView contentContainerStyle={[auth.content, { justifyContent: 'flex-start', gap: 0 }]} keyboardShouldPersistTaps="handled">
        <Text style={auth.title}>{t('org.register.title')}</Text>
        <Text style={[auth.subtitle, { marginBottom: 20 }]}>{t('org.register.subtitle')}</Text>
        <FormGroup label={t('org.register.yourName')} required><Input value={adminName} onChangeText={setAdminName} /></FormGroup>
        <FormGroup label={t('org.fields.name')} required><Input value={form.name} onChangeText={set('name')} /></FormGroup>
        <FormGroup label={t('org.fields.type')} required>
          <View style={styles.typeGrid}>
            {ORG_TYPES.map((type) => {
              const active = form.type === type;
              return (
                <Pressable key={type} onPress={() => { haptics.select(); setForm((f) => ({ ...f, type })); }} style={[styles.type, { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary : colors.card }]}>
                  <Icon name={ORG_TYPE_ICONS[type]} size={13} color={active ? '#FFFFFF' : colors.textLight} />
                  <Text style={{ fontSize: 12.5, fontWeight: '700', color: active ? '#FFFFFF' : colors.text }}>{t(`org.types.${type}`)}</Text>
                </Pressable>
              );
            })}
          </View>
        </FormGroup>
        <FormGroup label={t('org.fields.district')}><Input value={form.district} onChangeText={set('district')} /></FormGroup>
        <FormGroup label={t('org.fields.sector')}><Input value={form.sector} onChangeText={set('sector')} /></FormGroup>
        <FormGroup label={t('org.fields.contactPhone')} required><Input value={form.contact_phone} onChangeText={set('contact_phone')} keyboardType="phone-pad" /></FormGroup>
        <FormGroup label={t('org.fields.contactEmail')} required><Input value={form.contact_email} onChangeText={set('contact_email')} keyboardType="email-address" autoCapitalize="none" /></FormGroup>
        <FormGroup label={t('org.fields.description')}><Input value={form.description} onChangeText={set('description')} multiline /></FormGroup>
        <Button title={t('org.register.submit')} icon="paper-plane" loading={busy} onPress={submit} block />
        <Pressable onPress={onBack} style={{ marginTop: 16, alignSelf: 'center' }}><Text style={auth.link}>{t('org.register.backToFarmer')}</Text></Pressable>
      </ScrollView>
    </AuthShell>
  );
}

export function OrgPendingScreen({ account, checking, onCheck }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const auth = useAuthStyles();
  const signOut = useSignOut();
  const org = account.organization || {};
  return (
    <AuthShell>
      <View style={[auth.content, { alignItems: 'center' }]}>
        <View style={[styles.stateIcon, { backgroundColor: colors.leaf }]}><Icon name="building-circle-check" size={26} color="#FFFFFF" /></View>
        <Text style={[auth.title, { textAlign: 'center' }]}>{t('org.pending.title', { name: org.name || '' })}</Text>
        <Text style={[auth.subtitle, { textAlign: 'center' }]}>{t('org.pending.message')}</Text>
        <Button title={t('account.checkStatus')} icon="rotate" loading={checking} onPress={onCheck} block />
        <Button title={t('nav.signOut')} icon="right-from-bracket" variant="secondary" onPress={signOut} block style={{ marginTop: 10 }} />
      </View>
    </AuthShell>
  );
}

export function OrgInviteScreen({ invites, onAnswered, onSkip }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const auth = useAuthStyles();
  const api = useApi();
  const showToast = useToast();
  const [busy, setBusy] = useState('');
  async function answer(invite, accept) {
    setBusy(invite.id);
    const { error } = await api.http('POST', `/organizations/invites/${invite.id}`, { accept });
    setBusy('');
    if (error) { showToast(orgErrorText(t, error), 'error'); return; }
    onAnswered();
  }
  return (
    <AuthShell>
      <ScrollView contentContainerStyle={[auth.content, { justifyContent: 'flex-start' }]}>
        <Text style={auth.title}>{t('org.invite.title')}</Text>
        <Text style={[auth.subtitle, { marginBottom: 16 }]}>{t('org.invite.message')}</Text>
        {invites.map((i) => (
          <View key={i.id} style={[styles.invite, { borderColor: colors.border }]}>
            <View style={[styles.mark, { backgroundColor: colors.leaf }]}><Icon name={ORG_TYPE_ICONS[i.organization.type] || 'building'} size={16} color="#FFFFFF" /></View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '800', color: colors.text }}>{i.organization.name}</Text>
              <Text style={{ fontSize: 12, color: colors.textLight }}>{t(`org.roles.${i.role}`)}</Text>
            </View>
            <View style={{ gap: 6 }}>
              <Button title={t('org.invite.accept')} size="sm" onPress={() => answer(i, true)} disabled={busy === i.id} />
              <Button title={t('org.invite.decline')} size="sm" variant="secondary" onPress={() => answer(i, false)} disabled={busy === i.id} />
            </View>
          </View>
        ))}
        <Pressable onPress={onSkip} style={{ marginTop: 16, alignSelf: 'center' }}><Text style={auth.link}>{t('org.invite.skip')}</Text></Pressable>
      </ScrollView>
    </AuthShell>
  );
}

/* The "register an organization" choice under the farmer account types. */
export function OrgRegisterCta({ onPress }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} style={[styles.cta, { borderColor: colors.leaf, backgroundColor: colors.card }]} accessibilityRole="button">
      <View style={[styles.mark, { backgroundColor: colors.leaf }]}><Icon name="people-group" size={15} color="#FFFFFF" /></View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontWeight: '800', color: colors.text, fontSize: 13.5 }}>{t('org.register.ctaTitle')}</Text>
        <Text style={{ color: colors.textLight, fontSize: 12 }}>{t('org.register.ctaText')}</Text>
      </View>
      <Icon name="chevron-right" size={12} color={colors.textLight} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  type: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  stateIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  invite: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 10 },
  mark: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  cta: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderStyle: 'dashed', borderRadius: 12, padding: 12, marginTop: 12 }
});
