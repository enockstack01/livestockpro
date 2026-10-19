import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useApi } from '../../lib/api.js';
import { useToast } from '../../lib/toast.jsx';
import { orgErrorText, useOrgData } from '../../lib/org.jsx';
import Modal from '../Modal.jsx';
import { OrgFields, emptyOrgForm } from '../org/OrgGate.jsx';
import { AuditTable } from '../../pages/org/OrgManage.jsx';
import { emailsFromCsv, LINK_STATUS_TONE, ORG_STATUS_TONE } from '../../../../shared/org';

/* System admin: every organization, the approval queue, and the controls
   for one organization (farmer limit with a reason, suspend, reactivate,
   delete for super admins, members, links, farmers, CSV import). */
export function AdminOrganizations({ isSuper }) {
  const { t, i18n } = useTranslation();
  const api = useApi();
  const [status, setStatus] = useState('');
  const [openId, setOpenId] = useState(null);
  const [creating, setCreating] = useState(false);
  const list = useOrgData(api, `/admin/organizations${status ? `?status=${status}` : ''}`);
  const platform = useOrgData(api, '/admin/platform');
  const candidates = useOrgData(api, '/admin/conversion-candidates');
  const pending = (list.data || []).filter((o) => o.status === 'pending');
  const p = platform.data;

  return (
    <div className="admin-fade-in">
      {p ? (
        <div className="org-kpis mb-24">
          <div className="org-kpi"><span className="org-kpi-icon leaf"><i className="fas fa-building"></i></span><span className="org-kpi-label">{t('org.admin.activeOrgs')}</span><strong className="org-kpi-value">{p.organizations.active}</strong><small className="org-kpi-sub">{t('org.admin.pendingSuspended', { pending: p.organizations.pending, suspended: p.organizations.suspended })}</small></div>
          <div className="org-kpi"><span className="org-kpi-icon leaf"><i className="fas fa-users"></i></span><span className="org-kpi-label">{t('org.admin.farmersInOrgs')}</span><strong className="org-kpi-value">{p.farmers_in_organizations}</strong><small className="org-kpi-sub">{t('org.admin.capacity', { count: p.capacity })}</small></div>
          <div className="org-kpi"><span className="org-kpi-icon slate"><i className="fas fa-user"></i></span><span className="org-kpi-label">{t('org.admin.independent')}</span><strong className="org-kpi-value">{p.independent_farmers}</strong></div>
          <div className="org-kpi"><span className="org-kpi-icon amber"><i className="fas fa-user-plus"></i></span><span className="org-kpi-label">{t('org.admin.joins30')}</span><strong className="org-kpi-value">{p.joins_30d}</strong></div>
        </div>
      ) : null}

      {pending.length && !status ? (
        <div className="card mb-24">
          <div className="card-header"><h3><i className="fas fa-hourglass-half"></i> {t('org.admin.queue')} <span className="tab-count">{pending.length}</span></h3></div>
          <div className="card-body" style={{ padding: 0 }}>
            {pending.map((o) => (
              <button key={o.id} type="button" className="ai-report-row" onClick={() => setOpenId(o.id)}>
                <span className="ai-section-icon"><i className="fas fa-building"></i></span>
                <span className="ai-report-row-text"><strong>{o.name}</strong><small>{t(`org.types.${o.type}`)} · {o.district || '—'} · {o.contact_email} · {new Date(o.created_at).toLocaleDateString(i18n.language)}</small></span>
                <span className="badge badge-orange">{t('org.admin.review')}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="card mb-24">
        <div className="card-header">
          <h3><i className="fas fa-building"></i> {t('org.admin.all')}</h3>
          <div className="page-actions">
            <select className="form-control" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">{t('org.filters.all')}</option>
              {['pending', 'active', 'suspended'].map((s) => <option key={s} value={s}>{t(`org.status.${s}`)}</option>)}
            </select>
            <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}><i className="fas fa-plus"></i> {t('org.admin.create')}</button>
          </div>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          <div className="table-wrapper">
            <table className="data-table">
              <thead><tr><th>{t('org.fields.name')}</th><th>{t('org.fields.type')}</th><th>{t('org.profile.status')}</th><th>{t('org.admin.farmers')}</th><th>{t('org.admin.joined')}</th><th>{t('org.admin.admins')}</th><th></th></tr></thead>
              <tbody>
                {(list.data || []).length === 0 ? <tr><td colSpan={7}><div className="empty-state"><i className="fas fa-building"></i><h3>{t('org.admin.none')}</h3></div></td></tr>
                  : list.data.map((o) => (
                    <tr key={o.id}>
                      <td className="fw-600">{o.name}<div className="org-sub">{o.district || ''}</div></td>
                      <td>{t(`org.types.${o.type}`)}</td>
                      <td><span className={`badge badge-${ORG_STATUS_TONE[o.status]}`}>{t(`org.status.${o.status}`)}</span></td>
                      <td>{t('org.usage.of', { used: o.usage.used, limit: o.usage.limit })}</td>
                      <td>{new Date(o.created_at).toLocaleDateString(i18n.language)}</td>
                      <td>{o.admins.map((a) => a.email).join(', ') || '—'}</td>
                      <td><button className="btn btn-secondary btn-sm" onClick={() => setOpenId(o.id)}>{t('org.admin.open')}</button></td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {(candidates.data || []).length ? (
        <div className="card mb-24">
          <div className="card-header"><h3><i className="fas fa-right-left"></i> {t('org.admin.candidates')}</h3></div>
          <div className="card-body">
            <p className="ai-muted" style={{ marginBottom: 10 }}>{t('org.admin.candidatesHint')}</p>
            {candidates.data.map((c) => <ConvertRow key={c.user_id} c={c} onDone={() => { candidates.reload(); list.reload(); }} />)}
          </div>
        </div>
      ) : null}

      {openId ? <OrgDetail id={openId} isSuper={isSuper} onClose={() => setOpenId(null)} onChanged={() => { list.reload(); platform.reload(); }} /> : null}
      {creating ? <CreateOrg onClose={() => setCreating(false)} onCreated={() => { setCreating(false); list.reload(); }} /> : null}
    </div>
  );
}

function ConvertRow({ c, onDone }) {
  const { t } = useTranslation();
  const api = useApi();
  const showToast = useToast();
  const [confirm, setConfirm] = useState(false);
  async function convert() {
    const { error } = await api.http('POST', `/admin/conversion-candidates/${c.user_id}`, { name: c.farm_name || c.name });
    setConfirm(false);
    if (error) { showToast(orgErrorText(t, error), 'error'); return; }
    showToast(t('org.admin.converted'), 'success');
    onDone();
  }
  return (
    <div className="org-invite">
      <span className="join-org-mark"><i className="fas fa-people-group"></i></span>
      <div className="org-invite-text"><strong>{c.farm_name || c.name || c.email}</strong><span>{c.email}{c.has_records ? ` · ${t('org.admin.hasRecords')}` : ''}</span></div>
      <button className="btn btn-secondary btn-sm" onClick={() => setConfirm(true)}>{t('org.admin.convert')}</button>
      <Modal open={confirm} onClose={() => setConfirm(false)} title={t('org.admin.convert')}
        footer={<><button className="btn btn-secondary" onClick={() => setConfirm(false)}>{t('common.cancel')}</button><button className="btn btn-primary" onClick={convert}>{t('org.admin.convert')}</button></>}>
        <p>{c.has_records ? t('org.admin.convertWarn') : t('org.admin.convertConfirm')}</p>
      </Modal>
    </div>
  );
}

function CreateOrg({ onClose, onCreated }) {
  const { t } = useTranslation();
  const api = useApi();
  const showToast = useToast();
  const [form, setForm] = useState(emptyOrgForm());
  const [adminEmail, setAdminEmail] = useState('');
  const [max, setMax] = useState('');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  async function save() {
    const { error } = await api.http('POST', '/admin/organizations', { ...form, admin_email: adminEmail, max_farmers: max === '' ? undefined : Number(max) });
    if (error) { showToast(orgErrorText(t, error), 'error'); return; }
    showToast(t('org.admin.createdNote', { email: adminEmail }), 'success');
    onCreated();
  }
  return (
    <Modal open onClose={onClose} title={t('org.admin.create')} maxWidth="640px"
      footer={<><button className="btn btn-secondary" onClick={onClose}>{t('common.cancel')}</button><button className="btn btn-primary" onClick={save}><i className="fas fa-check"></i> {t('org.admin.createActive')}</button></>}>
      <OrgFields form={form} set={set} setForm={setForm} />
      <div className="form-row">
        <div className="form-group"><label>{t('org.admin.adminEmail')} *</label><input type="email" className="form-control" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} /></div>
        <div className="form-group"><label>{t('org.profile.farmerLimit')}</label><input type="number" min="0" className="form-control" value={max} placeholder={t('org.admin.defaultLimit')} onChange={(e) => setMax(e.target.value)} /></div>
      </div>
    </Modal>
  );
}

function OrgDetail({ id, isSuper, onClose, onChanged }) {
  const { t, i18n } = useTranslation();
  const api = useApi();
  const showToast = useToast();
  const detail = useOrgData(api, `/admin/organizations/${id}`);
  const [limit, setLimit] = useState('');
  const [reason, setReason] = useState('');
  const [importText, setImportText] = useState('');
  const [importResult, setImportResult] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const o = detail.data;
  useEffect(() => { if (o) setLimit(String(o.max_farmers)); }, [o]);

  async function patch(body, okMessage) {
    const { error } = await api.http('PATCH', `/admin/organizations/${id}`, body);
    if (error) { showToast(orgErrorText(t, error), 'error'); return false; }
    showToast(okMessage, 'success');
    detail.reload();
    onChanged();
    return true;
  }
  async function saveLimit() {
    if (await patch({ max_farmers: Number(limit), reason }, t('org.admin.limitSaved'))) setReason('');
  }
  async function runImport() {
    const rows = emailsFromCsv(importText).map((email) => ({ email }));
    if (!rows.length) { showToast(t('org.admin.importNoEmails'), 'error'); return; }
    const { data, error } = await api.http('POST', `/admin/organizations/${id}/import`, { rows });
    if (error) { showToast(orgErrorText(t, error), 'error'); return; }
    setImportResult(data);
    detail.reload();
    onChanged();
  }
  async function readFile(e) {
    const file = e.target.files[0];
    if (file) setImportText(await file.text());
  }
  async function remove() {
    const { error } = await api.http('DELETE', `/admin/organizations/${id}`);
    if (error) { showToast(orgErrorText(t, error), 'error'); return; }
    onChanged();
    onClose();
  }

  return (
    <Modal open onClose={onClose} title={o ? o.name : '…'} maxWidth="900px">
      {!o ? <div className="empty-state"><i className="fas fa-spinner fa-spin"></i></div> : (
        <div className="org-detail">
          <div className="org-detail-head">
            <span className={`badge badge-${ORG_STATUS_TONE[o.status]}`}>{t(`org.status.${o.status}`)}</span>
            <span>{t(`org.types.${o.type}`)} · {[o.district, o.sector, o.country].filter(Boolean).join(', ')}</span>
            <span>{o.contact_email} · {o.contact_phone}</span>
          </div>
          {o.description ? <p className="ai-muted">{o.description}</p> : null}
          <div className="org-detail-actions">
            {o.status === 'pending' ? <button className="btn btn-primary" onClick={() => patch({ action: 'approve' }, t('org.admin.approved'))}><i className="fas fa-check"></i> {t('org.admin.approve')}</button> : null}
            {o.status === 'active' ? <button className="btn btn-secondary" onClick={() => patch({ action: 'suspend', reason }, t('org.admin.suspended'))}><i className="fas fa-pause"></i> {t('org.admin.suspend')}</button> : null}
            {o.status === 'suspended' ? <button className="btn btn-primary" onClick={() => patch({ action: 'reactivate' }, t('org.admin.reactivated'))}><i className="fas fa-play"></i> {t('org.admin.reactivate')}</button> : null}
            {isSuper ? <button className="btn btn-danger" onClick={() => setConfirmDelete(true)}><i className="fas fa-trash"></i> {t('org.admin.delete')}</button> : null}
          </div>

          <div className="org-two">
            <div className="card">
              <div className="card-header"><h3><i className="fas fa-gauge"></i> {t('org.admin.farmerLimit')}</h3></div>
              <div className="card-body">
                <p>{t('org.usage.of', { used: o.usage.used, limit: o.usage.limit })} {t('org.usage.farmers')}</p>
                <div className="form-row">
                  <div className="form-group"><label>{t('org.admin.newLimit')}</label><input type="number" min="0" className="form-control" value={limit} onChange={(e) => setLimit(e.target.value)} /></div>
                  <div className="form-group"><label>{t('org.admin.reason')} *</label><input className="form-control" value={reason} onChange={(e) => setReason(e.target.value)} /></div>
                </div>
                <button className="btn btn-primary btn-sm" disabled={!reason.trim() || limit === ''} onClick={saveLimit}><i className="fas fa-floppy-disk"></i> {t('org.admin.saveLimit')}</button>
                {Number(limit) < o.usage.used ? <p className="hp-note">{t('org.admin.lowerWarn')}</p> : null}
              </div>
            </div>
            <div className="card">
              <div className="card-header"><h3><i className="fas fa-file-import"></i> {t('org.admin.import')}</h3></div>
              <div className="card-body">
                <p className="ai-muted">{t('org.admin.importHint')}</p>
                <input type="file" accept=".csv,text/csv,text/plain" onChange={readFile} />
                <textarea className="form-control" rows={3} style={{ marginTop: 8 }} placeholder="farmer@example.com" value={importText} onChange={(e) => setImportText(e.target.value)} />
                <button className="btn btn-primary btn-sm mt-16" disabled={o.status !== 'active'} onClick={runImport}><i className="fas fa-upload"></i> {t('org.admin.importRun', { count: emailsFromCsv(importText).length })}</button>
                {importResult ? (
                  <ul className="org-import-result">
                    {importResult.map((r) => <li key={r.email}><span>{r.email}</span><span className={`badge ${r.result === 'pending_consent' ? 'badge-green' : 'badge-gray'}`}>{t(`org.admin.importResults.${r.result}`)}</span></li>)}
                  </ul>
                ) : null}
              </div>
            </div>
          </div>

          <h4 className="org-detail-title">{t('org.staff.title')}</h4>
          <table className="data-table">
            <tbody>{o.members.map((m) => <tr key={m.id}><td>{m.email}</td><td>{t(`org.roles.${m.role}`)}</td><td><span className={`badge ${m.status === 'active' ? 'badge-green' : 'badge-orange'}`}>{t(`org.staff.statuses.${m.status}`)}</span></td></tr>)}</tbody>
          </table>

          <h4 className="org-detail-title">{t('org.links.allLinks')}</h4>
          {o.links.length ? (
            <table className="data-table">
              <tbody>{o.links.slice(0, 20).map((l) => <tr key={l.id}><td><span className={`badge badge-${LINK_STATUS_TONE[l.status] || 'gray'}`}>{t(`org.links.status.${l.status}`)}</span></td><td>{new Date(l.created_at).toLocaleString(i18n.language)}</td><td>{t('org.links.joinedCount', { count: l.use_count })}</td></tr>)}</tbody>
            </table>
          ) : <p className="ai-muted">{t('org.links.empty')}</p>}

          <h4 className="org-detail-title">{t('org.farmers.title')} ({o.farmers.length})</h4>
          {o.farmers.length ? (
            <table className="data-table">
              <tbody>{o.farmers.slice(0, 50).map((f) => <tr key={f.farmer_id}><td className="fw-600">{f.name}</td><td>{[f.district, f.sector].filter(Boolean).join(' · ') || '—'}</td><td>{f.herd_size}</td><td>{t(`org.farmers.status.${f.status}`)}</td></tr>)}</tbody>
            </table>
          ) : <p className="ai-muted">{t('org.farmers.empty')}</p>}

          <h4 className="org-detail-title">{t('org.activity.title')}</h4>
          <AuditTable rows={o.audit} lang={i18n.language} t={t} />

          <Modal open={confirmDelete} onClose={() => setConfirmDelete(false)} title={t('org.admin.delete')}
            footer={<><button className="btn btn-secondary" onClick={() => setConfirmDelete(false)}>{t('common.cancel')}</button><button className="btn btn-danger" onClick={remove}><i className="fas fa-trash"></i> {t('org.admin.delete')}</button></>}>
            <p>{t('org.admin.deleteConfirm', { name: o.name })}</p>
          </Modal>
        </div>
      )}
    </Modal>
  );
}

/* The platform audit log with filters. */
export function AdminAudit() {
  const { t, i18n } = useTranslation();
  const api = useApi();
  const [draft, setDraft] = useState({ q: '', action: '', from: '', to: '' });
  const [query, setQuery] = useState({});
  const [page, setPage] = useState(0);
  const qs = new URLSearchParams(Object.entries({ ...query, page }).filter(([, v]) => v !== '' && v !== undefined)).toString();
  const log = useOrgData(api, `/admin/audit?${qs}`);
  const set = (k) => (e) => setDraft((d) => ({ ...d, [k]: e.target.value }));
  const ACTIONS = ['organization', 'member', 'link', 'farmer', 'settings'];
  return (
    <div className="admin-fade-in">
      <div className="card org-filters">
        <div className="org-filter grow"><label>{t('common.search')}</label><input className="form-control" value={draft.q} onChange={set('q')} placeholder={t('org.admin.auditSearch')} /></div>
        <div className="org-filter"><label>{t('org.activity.action')}</label>
          <select className="form-control" value={draft.action} onChange={set('action')}><option value="">{t('org.filters.all')}</option>{ACTIONS.map((a) => <option key={a} value={a}>{t(`org.admin.actionGroups.${a}`)}</option>)}</select></div>
        <div className="org-filter"><label>{t('org.filters.from')}</label><input type="date" className="form-control" value={draft.from} onChange={set('from')} /></div>
        <div className="org-filter"><label>{t('org.filters.to')}</label><input type="date" className="form-control" value={draft.to} onChange={set('to')} /></div>
        <div className="org-filter-actions"><button className="btn btn-primary btn-sm" onClick={() => { setPage(0); setQuery(draft); }}><i className="fas fa-filter"></i> {t('org.filters.apply')}</button></div>
      </div>
      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          <AuditTable rows={(log.data && log.data.rows) || []} lang={i18n.language} t={t} showOrg />
        </div>
      </div>
      {log.data && log.data.total > 100 ? (
        <div className="org-pager">
          <button className="btn btn-secondary btn-sm" disabled={page === 0} onClick={() => setPage(page - 1)}>{t('common.prev')}</button>
          <span>{t('org.admin.page', { page: page + 1, pages: Math.ceil(log.data.total / 100) })}</span>
          <button className="btn btn-secondary btn-sm" disabled={(page + 1) * 100 >= log.data.total} onClick={() => setPage(page + 1)}>{t('common.next')}</button>
        </div>
      ) : null}
    </div>
  );
}

/* System settings: link validity and the default farmer limit (super admins edit). */
export function AdminSettings({ isSuper }) {
  const { t } = useTranslation();
  const api = useApi();
  const showToast = useToast();
  const s = useOrgData(api, '/admin/settings');
  const [form, setForm] = useState({ referral_link_hours: '', default_max_farmers: '' });
  useEffect(() => { if (s.data) setForm({ referral_link_hours: String(s.data.referral_link_hours), default_max_farmers: String(s.data.default_max_farmers) }); }, [s.data]);
  async function save() {
    const { error } = await api.http('PATCH', '/admin/settings', { referral_link_hours: Number(form.referral_link_hours), default_max_farmers: Number(form.default_max_farmers) });
    if (error) { showToast(orgErrorText(t, error), 'error'); return; }
    showToast(t('org.admin.settingsSaved'), 'success');
    s.reload();
  }
  return (
    <div className="admin-fade-in">
      <div className="card" style={{ maxWidth: 620 }}>
        <div className="card-header"><h3><i className="fas fa-sliders"></i> {t('org.admin.settingsTitle')}</h3></div>
        <div className="card-body">
          <fieldset disabled={!isSuper} style={{ border: 0, padding: 0, margin: 0 }}>
            <div className="form-group"><label>{t('org.admin.linkHours')}</label><input type="number" min="0.25" step="0.25" className="form-control" value={form.referral_link_hours} onChange={(e) => setForm((f) => ({ ...f, referral_link_hours: e.target.value }))} /><small className="ai-muted">{t('org.admin.linkHoursHint')}</small></div>
            <div className="form-group"><label>{t('org.admin.defaultMax')}</label><input type="number" min="0" className="form-control" value={form.default_max_farmers} onChange={(e) => setForm((f) => ({ ...f, default_max_farmers: e.target.value }))} /><small className="ai-muted">{t('org.admin.defaultMaxHint')}</small></div>
          </fieldset>
          {isSuper ? <button className="btn btn-primary" onClick={save}><i className="fas fa-floppy-disk"></i> {t('common.save')}</button> : <p className="hp-note">{t('org.admin.superOnly')}</p>}
        </div>
      </div>
    </div>
  );
}
