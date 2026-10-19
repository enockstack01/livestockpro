import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useApi } from '../../lib/api.js';
import { useToast } from '../../lib/toast.jsx';
import { orgErrorText } from '../../lib/org.jsx';
import Modal from '../Modal.jsx';
import { ORG_TYPE_ICONS } from '../../../../shared/org';

/* The farmer's side of an organization: which organization they belong to,
   what it can see, a switch for read only access to full records, and
   leaving. A bulk import by Logistack shows here as a request to accept. */
export function useMyOrganization() {
  const api = useApi();
  const [state, setState] = useState({ loading: true, data: null });
  const apiRef = useRef(api);
  apiRef.current = api;
  const reload = useCallback(async () => {
    const { data } = await apiRef.current.http('GET', '/me/organization');
    setState({ loading: false, data: data || null });
  }, []);
  useEffect(() => { reload(); }, [reload]);
  return { ...state, reload };
}

export function ConsentRequest({ mine, onAnswered }) {
  const { t } = useTranslation();
  const api = useApi();
  const showToast = useToast();
  const [detail, setDetail] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!mine || mine.status !== 'pending_consent') return null;
  async function answer(accept) {
    setBusy(true);
    const { error } = await api.http('POST', '/me/organization/consent', { accept, detail_access: detail });
    setBusy(false);
    if (error) { showToast(orgErrorText(t, error), 'error'); return; }
    showToast(accept ? t('org.my.accepted', { name: mine.organization.name }) : t('org.my.declined'), 'success');
    onAnswered();
  }
  return (
    <Modal open onClose={() => {}} title={t('org.my.requestTitle')} maxWidth="520px"
      footer={<><button className="btn btn-secondary" disabled={busy} onClick={() => answer(false)}>{t('org.my.decline')}</button><button className="btn btn-primary" disabled={busy} onClick={() => answer(true)}><i className="fas fa-handshake"></i> {t('org.my.accept')}</button></>}>
      <div className="join-org">
        {mine.organization.logo ? <img className="join-org-logo" src={mine.organization.logo} alt="" /> : <span className="join-org-mark"><i className={`fas fa-${ORG_TYPE_ICONS[mine.organization.type] || 'building'}`}></i></span>}
        <div><strong>{mine.organization.name}</strong><p className="ai-muted">{t('org.my.requestText', { name: mine.organization.name })}</p></div>
      </div>
      <label className="join-check"><input type="checkbox" checked={detail} onChange={(e) => setDetail(e.target.checked)} /><span>{t('org.join.detailLabel', { name: mine.organization.name })}</span></label>
      <p className="join-law">{t('org.join.privacy')}</p>
    </Modal>
  );
}

export default function MyOrganizationCard() {
  const { t, i18n } = useTranslation();
  const api = useApi();
  const showToast = useToast();
  const { data: mine, reload } = useMyOrganization();
  const [leaving, setLeaving] = useState(false);
  const [joinLink, setJoinLink] = useState('');

  async function toggleDetail(on) {
    const { error } = await api.http('PATCH', '/me/organization', { detail_access: on });
    if (error) { showToast(orgErrorText(t, error), 'error'); return; }
    reload();
  }
  async function leave() {
    const { error } = await api.http('POST', '/me/organization/leave', {});
    setLeaving(false);
    if (error) { showToast(orgErrorText(t, error), 'error'); return; }
    showToast(t('org.my.left'), 'success');
    reload();
  }
  function openJoin() {
    const m = joinLink.match(/join\/([A-Za-z0-9_-]{20,})/);
    if (m) window.location.assign(`/join/${m[1]}`);
    else showToast(t('org.my.badLink'), 'error');
  }

  return (
    <div className="card">
      <div className="card-header"><h3><i className="fas fa-people-group" style={{ color: 'var(--primary)', marginRight: 6 }}></i> {t('org.my.title')}</h3></div>
      <div className="card-body">
        {!mine ? (
          <>
            <p className="ai-muted">{t('org.my.none')}</p>
            <div className="org-share-url">
              <input className="form-control" placeholder={t('org.my.pasteLink')} value={joinLink} onChange={(e) => setJoinLink(e.target.value)} />
              <button className="btn btn-secondary" disabled={!joinLink.trim()} onClick={openJoin}>{t('org.my.open')}</button>
            </div>
          </>
        ) : (
          <>
            <div className="join-org">
              {mine.organization.logo ? <img className="join-org-logo" src={mine.organization.logo} alt="" /> : <span className="join-org-mark"><i className={`fas fa-${ORG_TYPE_ICONS[mine.organization.type] || 'building'}`}></i></span>}
              <div>
                <strong>{mine.organization.name}</strong>
                <p className="ai-muted">{mine.status === 'active' ? t('org.my.since', { date: new Date(mine.joined_at).toLocaleDateString(i18n.language) }) : t('org.my.waiting')}</p>
              </div>
            </div>
            {mine.status === 'active' ? (
              <>
                <p className="ai-muted">{t('org.my.sharing')}</p>
                <label className="join-check">
                  <input type="checkbox" checked={mine.detail_access} onChange={(e) => toggleDetail(e.target.checked)} />
                  <span>{t('org.join.detailLabel', { name: mine.organization.name })}</span>
                </label>
                {mine.organization.contact_phone || mine.organization.contact_email ? <p className="hp-note">{t('org.my.contact')}: {[mine.organization.contact_phone, mine.organization.contact_email].filter(Boolean).join(' · ')}</p> : null}
                <button className="btn btn-secondary mt-16" onClick={() => setLeaving(true)}><i className="fas fa-right-from-bracket"></i> {t('org.my.leave')}</button>
              </>
            ) : null}
          </>
        )}
      </div>
      <Modal open={leaving} onClose={() => setLeaving(false)} title={t('org.my.leave')}
        footer={<><button className="btn btn-secondary" onClick={() => setLeaving(false)}>{t('common.cancel')}</button><button className="btn btn-danger" onClick={leave}>{t('org.my.leave')}</button></>}>
        <p>{mine ? t('org.my.leaveConfirm', { name: mine.organization.name }) : ''}</p>
      </Modal>
    </div>
  );
}
