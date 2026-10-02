import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useClerk, useUser } from '@clerk/clerk-react';
import { useTranslation } from 'react-i18next';
import { useApi } from '../lib/api.js';
import { useToast } from '../lib/toast.jsx';
import { setCurrency, setRates } from '../../../shared/currency';
import { ACCOUNT_TYPES, ACCOUNT_TYPE_ICONS } from '../../../shared/account';

const AccountContext = createContext(null);

/* The signed-in user's account ({ status, role, accountType, currency, ... }
   from GET /api/account) plus a setter for screens that change it (Settings'
   currency picker). Only available inside the approved app. */
export function useAccount() {
  return useContext(AccountContext);
}

/* Sits between sign-in and the app frame: a new user fills in the account
   request form, then waits on a "request sent" page until an admin approves
   them in the Admin Panel. Rejected and on-hold accounts get their own page.
   The server enforces the same rule on every data call (requireApproved). */
export default function AccountGate({ children }) {
  const api = useApi();
  const [account, setAccountState] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [checking, setChecking] = useState(false);

  const setAccount = useCallback((next) => {
    setCurrency(next && next.currency);
    setAccountState(next);
  }, []);

  const refresh = useCallback(async () => {
    setChecking(true);
    // Exchange rates for converting per-record currencies in totals; best effort.
    const [{ data, error }, ratesRes] = await Promise.all([api.myAccount(), api.rates()]);
    if (ratesRes.data) setRates(ratesRes.data.rates);
    setChecking(false);
    if (error) { setLoadError(true); return null; }
    setLoadError(false);
    setAccount(data);
    return data;
  }, [api, setAccount]);

  useEffect(() => { refresh(); }, [refresh]);

  if (!account) {
    if (loadError) return <GateLoadError onRetry={refresh} checking={checking} />;
    return <div className="account-gate-loading"><i className="fas fa-spinner fa-spin"></i></div>;
  }
  if (account.status === 'approved') {
    return <AccountContext.Provider value={{ account, setAccount, refresh }}>{children}</AccountContext.Provider>;
  }
  return <AccountStatusScreens account={account} setAccount={setAccount} refresh={refresh} checking={checking} />;
}

function GateShell({ children }) {
  const { t } = useTranslation();
  return (
    <div className="auth-page account-gate">
      <div className="auth-brand">
        <div className="auth-brand-icon"><i className="fas fa-cow"></i></div>
        <h1>{t('auth.brandName')}</h1>
        <p>{t('login.tagline')}</p>
      </div>
      <div className="auth-form-section">
        <div className="auth-form-wrapper account-gate-wrapper">
          <div className="account-gate-mark"><span className="sidebar-logo-tile"><i className="fas fa-cow"></i></span><span>Livestock<span className="accent">Pro</span></span></div>
          {children}
        </div>
      </div>
    </div>
  );
}

function useGateSignOut() {
  const { signOut } = useClerk();
  const navigate = useNavigate();
  return async () => { await signOut(); navigate('/'); };
}

function GateLoadError({ onRetry, checking }) {
  const { t } = useTranslation();
  const signOut = useGateSignOut();
  return (
    <GateShell>
      <div className="account-state">
        <div className="account-state-icon orange"><i className="fas fa-wifi"></i></div>
        <h2>{t('account.loadFailedTitle')}</h2>
        <p className="subtitle">{t('account.loadFailedMessage')}</p>
        <div className="account-state-actions">
          <button className="btn btn-primary" disabled={checking} onClick={onRetry}><i className={`fas ${checking ? 'fa-spinner fa-spin' : 'fa-rotate'}`}></i> {t('account.retry')}</button>
          <button className="btn btn-secondary" onClick={signOut}><i className="fas fa-right-from-bracket"></i> {t('nav.signOut')}</button>
        </div>
      </div>
    </GateShell>
  );
}

