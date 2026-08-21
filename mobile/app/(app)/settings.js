import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useAuth, useUser } from '@clerk/expo';
import { useSQLiteContext } from 'expo-sqlite';
import { useTranslation } from 'react-i18next';
import { useRepository } from '../../src/db/repository';
import { useApi } from '../../src/api/client';
import { useToast } from '../../src/lib/toast';
import { wipeLocalData } from '../../src/db/schema';
import Modal from '../../src/components/Modal';
import Icon from '../../src/components/Icon';
import SelectField from '../../src/components/SelectField';
import ResponsiveScreen from '../../src/components/ResponsiveScreen';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useLanguage } from '../../src/i18n/LanguageProvider';

export default function SettingsScreen() {
  const { t } = useTranslation();
  const { colors, radius, shadow, preference, setThemePreference } = useTheme();
  const styles = useMemo(() => makeStyles(colors, radius, shadow), [colors, radius, shadow]);
  const { language, setLanguage, languages, rtlRestartNeeded } = useLanguage();

  const { user } = useUser();
  const { signOut } = useAuth();
  const repo = useRepository();
  const api = useApi();
  const showToast = useToast();
  const router = useRouter();
  const db = useSQLiteContext();

  const [profile, setProfile] = useState(null);
  const [farmName, setFarmName] = useState('');
  const [location, setLocation] = useState('');
  const [phone, setPhone] = useState('');
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
  }, [repo]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const email = user?.primaryEmailAddress?.emailAddress || '';
  const displayName = farmName || email.split('@')[0] || 'User';
  const initials = (email.slice(0, 2) || 'U').toUpperCase();

  async function saveProfile() {
    setSaving(true);
    try {
      const payload = { farm_name: farmName.trim(), location: location.trim(), phone: phone.trim() };
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
    if (!permission.granted) {
      showToast(t('settings.photoPermissionNeeded'), 'error');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8, allowsEditing: true, aspect: [1, 1] });
    if (result.canceled) return;

    setUploading(true);
    try {
      const asset = result.assets[0];
      const response = await fetch(asset.uri);
      const blob = await response.blob();
      await user.setProfileImage({ file: blob });
      await user.reload();
      showToast(t('settings.photoUpdated'), 'success');
    } catch (err) {
      showToast(t('settings.uploadFailed'), 'error');
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
    } catch (err) {
      showToast(t('settings.removeFailed'), 'error');
    } finally {
      setUploading(false);
    }
  }

  async function deleteAccount() {
    if (confirmText !== 'DELETE') {
      showToast(t('settings.typeDeleteToConfirm'), 'error');
      return;
    }
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
    } catch (err) {
      showToast(t('settings.partialDeleteWarning'), 'warning');
    } finally {
      setDeleting(false);
    }
  }

  const themeOptions = [
    { value: 'light', label: t('settings.themeLight') },
    { value: 'dark', label: t('settings.themeDark') },
    { value: 'system', label: t('settings.themeSystem') },
  ];
  const languageOptions = languages.map((l) => ({ value: l.code, label: l.nativeLabel }));

  return (
    <ResponsiveScreen>
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, gap: 16 }}>
      <View style={styles.headerCard}>
        <Pressable onPress={changeAvatar} disabled={uploading}>
          {user?.imageUrl ? (
            <Image source={{ uri: user.imageUrl }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder]}><Text style={styles.avatarInitials}>{initials}</Text></View>
          )}
          <View style={styles.avatarEdit}><Icon name="camera" size={12} color={colors.white} /></View>
        </Pressable>
        <Text style={styles.headerName}>{displayName}</Text>
        <Text style={styles.headerEmail}>{email}</Text>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
          <Pressable style={styles.smallBtn} onPress={changeAvatar} disabled={uploading}>
            {uploading ? <ActivityIndicator size="small" color={colors.text} /> : <Text style={styles.smallBtnText}>{t('settings.changePhoto')}</Text>}
          </Pressable>
          {user?.imageUrl ? (
            <Pressable style={styles.smallBtn} onPress={removeAvatar} disabled={uploading}>
              <Text style={styles.smallBtnText}>{t('settings.remove')}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t('settings.appearance')}</Text>
        <SelectField value={preference} options={themeOptions} onChange={setThemePreference} />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t('settings.language')}</Text>
        <SelectField value={language} options={languageOptions} onChange={setLanguage} />
        {rtlRestartNeeded ? <Text style={styles.hint}>{t('settings.rtlRestartNotice')}</Text> : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t('settings.farmProfile')}</Text>
        <Field styles={styles} colors={colors} label={t('settings.farmName')} value={farmName} onChangeText={setFarmName} placeholder={t('settings.farmNamePlaceholder')} />
        <Field styles={styles} colors={colors} label={t('settings.location')} value={location} onChangeText={setLocation} placeholder={t('settings.locationPlaceholder')} />
        <Field styles={styles} colors={colors} label={t('settings.phoneNumber')} value={phone} onChangeText={setPhone} placeholder={t('settings.phonePlaceholder')} keyboardType="phone-pad" />
        <Pressable style={styles.saveBtn} onPress={saveProfile} disabled={saving}>
          {saving ? <ActivityIndicator color={colors.white} /> : <Text style={styles.saveBtnText}>{t('settings.saveProfile')}</Text>}
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t('settings.account')}</Text>
        <Row styles={styles} label={t('settings.email')} value={email} />
        <Row styles={styles} label={t('settings.userId')} value={user?.id || ''} mono />
        <Text style={styles.hint}>{t('settings.passwordNote')}</Text>
      </View>

      <View style={[styles.card, styles.dangerCard]}>
        <Text style={[styles.cardTitle, { color: colors.red }]}>{t('settings.dangerZone')}</Text>
        <Text style={styles.hint}>{t('settings.deleteWarning')}</Text>
        <Pressable style={styles.deleteBtn} onPress={() => setDeleteOpen(true)}>
          <Text style={styles.deleteBtnText}>{t('settings.deleteAccount')}</Text>
        </Pressable>
      </View>

      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title={t('settings.deleteAccount')}
        footer={
          <>
            <Pressable style={styles.smallBtn} onPress={() => setDeleteOpen(false)}><Text style={styles.smallBtnText}>{t('common.cancel')}</Text></Pressable>
            <Pressable style={styles.deleteBtn} onPress={deleteAccount} disabled={deleting}>
              {deleting ? <ActivityIndicator color={colors.white} /> : <Text style={styles.deleteBtnText}>{t('settings.deleteForever')}</Text>}
            </Pressable>
          </>
        }
      >
        <Text style={styles.hint}>{t('settings.deleteConfirmMessage')}</Text>
        <TextInput style={styles.confirmInput} value={confirmText} onChangeText={setConfirmText} placeholder={t('settings.typeDeleteHere')} autoCapitalize="characters" />
      </Modal>
    </ScrollView>
    </ResponsiveScreen>
  );
}

