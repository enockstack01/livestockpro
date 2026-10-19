import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useApi } from '../../lib/api.js';
import { useToast } from '../../lib/toast.jsx';
import { orgErrorText } from '../../lib/org.jsx';
import { ORG_TYPES, ORG_TYPE_ICONS } from '../../../../shared/org';

/* Reads an image file into a small data URL (the server accepts up to about
   150 KB), scaled down to 256 px on its longest side. */
export function readLogo(file) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve(null);
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return reject(new Error('type'));
    const img = new Image();
    const reader = new FileReader();
    reader.onload = () => { img.src = reader.result; };
    reader.onerror = reject;
    img.onload = () => {
      const scale = Math.min(1, 256 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL(file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.85));
    };
    img.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* The organization fields, shared by registration, the organization profile
   page and the admin "create organization" form. */
export function OrgFields({ form, set, setForm, withLogo = true }) {
  const { t } = useTranslation();
  const showToast = useToast();
  async function pickLogo(e) {
    try {
      const logo = await readLogo(e.target.files[0]);
      if (logo && logo.length > 200000) { showToast(t('org.errors.BAD_LOGO'), 'error'); return; }
      setForm((f) => ({ ...f, logo }));
    } catch {
      showToast(t('org.errors.BAD_LOGO'), 'error');
    }
  }
  return (
    <>
      <div className="form-group"><label>{t('org.fields.name')} *</label><input className="form-control" value={form.name} onChange={set('name')} /></div>
      <div className="form-group">
        <label>{t('org.fields.type')} *</label>
        <div className="account-type-grid">
          {ORG_TYPES.map((type) => (
            <button type="button" key={type} className={`account-type-option${form.type === type ? ' active' : ''}`} onClick={() => setForm((f) => ({ ...f, type }))}>
              <i className={`fas fa-${ORG_TYPE_ICONS[type]}`}></i>
              <span>{t(`org.types.${type}`)}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="form-row">
        <div className="form-group"><label>{t('org.fields.country')}</label><input className="form-control" value={form.country} onChange={set('country')} /></div>
        <div className="form-group"><label>{t('org.fields.district')}</label><input className="form-control" value={form.district} onChange={set('district')} /></div>
      </div>
      <div className="form-row">
        <div className="form-group"><label>{t('org.fields.sector')}</label><input className="form-control" value={form.sector} onChange={set('sector')} /></div>
        <div className="form-group"><label>{t('org.fields.contactPhone')} *</label><input type="tel" className="form-control" value={form.contact_phone} onChange={set('contact_phone')} /></div>
      </div>
      <div className="form-group"><label>{t('org.fields.contactEmail')} *</label><input type="email" className="form-control" value={form.contact_email} onChange={set('contact_email')} /></div>
      <div className="form-group"><label>{t('org.fields.description')}</label><textarea className="form-control" rows={2} value={form.description} onChange={set('description')} /></div>
      {withLogo ? (
        <div className="form-group">
          <label>{t('org.fields.logo')}</label>
          <div className="org-logo-pick">
            {form.logo ? <img src={form.logo} alt="" /> : <span className="org-logo-empty"><i className="fas fa-image"></i></span>}
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={pickLogo} />
            {form.logo ? <button type="button" className="btn btn-secondary btn-sm" onClick={() => setForm((f) => ({ ...f, logo: null }))}>{t('common.delete')}</button> : null}
          </div>
        </div>
      ) : null}
    </>
  );
}

export const emptyOrgForm = (email = '') => ({ name: '', type: 'cooperative', country: 'Rwanda', district: '', sector: '', contact_email: email, contact_phone: '', description: '', logo: null });

/* "Register an organization": the signed-in user becomes its first admin;
   the organization waits for Logistack approval. */
export function OrgRegisterForm({ email, defaultName, onDone, onBack }) {
  const { t } = useTranslation();
  const api = useApi();
  const showToast = useToast();
  const [form, setForm] = useState(emptyOrgForm(email));
  const [adminName, setAdminName] = useState(defaultName || '');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    if (!form.name.trim() || !form.contact_email.trim() || !form.contact_phone.trim()) { showToast(t('account.requiredFields'), 'error'); return; }
    setBusy(true);
    const { error } = await api.http('POST', '/organizations/register', { ...form, admin_name: adminName });
    setBusy(false);
    if (error) { showToast(orgErrorText(t, error), 'error'); return; }
    onDone();
  }

  return (
    <form onSubmit={submit} noValidate>
      <h1 className="auth-title">{t('org.register.title')}</h1>
      <p className="subtitle">{t('org.register.subtitle')}</p>
      <div className="form-group"><label>{t('org.register.yourName')} *</label><input className="form-control" value={adminName} onChange={(e) => setAdminName(e.target.value)} /></div>
      <OrgFields form={form} set={set} setForm={setForm} />
      <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
        <i className={`fas ${busy ? 'fa-spinner fa-spin' : 'fa-paper-plane'}`}></i> {t('org.register.submit')}
      </button>
      <p className="subtitle account-gate-foot"><a href="#" onClick={(e) => { e.preventDefault(); onBack(); }}><i className="fas fa-arrow-left"></i> {t('org.register.backToFarmer')}</a></p>
    </form>
  );
}

/* An organization account waiting for Logistack approval. */
export function OrgPendingScreen({ account, checking, onCheck, onSignOut }) {
  const { t } = useTranslation();
  const org = account.organization || {};
  return (
    <div className="account-state">
      <div className="account-state-icon green"><i className="fas fa-building-circle-check"></i></div>
      <h1 className="auth-title">{t('org.pending.title', { name: org.name || '' })}</h1>
      <p className="subtitle">{t('org.pending.message')}</p>
      <div className="account-state-actions">
        <button className="btn btn-primary" disabled={checking} onClick={onCheck}><i className={`fas ${checking ? 'fa-spinner fa-spin' : 'fa-rotate'}`}></i> {t('account.checkStatus')}</button>
        <button className="btn btn-secondary" onClick={onSignOut}><i className="fas fa-right-from-bracket"></i> {t('nav.signOut')}</button>
      </div>
    </div>
  );
}

/* A staff invitation waiting for the signed-in user. */
export function OrgInviteScreen({ invites, onAnswered, onSkip }) {
  const { t } = useTranslation();
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
    <div className="account-state">
      <div className="account-state-icon green"><i className="fas fa-envelope-open-text"></i></div>
      <h1 className="auth-title">{t('org.invite.title')}</h1>
      <p className="subtitle">{t('org.invite.message')}</p>
      {invites.map((i) => (
        <div key={i.id} className="org-invite">
          {i.organization.logo ? <img src={i.organization.logo} alt="" /> : <span className="join-org-mark"><i className={`fas fa-${ORG_TYPE_ICONS[i.organization.type] || 'building'}`}></i></span>}
          <div className="org-invite-text"><strong>{i.organization.name}</strong><span>{t(`org.roles.${i.role}`)}</span></div>
          <button className="btn btn-primary btn-sm" disabled={busy === i.id} onClick={() => answer(i, true)}>{t('org.invite.accept')}</button>
          <button className="btn btn-secondary btn-sm" disabled={busy === i.id} onClick={() => answer(i, false)}>{t('org.invite.decline')}</button>
        </div>
      ))}
      <p className="subtitle account-gate-foot"><a href="#" onClick={(e) => { e.preventDefault(); onSkip(); }}>{t('org.invite.skip')}</a></p>
    </div>
  );
}
