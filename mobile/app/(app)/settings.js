import { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useAuth, useUser } from '@clerk/expo';
import { useSQLiteContext } from 'expo-sqlite';
import { useTranslation } from 'react-i18next';
import { useRepository } from '../../src/db/repository';
import { useApi } from '../../src/api/client';
import { useToast } from '../../src/lib/toast';
import { wipeLocalData } from '../../src/db/schema';
import Icon from '../../src/components/Icon';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useLanguage } from '../../src/i18n/LanguageProvider';
import { Button, Card, CardBody, CardHeader, FormGroup, Input, Modal, Muted, Page, PageHeader, Select } from '../../src/ui/kit';
import Constants from 'expo-constants';
import { useSignOut } from '../../src/ui/AppShell';
import { useAccount } from '../../src/account/AccountProvider';
import { accountDisplayName } from '../../../shared/account';
import MyOrganizationCard from '../../src/screens/org/MyOrganization';
import OfflineAiCard from '../../src/screens/OfflineAiCard';
import { CURRENCIES, currencyName } from '../../../shared/currency';
import * as Clipboard from 'expo-clipboard';

/* Settings, organized like the CropManager app (and client/src/pages/
   Settings.jsx) as one column: profile header card (avatar, name, email,
   photo actions), Farm Profile, Preferences, Account (with Sign out — the
   other place besides the sidebar footer), Danger Zone, and the app
   version. Profile edits save to the local database and sync like every
   other record. */