function AccountStatusScreens({ account, setAccount, refresh, checking }) {
  const { t } = useTranslation();
  const showToast = useToast();
  const signOut = useGateSignOut();
  const [editing, setEditing] = useState(false);

  if (account.status === 'none' || editing) {
    return (
      <GateShell>
        <AccountRequestForm account={account} onSubmitted={(next) => { setEditing(false); setAccount(next); }} onSignOut={signOut} />
      </GateShell>
    );
  }

  async function checkStatus() {
    const next = await refresh();
    if (next && next.status === account.status) showToast(t('account.stillUnchanged'), 'info');
  }

  const STATES = {
    pending: { icon: 'fa-paper-plane', color: 'green', title: t('account.pendingTitle'), message: t('account.pendingMessage') },
    rejected: { icon: 'fa-circle-xmark', color: 'red', title: t('account.rejectedTitle'), message: t('account.rejectedMessage') },
    on_hold: { icon: 'fa-circle-pause', color: 'orange', title: t('account.onHoldTitle'), message: t('account.onHoldMessage') }
  };
  const state = STATES[account.status] || STATES.pending;
  const r = account.request || {};

  return (
    <GateShell>
      <div className="account-state">
        <div className={`account-state-icon ${state.color}`}><i className={`fas ${state.icon}`}></i></div>
        <h2>{state.title}</h2>
        <p className="subtitle">{state.message}</p>

        {account.reviewNote && account.status !== 'pending' && (
          <div className="account-note"><strong>{t('account.adminNote')}</strong><p>{account.reviewNote}</p></div>
        )}

        {account.status === 'pending' && (
          <div className="account-summary">
            <div className="account-summary-head">
              <span>{t('account.yourRequest')}</span>
              {account.submittedAt && <span className="text-muted">{t('account.submittedOn', { date: new Date(account.submittedAt).toLocaleDateString() })}</span>}
            </div>
            <div className="settings-readonly-row"><span className="label">{t('account.accountType')}</span><span className="value">{t(`account.types.${account.accountType || 'farmer'}`)}</span></div>
            {r.full_name && <div className="settings-readonly-row"><span className="label">{t('account.fullName')}</span><span className="value">{r.full_name}</span></div>}
            {r.farm_name && <div className="settings-readonly-row"><span className="label">{t('account.farmName')}</span><span className="value">{r.farm_name}</span></div>}
            {r.location && <div className="settings-readonly-row"><span className="label">{t('settings.location')}</span><span className="value">{r.location}</span></div>}
            {r.phone && <div className="settings-readonly-row"><span className="label">{t('settings.phoneNumber')}</span><span className="value">{r.phone}</span></div>}
          </div>
        )}

        <div className="account-state-actions">
          {account.status === 'rejected' ? (
            <button className="btn btn-primary" onClick={() => setEditing(true)}><i className="fas fa-pen-to-square"></i> {t('account.resubmit')}</button>
          ) : (
            <button className="btn btn-primary" disabled={checking} onClick={checkStatus}><i className={`fas ${checking ? 'fa-spinner fa-spin' : 'fa-rotate'}`}></i> {t('account.checkStatus')}</button>
          )}
          <button className="btn btn-secondary" onClick={signOut}><i className="fas fa-right-from-bracket"></i> {t('nav.signOut')}</button>
        </div>
      </div>
    </GateShell>
  );
}

function AccountRequestForm({ account, onSubmitted, onSignOut }) {
  const { t } = useTranslation();
  const { user } = useUser();
  const api = useApi();
  const showToast = useToast();
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
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const email = user?.primaryEmailAddress?.emailAddress || '';

  async function submit(e) {
    e.preventDefault();
    if (!accountType) { showToast(t('account.chooseType'), 'error'); return; }
    if (!form.full_name.trim() || !form.location.trim() || !form.phone.trim()) { showToast(t('account.requiredFields'), 'error'); return; }
    setSubmitting(true);
    const { data, error } = await api.requestAccount({ ...form, herd_size: String(form.herd_size), account_type: accountType });
    setSubmitting(false);
    if (error) { showToast(t('account.submitFailed', { message: error.message }), 'error'); return; }
    onSubmitted(data);
  }

  return (
    <form onSubmit={submit} noValidate>
      <h2>{t('account.requestTitle')}</h2>
      <p className="subtitle">{t('account.requestSubtitle')}</p>

      <div className="form-group">
        <label>{t('account.accountType')} *</label>
        <div className="account-type-grid">
          {ACCOUNT_TYPES.map((type) => (
            <button type="button" key={type} className={`account-type-option${accountType === type ? ' active' : ''}`} onClick={() => setAccountType(type)}>
              <i className={`fas fa-${ACCOUNT_TYPE_ICONS[type]}`}></i>
              <span>{t(`account.types.${type}`)}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="form-group"><label>{t('account.fullName')} *</label><input type="text" className="form-control" placeholder={t('account.fullNamePlaceholder')} value={form.full_name} onChange={set('full_name')} /></div>
      <div className="form-group"><label>{t('account.farmName')}</label><input type="text" className="form-control" placeholder={t('settings.farmNamePlaceholder')} value={form.farm_name} onChange={set('farm_name')} /></div>
      <div className="form-row">
        <div className="form-group"><label>{t('settings.location')} *</label><input type="text" className="form-control" placeholder={t('settings.locationPlaceholder')} value={form.location} onChange={set('location')} /></div>
        <div className="form-group"><label>{t('settings.phoneNumber')} *</label><input type="tel" className="form-control" placeholder={t('settings.phonePlaceholder')} value={form.phone} onChange={set('phone')} /></div>
      </div>
      <div className="form-row">
        <div className="form-group"><label>{t('account.herdSize')}</label><input type="number" min="0" className="form-control" placeholder="0" value={form.herd_size} onChange={set('herd_size')} /></div>
        <div className="form-group"><label>{t('account.livestockTypes')}</label><input type="text" className="form-control" placeholder={t('account.livestockTypesPlaceholder')} value={form.livestock_types} onChange={set('livestock_types')} /></div>
      </div>
      <div className="form-group"><label>{t('account.notes')}</label><textarea className="form-control" rows={3} placeholder={t('account.notesPlaceholder')} value={form.notes} onChange={set('notes')}></textarea></div>

      <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
        <i className={`fas ${submitting ? 'fa-spinner fa-spin' : 'fa-paper-plane'}`}></i> {submitting ? t('account.submitting') : t('account.submit')}
      </button>
      <p className="subtitle account-gate-foot">
        {t('settings.signedInAs', { email })} · <a href="#" onClick={(e) => { e.preventDefault(); onSignOut(); }}>{t('nav.signOut')}</a>
      </p>
    </form>
  );
}
