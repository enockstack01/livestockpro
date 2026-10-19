import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useApi } from '../../lib/api.js';
import { useToast } from '../../lib/toast.jsx';
import { orgErrorText, useOrgData, useOrgMember, useQrCode, useTick } from '../../lib/org.jsx';
import Modal from '../../components/Modal.jsx';
import { formatTimeLeft, inviteMessage, LINK_STATUS_TONE, smsUrl, timeLeft, whatsappUrl } from '../../../../shared/org';
import { UsageMeter } from './OrgDashboard.jsx';

/* Referral links: generate a 6 hour link (optionally capped at a number of
   registrations), share it by copy, WhatsApp, SMS or QR code for field days,
   watch the countdown, and see every link's status. Organization admins can
   revoke a link early. */
export default function OrgLinks() {
  const { t, i18n } = useTranslation();
  const api = useApi();
  const showToast = useToast();
  const { orgId, isAdmin, readOnly } = useOrgMember();
  const org = useOrgData(api, orgId ? `/organizations/${orgId}` : null);
  const links = useOrgData(api, orgId ? `/organizations/${orgId}/referral-links` : null);
  const [maxUses, setMaxUses] = useState('');
  const [busy, setBusy] = useState(false);
  const [fresh, setFresh] = useState(null);
  useTick(true);

  async function generate() {
    setBusy(true);
    const { data, error } = await api.http('POST', `/organizations/${orgId}/referral-links`, { max_uses: maxUses === '' ? null : Number(maxUses) });
    setBusy(false);
    if (error) { showToast(orgErrorText(t, error), 'error'); return; }
    setFresh(data);
    links.reload();
  }

  async function revoke(link) {
    const { error } = await api.http('DELETE', `/organizations/${orgId}/referral-links/${link.id}`);
    if (error) { showToast(orgErrorText(t, error), 'error'); return; }
    showToast(t('org.links.revoked'), 'success');
    links.reload();
  }

  const o = org.data;
  return (
    <>
      <div className="page-header">
        <div><h1>{t('org.links.title')}</h1><p>{t('org.links.subtitle', { hours: o ? o.referral_link_hours : 6 })}</p></div>
        {o ? <UsageMeter used={o.usage.used} limit={o.usage.limit} /> : null}
      </div>

      {!readOnly ? (
        <div className="card mb-24">
          <div className="card-header"><h3><i className="fas fa-wand-magic-sparkles"></i> {t('org.links.newLink')}</h3></div>
          <div className="card-body org-gen">
            <div className="form-group">
              <label>{t('org.links.maxUses')}</label>
              <input type="number" min="1" className="form-control" value={maxUses} placeholder={t('org.links.unlimited')} onChange={(e) => setMaxUses(e.target.value)} />
              <small className="ai-muted">{t('org.links.maxUsesHint')}</small>
            </div>
            <button className="btn btn-primary" onClick={generate} disabled={busy || (o && o.usage.used >= o.usage.limit)}>
              <i className={`fas ${busy ? 'fa-spinner fa-spin' : 'fa-link'}`}></i> {t('org.links.generate')}
            </button>
          </div>
        </div>
      ) : <div className="ai-notice"><i className="fas fa-lock"></i><span>{t('org.readOnly')}</span></div>}

      <div className="card">
        <div className="card-header"><h3><i className="fas fa-list"></i> {t('org.links.allLinks')}</h3></div>
        <div className="card-body" style={{ padding: 0 }}>
          <div className="table-wrapper">
            <table className="data-table">
              <thead><tr><th>{t('org.links.colStatus')}</th><th>{t('org.links.colCreated')}</th><th>{t('org.links.colBy')}</th><th>{t('org.links.colExpires')}</th><th>{t('org.links.colJoined')}</th><th>{t('adminDashboard.colActions')}</th></tr></thead>
              <tbody>
                {(links.data || []).length === 0 ? <tr><td colSpan={6}><div className="empty-state"><i className="fas fa-link"></i><h3>{t('org.links.empty')}</h3></div></td></tr>
                  : links.data.map((l) => {
                    const left = timeLeft(l.expires_at);
                    const status = l.status === 'active' && !left.ms ? 'expired' : l.status;
                    return (
                      <tr key={l.id}>
                        <td><span className={`badge badge-${LINK_STATUS_TONE[status] || 'gray'}`}>{t(`org.links.status.${status}`)}</span></td>
                        <td>{new Date(l.created_at).toLocaleString(i18n.language)}</td>
                        <td>{l.created_by_name || '—'}</td>
                        <td>{status === 'active' ? <strong className="org-countdown">{formatTimeLeft(t, left)}</strong> : new Date(l.expires_at).toLocaleString(i18n.language)}</td>
                        <td>{l.use_count}{l.max_uses ? ` / ${l.max_uses}` : ''}</td>
                        <td>{isAdmin && status === 'active' && !readOnly ? <button className="btn btn-secondary btn-sm" onClick={() => revoke(l)}><i className="fas fa-ban"></i> {t('org.links.revoke')}</button> : null}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <ShareLinkModal link={fresh} orgName={o ? o.name : ''} onClose={() => setFresh(null)} />
    </>
  );
}

function ShareLinkModal({ link, orgName, onClose }) {
  const { t } = useTranslation();
  const showToast = useToast();
  const qr = useQrCode(link ? link.url : '', 260);
  if (!link) return null;
  const left = timeLeft(link.expires_at);
  const hours = Math.round((new Date(link.expires_at) - new Date(link.created_at)) / 3600000);
  const message = inviteMessage(t, orgName, link.url, hours);
  async function copy() {
    try { await navigator.clipboard.writeText(link.url); showToast(t('org.links.copied'), 'success'); } catch { showToast(link.url, 'info'); }
  }
  function printQr() {
    const w = window.open('', '_blank', 'width=600,height=760');
    if (!w) return;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${orgName}</title><style>body{font-family:Calibri,Carlito,Arial,sans-serif;text-align:center;color:#1C2B1E;padding:30px}h1{color:#1B5E20;font-size:26px;margin:0 0 6px}p{color:#5B6B5D}img{width:320px;height:320px}footer{margin-top:24px;color:#5B6B5D;font-size:13px}</style></head><body><h1>${orgName.replace(/</g, '&lt;')}</h1><p>${t('org.links.scanToJoin')}</p><img src="${qr}" alt=""><p>${t('org.join.expiresIn', { time: formatTimeLeft(t, left) })}</p><footer>LivestockPro · by Agricoders</footer></body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
  }
  return (
    <Modal open onClose={onClose} title={t('org.links.ready')} maxWidth="560px"
      footer={<button className="btn btn-primary" onClick={onClose}>{t('common.done')}</button>}>
      <p className="ai-muted">{t('org.links.readyHint')}</p>
      <div className="org-share-url">
        <input className="form-control" readOnly value={link.url} onFocus={(e) => e.target.select()} />
        <button className="btn btn-primary" onClick={copy}><i className="fas fa-copy"></i> {t('org.links.copy')}</button>
      </div>
      <div className="org-share-actions">
        <a className="btn btn-secondary" href={whatsappUrl(message)} target="_blank" rel="noreferrer"><i className="fab fa-whatsapp"></i> WhatsApp</a>
        <a className="btn btn-secondary" href={smsUrl(message)}><i className="fas fa-comment-sms"></i> {t('org.links.sms')}</a>
        <button className="btn btn-secondary" onClick={printQr} disabled={!qr}><i className="fas fa-print"></i> {t('org.links.printQr')}</button>
      </div>
      <div className="org-qr">
        {qr ? <img src={qr} alt={t('org.links.qrAlt')} width="220" height="220" /> : <i className="fas fa-spinner fa-spin"></i>}
        <div>
          <div className="org-countdown big">{formatTimeLeft(t, left)}</div>
          <small className="ai-muted">{t('org.links.validFor', { hours })}{link.max_uses ? ` · ${t('org.links.maxUsesShort', { count: link.max_uses })}` : ''}</small>
        </div>
      </div>
    </Modal>
  );
}