export default function SettingsScreen() {
  const { t } = useTranslation();
  const { colors, preference, setThemePreference } = useTheme();
  const { language, setLanguage, languages, rtlRestartNeeded } = useLanguage();
  const { user } = useUser();
  const { signOut } = useAuth();
  const repo = useRepository();
  const api = useApi();
  const showToast = useToast();
  const router = useRouter();
  const db = useSQLiteContext();
  const requestSignOut = useSignOut();
  const { account, setAccount } = useAccount();
  const [savingCurrency, setSavingCurrency] = useState(false);

  const [profile, setProfile] = useState(null);
  const [farmName, setFarmName] = useState('');
  const [location, setLocation] = useState('');
  const [phone, setPhone] = useState('');
  const [place, setPlace] = useState({ district: '', sector: '', cell: '' });
  const isOrgAccount = Boolean(account && account.kind === 'organization');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    const rows = await repo.list('profiles');
    const p = rows[0] || null;
    setProfile(p);
    setFarmName(p?.farm_name || '');
    setLocation(p?.location || '');
    setPhone(p?.phone || '');
    setPlace({ district: p?.district || '', sector: p?.sector || '', cell: p?.cell || '' });
  }, [repo]);
  useEffect(() => { load(); }, [load]);

  const email = user?.primaryEmailAddress?.emailAddress || '';
  const displayName = accountDisplayName(t, account, account?.role);
  const initials = (displayName[0] || 'U').toUpperCase();

  async function changeCurrency(code) {
    if (code === account?.currency) return;
    setSavingCurrency(true);
    const { data, error } = await api.setPreferences({ currency: code });
    setSavingCurrency(false);
    if (error) { showToast(t('account.currencyFailed', { message: error.message }), 'error'); return; }
    setAccount(data);
    showToast(t('account.currencySaved'), 'success');
  }

  async function saveProfile() {
    setSaving(true);
    try {
      const payload = { farm_name: farmName.trim(), location: location.trim(), phone: phone.trim(), district: place.district.trim(), sector: place.sector.trim(), cell: place.cell.trim() };
      if (profile) await repo.update('profiles', profile.id, payload);
      else await repo.insert('profiles', payload);
      await load();
      showToast(t('settings.profileSaved'), 'success');
    } catch (err) {
      showToast(t('settings.saveFailed', { message: err.message }), 'error');
    } finally {
      setSaving(false);
    }
  }

  async function changeAvatar() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { showToast(t('settings.photoPermissionNeeded'), 'error'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8, allowsEditing: true, aspect: [1, 1] });
    if (result.canceled) return;
    setUploading(true);
    try {
      const blob = await (await fetch(result.assets[0].uri)).blob();
      await user.setProfileImage({ file: blob });
      await user.reload();
      showToast(t('settings.photoUpdated'), 'success');
    } catch (err) {
      showToast(t('settings.uploadFailed', { message: err?.errors?.[0]?.message || err.message }), 'error');
    } finally {
      setUploading(false);
    }
  }

  async function removeAvatar() {
    setUploading(true);
    try {
      await user.setProfileImage({ file: null });
      await user.reload();
      showToast(t('settings.photoRemoved'), 'success');
    } catch {
      showToast(t('settings.removeFailed'), 'error');
    } finally {
      setUploading(false);
    }
  }

  async function deleteAccount() {
    if (confirmText !== 'DELETE') { showToast(t('settings.typeDeleteToConfirm'), 'error'); return; }
    setDeleting(true);
    try {
      if (profile) await repo.remove('profiles', profile.id);
      const result = await api.rpc('delete_user', {});
      if (result.error) {
        // Account was NOT actually deleted server-side (e.g. no connection) —
        // stay signed in with local data intact rather than wiping it and
        // signing the user out of an account that still fully exists.
        showToast(t('settings.partialDeleteWarning'), 'warning');
        return;
      }
      showToast(t('settings.accountDeleted'), 'success');
      await wipeLocalData(db);
      await signOut();
      router.replace('/sign-in');
    } catch {
      showToast(t('settings.partialDeleteWarning'), 'warning');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Page>
      <View style={{ width: '100%', maxWidth: 720, gap: 20 }}>
      <PageHeader title={t('settings.title')} subtitle={t('settings.subtitle')} />

      {/* Account: photo, name and email, then the read only account fields
          (the CropManager app's Personal Information card). */}
      <Card>
        <CardHeader title={t('settings.account')} icon="user" />
        <CardBody>
          <View style={styles.headerCard}>
            <Pressable onPress={changeAvatar} disabled={uploading} accessibilityRole="button" accessibilityLabel={t('settings.changePhoto')} style={[styles.avatar, { backgroundColor: colors.primaryLight, opacity: uploading ? 0.6 : 1 }]}>
              {user?.imageUrl ? <Image source={{ uri: user.imageUrl }} style={styles.avatarImg} /> : <Text style={[styles.initials, { color: colors.primary }]}>{initials}</Text>}
              <View style={[styles.avatarEdit, { backgroundColor: colors.leaf, borderColor: colors.card }]}><Icon name="camera" size={10} color="#fff" /></View>
            </Pressable>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>{displayName}</Text>
              <Text style={{ fontSize: 13, color: colors.textLight }} numberOfLines={1}>{email}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                <Button size="sm" variant="secondary" icon="upload" title={uploading ? t('settings.workingEllipsis') : t('settings.changePhoto')} onPress={changeAvatar} disabled={uploading} />
                {user?.imageUrl ? <Button size="sm" variant="secondary" icon="trash" title={t('settings.remove')} onPress={removeAvatar} disabled={uploading} /> : null}
              </View>
            </View>
          </View>
          <FormGroup label={t('settings.email')}><Input value={email} editable={false} style={styles.readonly} /></FormGroup>
          <FormGroup label={t('settings.userId')}>
            <Pressable
              onPress={() => account && account.livestockId && Clipboard.setStringAsync(account.livestockId).then(() => showToast(t('settings.idCopied'), 'success')).catch(() => {})}
              accessibilityRole="button"
              accessibilityLabel={t('settings.copyId')}
              style={[styles.idField, { borderColor: colors.border, backgroundColor: colors.bg }]}
            >
              <Text style={[styles.idValue, { color: colors.text }]} numberOfLines={1}>{(account && account.livestockId) || '—'}</Text>
              <Icon name="copy" size={14} color={colors.primary} />
            </Pressable>
          </FormGroup>
          <FormGroup label={t('account.accountType')}><Input value={displayName} editable={false} style={styles.readonly} /></FormGroup>
          <FormGroup label={t('account.currency')} style={{ marginBottom: 6 }}>
            <Select value={account?.currency || 'USD'} onChange={changeCurrency} placeholder={t('account.currency')}
              options={CURRENCIES.map((c) => ({ value: c.code, label: `${c.code} (${currencyName(c.code, language)})` }))} />
          </FormGroup>
          <Muted>{savingCurrency ? t('settings.saving') : t('account.currencyHelp')}</Muted>
        </CardBody>
      </Card>

        {!isOrgAccount ? <Card>
          <CardHeader title={t('settings.farmProfile')} icon="tractor" />
          <CardBody>
            <FormGroup label={t('settings.farmName')}><Input placeholder={t('settings.farmNamePlaceholder')} value={farmName} onChangeText={setFarmName} /></FormGroup>
            <FormGroup label={t('settings.location')}><Input placeholder={t('settings.locationPlaceholder')} value={location} onChangeText={setLocation} /></FormGroup>
            <FormGroup label={t('settings.phoneNumber')}><Input placeholder={t('settings.phonePlaceholder')} value={phone} onChangeText={setPhone} keyboardType="phone-pad" /></FormGroup>
            <FormGroup label={t('org.fields.district')}><Input value={place.district} onChangeText={(v) => setPlace((p) => ({ ...p, district: v }))} /></FormGroup>
            <FormGroup label={t('org.fields.sector')}><Input value={place.sector} onChangeText={(v) => setPlace((p) => ({ ...p, sector: v }))} /></FormGroup>
            <FormGroup label={t('org.fields.cell')}><Input value={place.cell} onChangeText={(v) => setPlace((p) => ({ ...p, cell: v }))} /></FormGroup>
            <Button icon="check" title={saving ? t('settings.saving') : t('settings.saveProfile')} onPress={saveProfile} loading={saving} style={{ alignSelf: 'flex-start' }} />
          </CardBody>
        </Card> : null}
        {!isOrgAccount ? <MyOrganizationCard /> : null}
        {!isOrgAccount ? <OfflineAiCard /> : null}

        <Card>
          <CardHeader title={t('settings.language')} icon="globe" />
          <CardBody>
            <FormGroup label={t('settings.language')} style={{ marginBottom: 6 }}>
              <Select value={language} onChange={setLanguage} placeholder={t('settings.language')} options={languages.map((l) => ({ value: l.code, label: l.nativeLabel }))} />
            </FormGroup>
            <Muted>{rtlRestartNeeded ? t('settings.rtlRestartNotice') : t('settings.languageHelp')}</Muted>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t('settings.appearance')} icon="palette" />
          <CardBody>
            <Select value={preference} onChange={setThemePreference} placeholder={t('settings.appearance')}
              options={[{ value: 'system', label: t('settings.themeSystem') }, { value: 'light', label: t('settings.themeLight') }, { value: 'dark', label: t('settings.themeDark') }]} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t('settings.accountSecurity')} icon="shield-halved" />
          <CardBody>
            <Muted>{t('settings.passwordNote')}</Muted>
            <Muted style={{ marginTop: 10, marginBottom: 14 }}>{t('settings.signedInAs', { email })}</Muted>
            <Button variant="danger" icon="right-from-bracket" title={t('nav.signOut')} onPress={requestSignOut} style={{ alignSelf: 'flex-start' }} />
          </CardBody>
        </Card>

      <Card danger>
        <CardHeader title={t('settings.dangerZone')} icon="triangle-exclamation" iconColor={colors.red} titleColor={colors.red} />
        <CardBody>
          <Muted style={{ marginBottom: 16 }}>{t('settings.dangerZoneWarning')}</Muted>
          <Button variant="danger" icon="user-xmark" title={t('settings.deleteAccount')} onPress={() => setDeleteOpen(true)} style={{ alignSelf: 'flex-start' }} />
        </CardBody>
      </Card>

      <Text style={{ fontSize: 11, color: colors.textLight, textAlign: 'center' }}>{t('settings.appVersion', { version: Constants.expoConfig?.version || '1.0.0' })}</Text>
      </View>

      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title={t('settings.deleteAccount')}
        maxWidth={420}
        footer={<>
          <Button variant="secondary" title={t('common.cancel')} onPress={() => setDeleteOpen(false)} />
          <Button variant="danger" icon="trash" title={t('settings.deleteForever')} onPress={deleteAccount} loading={deleting} />
        </>}
      >
        <Muted>{t('settings.deleteAccountConfirmText')}</Muted>
        <Input style={{ marginTop: 16 }} placeholder={t('settings.typeDeleteHere')} value={confirmText} onChangeText={setConfirmText} autoCapitalize="characters" />
      </Modal>
    </Page>
  );
}

const styles = StyleSheet.create({
  headerCard: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 20 },
  readonly: { opacity: 0.85 },
  idField: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14 },
  idValue: { fontSize: 15, fontWeight: '700', letterSpacing: 0.5, flexShrink: 1 },
  avatar: { width: 72, height: 72, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  avatarImg: { width: 72, height: 72, borderRadius: 12 },
  initials: { fontSize: 20, fontWeight: '700' },
  avatarEdit: { position: 'absolute', bottom: -2, right: -2, width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 18, fontWeight: '700', marginBottom: 2 },
});
