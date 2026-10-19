import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { SignIn, SignUp, useAuth, useUser } from '@clerk/clerk-react';
import { useTranslation } from 'react-i18next';
import { useApi } from '../lib/api.js';
import { orgErrorText, useTick } from '../lib/org.jsx';
import { formatTimeLeft, ORG_TYPE_ICONS, timeLeft } from '../../../shared/org';
import AuthBrand from '../components/AuthBrand.jsx';

/* /join/:token: a farmer opens an organization's referral link. The link is
   checked on the server when the page opens and again when the farmer
   submits. Signed out, the farmer creates an account (or signs in) and comes
   straight back here; signed in, they agree to share their farm summary and
   join. Joining through a link approves the account at once. */
const appearance = { elements: { header: { display: 'none' }, footerAction: { display: 'none' } } };

export default function Join() {
  const { token } = useParams();
  const { t } = useTranslation();
  const api = useApi();
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const [state, setState] = useState({ loading: true });
  const [mode, setMode] = useState('signup');
  const [consent, setConsent] = useState(false);
  const [detail, setDetail] = useState(false);
  const [form, setForm] = useState({ full_name: '', phone: '', district: '', sector: '', cell: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [joined, setJoined] = useState(null);

  useEffect(() => { try { sessionStorage.setItem('lp_join_token', token); } catch { /* storage unavailable */ } }, [token]);

  useEffect(() => {
    if (!isLoaded) return;
    let live = true;
    (async () => {
      const { data, error: err } = await api.http('GET', `/join/${encodeURIComponent(token)}`);
      if (!live) return;
      if (err) setState({ loading: false, error: err });
      else setState({ loading: false, data, offset: new Date(data.server_time).getTime() - Date.now() });
    })();
    return () => { live = false; };
  }, [api, token, isLoaded, isSignedIn]);

  useEffect(() => {
    if (user) setForm((f) => ({ ...f, full_name: f.full_name || user.fullName || '' }));
  }, [user]);

  const left = useMemo(() => (state.data ? timeLeft(state.data.expires_at, state.offset) : null), [state]);
  useTick(Boolean(state.data) && !joined);
  const liveLeft = state.data ? timeLeft(state.data.expires_at, state.offset) : left;

  async function submit(e) {
    e.preventDefault();
    if (!consent) { setError(t('org.join.consentRequired')); return; }
    setBusy(true);
    setError('');
    const { data, error: err } = await api.http('POST', `/join/${encodeURIComponent(token)}`, { consent: true, detail_access: detail, profile: form });
    setBusy(false);
    if (err) { setError(orgErrorText(t, err)); return; }
    try { sessionStorage.removeItem('lp_join_token'); } catch { /* storage unavailable */ }
    setJoined(data.organization);
  }

  const org = state.data && state.data.organization;
  const me = state.data && state.data.me;
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  let body;
  if (state.loading || !isLoaded) {
    body = <div className="join-loading"><i className="fas fa-spinner fa-spin"></i></div>;
  } else if (state.error) {
    body = (
      <div className="account-state">
        <div className="account-state-icon red"><i className="fas fa-link-slash"></i></div>
        <h1 className="auth-title">{t('org.join.unavailableTitle')}</h1>
        <p className="subtitle">{orgErrorText(t, state.error)}</p>
        <a className="btn btn-secondary" href="/"><i className="fas fa-house"></i> {t('org.join.goHome')}</a>
      </div>
    );
  } else if (joined) {
    body = (
      <div className="account-state">
        <div className="account-state-icon green"><i className="fas fa-circle-check"></i></div>
        <h1 className="auth-title">{t('org.join.joinedTitle', { name: joined.name })}</h1>
        <p className="subtitle">{t('org.join.joinedMessage', { name: joined.name })}</p>
        <a className="btn btn-primary" href="/dashboard"><i className="fas fa-arrow-right"></i> {t('org.join.openApp')}</a>
      </div>
    );
  } else {
    body = (
      <>
        <div className="join-org">
          {org.logo ? <img className="join-org-logo" src={org.logo} alt="" /> : <span className="join-org-mark"><i className={`fas fa-${ORG_TYPE_ICONS[org.type] || 'building'}`}></i></span>}
          <div>
            <div className="join-eyebrow">{t('org.join.invitedBy')}</div>
            <h1 className="auth-title">{org.name}</h1>
            <p className="subtitle">{[t(`org.types.${org.type}`), org.district, org.sector].filter(Boolean).join(' · ')}</p>
          </div>
        </div>
        <div className="join-share">
          <i className="fas fa-share-nodes"></i>
          <p>{t('org.join.shareExplain', { name: org.name })}</p>
        </div>
        <div className="join-expiry"><i className="fas fa-hourglass-half"></i> {t('org.join.expiresIn', { time: formatTimeLeft(t, liveLeft) })}</div>
        {/Android|iPhone|iPad/i.test(navigator.userAgent) ? <a className="btn btn-secondary btn-block" style={{ marginBottom: 14 }} href={`livestockpro://join/${token}`}><i className="fas fa-mobile-screen"></i> {t('org.join.openInApp')}</a> : null}

        {!isSignedIn ? (
          <>
            <p className="join-step">{mode === 'signup' ? t('org.join.createAccount') : t('org.join.signInFirst')}</p>
            {mode === 'signup'
              ? <SignUp routing="hash" appearance={appearance} forceRedirectUrl={`/join/${token}`} signInForceRedirectUrl={`/join/${token}`} />
              : <SignIn routing="hash" appearance={appearance} forceRedirectUrl={`/join/${token}`} signUpForceRedirectUrl={`/join/${token}`} />}
            <p className="subtitle" style={{ marginTop: 14, textAlign: 'center' }}>
              {mode === 'signup' ? t('auth.alreadyHaveAccount') : t('auth.dontHaveAccount')}
              <a href="#" onClick={(e) => { e.preventDefault(); setMode(mode === 'signup' ? 'signin' : 'signup'); }}>{mode === 'signup' ? t('auth.signIn') : t('auth.signUp')}</a>
            </p>
          </>
        ) : me && me.state !== 'can_join' ? (
          <div className="ai-notice ai-notice-error">
            <i className="fas fa-circle-info"></i>
            <span>{t(`org.join.state.${me.state}`, { name: me.organization || org.name })}</span>
          </div>
        ) : (
          <form onSubmit={submit} noValidate>
            <div className="form-group"><label>{t('account.fullName')}</label><input className="form-control" value={form.full_name} onChange={set('full_name')} /></div>
            <div className="form-row">
              <div className="form-group"><label>{t('settings.phoneNumber')}</label><input type="tel" className="form-control" value={form.phone} onChange={set('phone')} /></div>
              <div className="form-group"><label>{t('org.fields.district')}</label><input className="form-control" value={form.district} onChange={set('district')} /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>{t('org.fields.sector')}</label><input className="form-control" value={form.sector} onChange={set('sector')} /></div>
              <div className="form-group"><label>{t('org.fields.cell')}</label><input className="form-control" value={form.cell} onChange={set('cell')} /></div>
            </div>
            <label className="join-check">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              <span>{t('org.join.consentLabel', { name: org.name })}</span>
            </label>
            <label className="join-check">
              <input type="checkbox" checked={detail} onChange={(e) => setDetail(e.target.checked)} />
              <span>{t('org.join.detailLabel', { name: org.name })}</span>
            </label>
            <p className="join-law">{t('org.join.privacy')}</p>
            {error ? <div className="ai-notice ai-notice-error"><i className="fas fa-triangle-exclamation"></i><span>{error}</span></div> : null}
            <button type="submit" className="btn btn-primary btn-block" disabled={busy || !consent}>
              <i className={`fas ${busy ? 'fa-spinner fa-spin' : 'fa-handshake'}`}></i> {t('org.join.joinButton', { name: org.name })}
            </button>
          </form>
        )}
      </>
    );
  }

  return (
    <div className="auth-page">
      <AuthBrand />
      <div className="auth-form-section">
        <div className="auth-form-wrapper join-wrapper">{body}</div>
      </div>
    </div>
  );
}