function Field({ styles, colors, label, ...props }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput style={styles.input} placeholderTextColor={colors.placeholder} {...props} />
    </View>
  );
}

function Row({ styles, label, value, mono }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, mono && { fontFamily: 'monospace' }]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function makeStyles(colors, radius, shadow) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    headerCard: {
      backgroundColor: colors.card, borderRadius: radius.card, padding: 20, alignItems: 'center',
      shadowColor: shadow.color, shadowOpacity: shadow.opacity, shadowRadius: shadow.radius, shadowOffset: shadow.offset, elevation: shadow.elevation,
    },
    avatar: { width: 72, height: 72, borderRadius: 36 },
    avatarPlaceholder: { backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
    avatarInitials: { fontSize: 24, fontWeight: '800', color: colors.primary },
    avatarEdit: { position: 'absolute', right: -2, bottom: -2, backgroundColor: colors.primary, borderRadius: 10, padding: 5, borderWidth: 2, borderColor: colors.card },
    headerName: { fontSize: 17, fontWeight: '700', color: colors.primaryDark, marginTop: 12 },
    headerEmail: { fontSize: 13, color: colors.textLight, marginTop: 2 },
    smallBtn: { backgroundColor: colors.bg, borderWidth: 1.5, borderColor: colors.border, paddingVertical: 9, paddingHorizontal: 14, borderRadius: radius.button },
    smallBtnText: { color: colors.text, fontWeight: '700', fontSize: 13 },
    card: {
      backgroundColor: colors.card, borderRadius: radius.card, padding: 16,
      shadowColor: shadow.color, shadowOpacity: shadow.opacity, shadowRadius: shadow.radius, shadowOffset: shadow.offset, elevation: shadow.elevation,
    },
    cardTitle: { fontSize: 15, fontWeight: '700', color: colors.primaryDark, marginBottom: 12 },
    fieldLabel: { fontSize: 12, fontWeight: '600', color: colors.textLight, marginBottom: 6 },
    input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.card, paddingVertical: 11, paddingHorizontal: 12, fontSize: 14, color: colors.text },
    saveBtn: { backgroundColor: colors.primary, paddingVertical: 13, borderRadius: radius.button, alignItems: 'center', marginTop: 4 },
    saveBtnText: { color: colors.white, fontWeight: '700' },
    row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.bg },
    rowLabel: { color: colors.textLight, fontSize: 13 },
    rowValue: { color: colors.text, fontSize: 13, flexShrink: 1, marginLeft: 12 },
    hint: { color: colors.textLight, fontSize: 12, marginTop: 8 },
    dangerCard: { borderWidth: 1, borderColor: colors.red },
    deleteBtn: { backgroundColor: colors.red, paddingVertical: 12, borderRadius: radius.button, alignItems: 'center', marginTop: 12, paddingHorizontal: 16 },
    deleteBtnText: { color: colors.white, fontWeight: '700' },
    confirmInput: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.card, paddingVertical: 11, paddingHorizontal: 12, marginTop: 12, fontSize: 14 },
  });
}
