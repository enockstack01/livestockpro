import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useClerk, useUser } from '@clerk/clerk-react';
import { useTranslation } from 'react-i18next';
import { useApi } from '../lib/api.js';
import { useToast } from '../lib/toast.jsx';
import { useLanguage } from '../i18n/LanguageProvider.jsx';
import { useTheme } from '../theme/ThemeProvider.jsx';
import Modal from '../components/Modal.jsx';

export default function Settings() {
  const { t } = useTranslation();
  const { user } = useUser();
  const { signOut, openUserProfile } = useClerk();
  const api = useApi();
  const showToast = useToast();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const { language, setLanguage, languages } = useLanguage();
  const { preference, setThemePreference } = useTheme();

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
    if (!allowed.includes(file.type)) { showToast(t('settings.onlyImageTypes'), 'error'); return; }
    if (file.size > 2 * 1024 * 1024) { showToast(t('settings.imageSizeLimit'), 'error'); return; }

    setUploading(true);
    try {
      await user.setProfileImage({ file });
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
    } catch (err) {
      showToast(t('settings.removeFailed'), 'error');
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
    if (result.error) { showToast(t('settings.saveFailed', { message: result.error.message }), 'error'); return; }
    if (!profile && result.data) setProfile(result.data[0]);
    showToast(t('settings.profileSaved'), 'success');
  }

  async function deleteAccount() {
    if (deleteConfirmText !== 'DELETE') { showToast(t('settings.typeDeleteToConfirm'), 'error'); return; }
    setDeleting(true);
    try {
      if (profile) await api.remove('profiles', profile.id);
      const result = await api.rpc('delete_user', {});
      if (result.error) showToast(t('settings.partialDeleteWarning'), 'warning');
      else showToast(t('settings.accountDeleted'), 'success');
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
        <div><h1>{t('settings.title')}</h1><p>{t('settings.subtitle')}</p></div>
      </div>

      <div className="card settings-header-card">
        <div className={`settings-avatar${uploading ? ' uploading' : ''}`} onClick={() => !uploading && fileInputRef.current?.click()} title={t('settings.changePhotoTooltip')}>
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
            <i className="fas fa-upload"></i> {uploading ? t('settings.workingEllipsis') : t('settings.changePhoto')}
          </button>
          {imageUrl && (
            <button className="btn btn-secondary btn-sm" disabled={uploading} onClick={removeAvatar}>
              <i className="fas fa-trash"></i> {t('settings.remove')}
            </button>
          )}
        </div>
      </div>

      <div className="settings-grid">
        <div className="card">
          <div className="card-header"><h3><i className="fas fa-tractor" style={{ color: 'var(--primary)', marginRight: 6 }}></i> {t('settings.farmProfile')}</h3></div>
          <div className="card-body">
            <div className="form-group"><label>{t('settings.farmName')}</label><input type="text" className="form-control" placeholder={t('settings.farmNamePlaceholder')} value={farmName} onChange={(e) => setFarmName(e.target.value)} /></div>
            <div className="form-group"><label>{t('settings.location')}</label><input type="text" className="form-control" placeholder={t('settings.locationPlaceholder')} value={location} onChange={(e) => setLocation(e.target.value)} /></div>
            <div className="form-group"><label>{t('settings.phoneNumber')}</label><input type="tel" className="form-control" placeholder={t('settings.phonePlaceholder')} value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
            <button className="btn btn-primary" disabled={saving} onClick={saveProfile}><i className="fas fa-check"></i> {saving ? t('settings.saving') : t('settings.saveProfile')}</button>
          </div>
        </div>

        <div className="card">
          <div className="card-header"><h3><i className="fas fa-user-shield" style={{ color: 'var(--blue)', marginRight: 6 }}></i> {t('settings.accountSecurity')}</h3></div>
          <div className="card-body">
            <div className="settings-readonly-row"><span className="label">{t('settings.email')}</span><span className="value">{email}</span></div>
            <div className="settings-readonly-row"><span className="label">{t('settings.userId')}</span><span className="value mono">{user?.id || ''}</span></div>
            <p className="text-muted" style={{ fontSize: 13, margin: '16px 0' }}>{t('settings.passwordManagedNote')}</p>
            <button className="btn btn-primary" onClick={() => openUserProfile()}><i className="fas fa-key"></i> {t('settings.manageAccountSecurity')}</button>
          </div>
        </div>

        <div className="card">
          <div className="card-header"><h3><i className="fas fa-globe" style={{ color: 'var(--primary)', marginRight: 6 }}></i> {t('settings.preferences')}</h3></div>
          <div className="card-body">
            <div className="form-group">
              <label>{t('settings.appearance')}</label>
              <select className="form-control" value={preference} onChange={(e) => setThemePreference(e.target.value)}>
                <option value="light">{t('settings.themeLight')}</option>
                <option value="dark">{t('settings.themeDark')}</option>
                <option value="system">{t('settings.themeSystem')}</option>
              </select>
            </div>
            <div className="form-group">
              <label>{t('settings.language')}</label>
              <select className="form-control" value={language} onChange={(e) => setLanguage(e.target.value)}>
                {languages.map((l) => <option key={l.code} value={l.code}>{l.nativeLabel}</option>)}
              </select>
            </div>
            <p className="text-muted" style={{ fontSize: 13 }}>{t('settings.languageHelp')}</p>
          </div>
        </div>
      </div>

      <div className="card mt-24" style={{ border: '1.5px solid var(--red)' }}>
        <div className="card-header"><h3 style={{ color: 'var(--red)' }}><i className="fas fa-triangle-exclamation"></i> {t('settings.dangerZone')}</h3></div>
        <div className="card-body">
          <p className="text-muted" style={{ marginBottom: 16, fontSize: 13 }}>{t('settings.dangerZoneWarning')}</p>
          <button className="btn btn-danger" onClick={() => setDeleteModalOpen(true)}><i className="fas fa-user-xmark"></i> {t('settings.deleteAccount')}</button>
        </div>
      </div>

      <Modal
        open={deleteModalOpen} onClose={() => setDeleteModalOpen(false)} title={t('settings.deleteAccount')} maxWidth={420}
        footer={<><button className="btn btn-secondary" onClick={() => setDeleteModalOpen(false)}>{t('common.cancel')}</button><button className="btn btn-danger" disabled={deleting} onClick={deleteAccount}><i className="fas fa-trash"></i> {t('settings.deleteForever')}</button></>}
      >
        <p className="text-muted">{t('settings.deleteAccountConfirmText')}</p>
        <input type="text" className="form-control mt-16" placeholder={t('settings.typeDeleteHere')} value={deleteConfirmText} onChange={(e) => setDeleteConfirmText(e.target.value)} />
      </Modal>
    </>
  );
}
