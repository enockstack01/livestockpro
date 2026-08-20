import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAuth, useUser } from '@clerk/expo';
import { useSQLiteContext } from 'expo-sqlite';
import { useRepository } from '../../src/db/repository';
import { useApi } from '../../src/api/client';
import { useToast } from '../../src/lib/toast';
import { wipeLocalData } from '../../src/db/schema';
import Modal from '../../src/components/Modal';

export default function SettingsScreen() {
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
      showToast('Profile saved.', 'success');
    } catch (err) {
      showToast(`Save failed: ${err.message}`, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function changeAvatar() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      showToast('Photo library access is needed to change your picture.', 'error');
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
      showToast('Profile photo updated.', 'success');
    } catch (err) {
      showToast('Upload failed.', 'error');
    } finally {
      setUploading(false);
    }
  }

  async function removeAvatar() {
    setUploading(true);
    try {
      await user.setProfileImage({ file: null });
      await user.reload();
      showToast('Profile photo removed.', 'success');
    } catch (err) {
      showToast('Failed to remove photo.', 'error');
    } finally {
      setUploading(false);
    }
  }

  async function deleteAccount() {
    if (confirmText !== 'DELETE') {
      showToast('Type DELETE to confirm.', 'error');
      return;
    }
    setDeleting(true);
    try {
      if (profile) await repo.remove('profiles', profile.id);
      const result = await api.rpc('delete_user', {});
      if (result.error) showToast('Could not fully delete account; signing out.', 'warning');
      else showToast('Account deleted.', 'success');
    } catch (err) {
      /* fall through to sign-out regardless */
    } finally {
      await wipeLocalData(db);
      await signOut();
      setDeleting(false);
      router.replace('/sign-in');
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, gap: 16 }}>
      <View style={styles.headerCard}>
        <Pressable onPress={changeAvatar} disabled={uploading}>
          {user?.imageUrl ? (
            <Image source={{ uri: user.imageUrl }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder]}><Text style={styles.avatarInitials}>{initials}</Text></View>
          )}
          <View style={styles.avatarEdit}><Ionicons name="camera" size={14} color="#fff" /></View>
        </Pressable>
        <Text style={styles.headerName}>{displayName}</Text>
        <Text style={styles.headerEmail}>{email}</Text>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
          <Pressable style={styles.smallBtn} onPress={changeAvatar} disabled={uploading}>
            {uploading ? <ActivityIndicator size="small" color="#37474F" /> : <Text style={styles.smallBtnText}>Change Photo</Text>}
          </Pressable>
          {user?.imageUrl ? (
            <Pressable style={styles.smallBtn} onPress={removeAvatar} disabled={uploading}>
              <Text style={styles.smallBtnText}>Remove</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Farm Profile</Text>
        <Field label="Farm Name" value={farmName} onChangeText={setFarmName} placeholder="Your farm name" />
        <Field label="Location" value={location} onChangeText={setLocation} placeholder="City, District, Country" />
        <Field label="Phone Number" value={phone} onChangeText={setPhone} placeholder="+250 700 000 000" keyboardType="phone-pad" />
        <Pressable style={styles.saveBtn} onPress={saveProfile} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Save Profile</Text>}
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Account</Text>
        <Row label="Email" value={email} />
        <Row label="User ID" value={user?.id || ''} mono />
        <Text style={styles.hint}>Password and security settings can be managed from the LivestockPro web app.</Text>
      </View>

      <View style={[styles.card, styles.dangerCard]}>
        <Text style={[styles.cardTitle, { color: '#D32F2F' }]}>Danger Zone</Text>
        <Text style={styles.hint}>Deleting your account permanently removes all your data. This cannot be undone.</Text>
        <Pressable style={styles.deleteBtn} onPress={() => setDeleteOpen(true)}>
          <Text style={styles.deleteBtnText}>Delete Account</Text>
        </Pressable>
      </View>

      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete Account"
        footer={
          <>
            <Pressable style={styles.smallBtn} onPress={() => setDeleteOpen(false)}><Text style={styles.smallBtnText}>Cancel</Text></Pressable>
            <Pressable style={styles.deleteBtn} onPress={deleteAccount} disabled={deleting}>
              {deleting ? <ActivityIndicator color="#fff" /> : <Text style={styles.deleteBtnText}>Delete Forever</Text>}
            </Pressable>
          </>
        }
      >
        <Text style={styles.hint}>This permanently deletes your account and all associated data. Type DELETE to confirm.</Text>
        <TextInput style={styles.confirmInput} value={confirmText} onChangeText={setConfirmText} placeholder='Type "DELETE" here' autoCapitalize="characters" />
      </Modal>
    </ScrollView>
  );
}

function Field({ label, ...props }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput style={styles.input} placeholderTextColor="#90A4AE" {...props} />
    </View>
  );
}

function Row({ label, value, mono }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, mono && { fontFamily: 'monospace' }]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7F5' },
  headerCard: { backgroundColor: '#fff', borderRadius: 14, padding: 20, alignItems: 'center', borderWidth: 1, borderColor: '#ECEFF1' },
  avatar: { width: 72, height: 72, borderRadius: 36 },
  avatarPlaceholder: { backgroundColor: '#E8F5E9', alignItems: 'center', justifyContent: 'center' },
  avatarInitials: { fontSize: 24, fontWeight: '800', color: '#2E7D32' },
  avatarEdit: { position: 'absolute', right: -2, bottom: -2, backgroundColor: '#2E7D32', borderRadius: 10, padding: 5, borderWidth: 2, borderColor: '#fff' },
  headerName: { fontSize: 17, fontWeight: '700', color: '#1B5E20', marginTop: 12 },
  headerEmail: { fontSize: 13, color: '#607D8B', marginTop: 2 },
  smallBtn: { backgroundColor: '#ECEFF1', paddingVertical: 9, paddingHorizontal: 14, borderRadius: 8 },
  smallBtnText: { color: '#37474F', fontWeight: '700', fontSize: 13 },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#ECEFF1' },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#1B5E20', marginBottom: 12 },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: '#607D8B', marginBottom: 6 },
  input: { borderWidth: 1, borderColor: '#CFD8DC', borderRadius: 10, paddingVertical: 11, paddingHorizontal: 12, fontSize: 14, color: '#263238' },
  saveBtn: { backgroundColor: '#2E7D32', paddingVertical: 13, borderRadius: 10, alignItems: 'center', marginTop: 4 },
  saveBtnText: { color: '#fff', fontWeight: '700' },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F5F7F5' },
  rowLabel: { color: '#607D8B', fontSize: 13 },
  rowValue: { color: '#263238', fontSize: 13, flexShrink: 1, marginLeft: 12 },
  hint: { color: '#90A4AE', fontSize: 12, marginTop: 8 },
  dangerCard: { borderColor: '#FFCDD2' },
  deleteBtn: { backgroundColor: '#D32F2F', paddingVertical: 12, borderRadius: 10, alignItems: 'center', marginTop: 12, paddingHorizontal: 16 },
  deleteBtnText: { color: '#fff', fontWeight: '700' },
  confirmInput: { borderWidth: 1, borderColor: '#CFD8DC', borderRadius: 10, paddingVertical: 11, paddingHorizontal: 12, marginTop: 12, fontSize: 14 },
});
