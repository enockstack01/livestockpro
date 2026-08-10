import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useClerk, useUser } from '@clerk/clerk-react';
import { useApi } from '../lib/api.js';
import { useToast } from '../lib/toast.jsx';
import Modal from '../components/Modal.jsx';

export default function Settings() {
  const { user } = useUser();
  const { signOut, openUserProfile } = useClerk();
  const api = useApi();
  const showToast = useToast();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const [profile, setProfile] = useState(null);
  const [farmName, setFarmName] = useState('');
  const [location, setLocation] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  const email = user?.primaryEmailAddress?.emailAddress || '';
  const initials = email.substring(0, 2).toUpperCase() || 'U';
  const imageUrl = user?.imageUrl;
  const displayName = farmName || email.split('@')[0] || 'User';

  useEffect(() => {
    (async () => {
      const { data } = await api.list('profiles');
      const p = (data && data[0]) || null;
      setProfile(p);
      setFarmName(p?.farm_name || '');
      setLocation(p?.location || '');
      setPhone(p?.phone || '');
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleAvatarChange(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowed.includes(file.type)) { showToast('Only JPG, PNG, WebP, or GIF images are allowed.', 'error'); return; }
    if (file.size > 2 * 1024 * 1024) { showToast('Image must be under 2MB.', 'error'); return; }

    setUploading(true);
    try {
      await user.setProfileImage({ file });
      await user.reload();
      showToast('Profile photo updated!', 'success');
    } catch (err) {
      showToast('Upload failed: ' + (err?.errors?.[0]?.message || err.message), 'error');
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

  async function saveProfile() {
    setSaving(true);
    const payload = { farm_name: farmName.trim(), location: location.trim(), phone: phone.trim() };
    let result;
    if (profile) result = await api.update('profiles', profile.id, payload);
    else result = await api.insert('profiles', [payload]);
    setSaving(false);
    if (result.error) { showToast('Save failed: ' + result.error.message, 'error'); return; }
    if (!profile && result.data) setProfile(result.data[0]);
    showToast('Profile saved successfully.', 'success');
  }

  async function deleteAccount() {
    if (deleteConfirmText !== 'DELETE') { showToast('Type DELETE to confirm.', 'error'); return; }
    setDeleting(true);
    try {
      if (profile) await api.remove('profiles', profile.id);
      const result = await api.rpc('delete_user', {});
      if (result.error) showToast('Could not fully delete account; signing out.', 'warning');
      else showToast('Account deleted.', 'success');
      await signOut();
      navigate('/');
    } catch (err) {
      await signOut();
      navigate('/');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <div className="page-header">
        <div><h1>Settings</h1><p>Manage your profile and preferences</p></div>
      </div>

      <div className="card settings-header-card">
        <div className={`settings-avatar${uploading ? ' uploading' : ''}`} onClick={() => !uploading && fileInputRef.current?.click()} title="Change photo">
          {imageUrl ? <img src={imageUrl} alt="Profile" /> : <span className="initials">{initials}</span>}
          <div className="settings-avatar-edit"><i className="fas fa-camera"></i></div>
        </div>
        <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" style={{ display: 'none' }} onChange={handleAvatarChange} />

        <div className="settings-header-info">
          <h3>{displayName}</h3>
          <p>{email}</p>
        </div>

        <div className="settings-header-actions">
          <button className="btn btn-secondary btn-sm" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
            <i className="fas fa-upload"></i> {uploading ? 'Working...' : 'Change Photo'}
          </button>
          {imageUrl && (
            <button className="btn btn-secondary btn-sm" disabled={uploading} onClick={removeAvatar}>
              <i className="fas fa-trash"></i> Remove
            </button>
          )}
        </div>
      </div>

      <div className="settings-grid">
        <div className="card">
          <div className="card-header"><h3><i className="fas fa-tractor" style={{ color: 'var(--primary)', marginRight: 6 }}></i> Farm Profile</h3></div>
          <div className="card-body">
            <div className="form-group"><label>Farm Name</label><input type="text" className="form-control" placeholder="Your farm name" value={farmName} onChange={(e) => setFarmName(e.target.value)} /></div>
            <div className="form-group"><label>Location</label><input type="text" className="form-control" placeholder="City, State, Country" value={location} onChange={(e) => setLocation(e.target.value)} /></div>
            <div className="form-group"><label>Phone Number</label><input type="tel" className="form-control" placeholder="+1 234 567 890" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
            <button className="btn btn-primary" disabled={saving} onClick={saveProfile}><i className="fas fa-check"></i> {saving ? 'Saving...' : 'Save Profile'}</button>
          </div>
        </div>

        <div className="card">
          <div className="card-header"><h3><i className="fas fa-user-shield" style={{ color: 'var(--blue)', marginRight: 6 }}></i> Account & Security</h3></div>
          <div className="card-body">
            <div className="settings-readonly-row"><span className="label">Email</span><span className="value">{email}</span></div>
            <div className="settings-readonly-row"><span className="label">User ID</span><span className="value mono">{user?.id || ''}</span></div>
            <p className="text-muted" style={{ fontSize: 13, margin: '16px 0' }}>Password, email, and security settings are managed by Clerk.</p>
            <button className="btn btn-primary" onClick={() => openUserProfile()}><i className="fas fa-key"></i> Manage Account Security</button>
          </div>
        </div>
      </div>

      <div className="card mt-24" style={{ border: '1.5px solid var(--red)' }}>
        <div className="card-header"><h3 style={{ color: 'var(--red)' }}><i className="fas fa-triangle-exclamation"></i> Danger Zone</h3></div>
        <div className="card-body">
          <p className="text-muted" style={{ marginBottom: 16, fontSize: 13 }}>Once you delete your account, there is no going back. All your data will be permanently removed.</p>
          <button className="btn btn-danger" onClick={() => setDeleteModalOpen(true)}><i className="fas fa-user-xmark"></i> Delete Account</button>
        </div>
      </div>

      <Modal
        open={deleteModalOpen} onClose={() => setDeleteModalOpen(false)} title="Delete Account" maxWidth={420}
        footer={<><button className="btn btn-secondary" onClick={() => setDeleteModalOpen(false)}>Cancel</button><button className="btn btn-danger" disabled={deleting} onClick={deleteAccount}><i className="fas fa-trash"></i> Delete Forever</button></>}
      >
        <p className="text-muted">This will permanently delete your account and all associated data. Type <strong style={{ color: 'var(--red)' }}>DELETE</strong> to confirm.</p>
        <input type="text" className="form-control mt-16" placeholder='Type "DELETE" here' value={deleteConfirmText} onChange={(e) => setDeleteConfirmText(e.target.value)} />
      </Modal>
    </>
  );
}
