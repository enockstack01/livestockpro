import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useApi } from '../../lib/api.js';
import { useToast } from '../../lib/toast.jsx';
import { orgErrorText, useOrgData, useOrgMember } from '../../lib/org.jsx';
import { useAccount } from '../../components/AccountGate.jsx';
import { OrgFields, emptyOrgForm } from '../../components/org/OrgGate.jsx';
import { MEMBER_ROLES } from './orgConstants.js';

/* Organization staff (organization admins): invite by email, change a
   member's role, remove a member. An organization keeps at least one admin. */
export function OrgStaff() {
  const { t, i18n } = useTranslation();
  const api = useApi();
  const showToast = useToast();
  const { orgId, readOnly } = useOrgMember();
  const members = useOrgData(api, orgId ? `/organizations/${orgId}/members` : null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('org_staff');

  async function invite(e) {
    e.preventDefault();
    const { error } = await api.http('POST', `/organizations/${orgId}/members`, { email, role });
    if (error) { showToast(orgErrorText(t, error), 'error'); return; }
    showToast(t('org.staff.invited', { email }), 'success');
    setEmail('');
    members.reload();
  }
  async function changeRole(m, next) {
    const { error } = await api.http('PATCH', `/organizations/${orgId}/members/${m.id}`, { role: next });
    if (error) { showToast(orgErrorText(t, error), 'error'); return; }
    members.reload();
  }
  async function remove(m) {
    const { error } = await api.http('DELETE', `/organizations/${orgId}/members/${m.id}`);
    if (error) { showToast(orgErrorText(t, error), 'error'); return; }
    members.reload();
  }

  return (
    <>
      <div className="page-header"><div><h1>{t('org.staff.title')}</h1><p>{t('org.staff.subtitle')}</p></div></div>
      {!readOnly ? (
        <form className="card mb-24" onSubmit={invite}>
          <div className="card-header"><h3><i className="fas fa-user-plus"></i> {t('org.staff.invite')}</h3></div>
          <div className="card-body org-gen">
            <div className="form-group grow"><label>{t('auth.emailAddress')}</label><input type="email" className="form-control" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div className="form-group"><label>{t('org.staff.role')}</label>
              <select className="form-control" value={role} onChange={(e) => setRole(e.target.value)}>{MEMBER_ROLES.map((r) => <option key={r} value={r}>{t(`org.roles.${r}`)}</option>)}</select></div>
            <button className="btn btn-primary" disabled={!email.trim()}><i className="fas fa-paper-plane"></i> {t('org.staff.sendInvite')}</button>
          </div>
          <p className="hp-note" style={{ padding: '0 20px 16px' }}>{t('org.staff.inviteHint')}</p>
        </form>
      ) : null}
      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          <table className="data-table">
            <thead><tr><th>{t('auth.emailAddress')}</th><th>{t('account.fullName')}</th><th>{t('org.staff.role')}</th><th>{t('org.staff.status')}</th><th>{t('org.staff.since')}</th><th>{t('adminDashboard.colActions')}</th></tr></thead>
            <tbody>
              {(members.data || []).map((m) => (
                <tr key={m.id}>
                  <td className="fw-600">{m.email}{m.is_me ? <span className="badge badge-gray" style={{ marginLeft: 6 }}>{t('org.staff.you')}</span> : null}</td>
                  <td>{m.name || '—'}</td>
                  <td>{m.is_me || readOnly ? t(`org.roles.${m.role}`) : (
                    <select className="form-control" value={m.role} onChange={(e) => changeRole(m, e.target.value)}>{MEMBER_ROLES.map((r) => <option key={r} value={r}>{t(`org.roles.${r}`)}</option>)}</select>
                  )}</td>
                  <td><span className={`badge ${m.status === 'active' ? 'badge-green' : 'badge-orange'}`}>{t(`org.staff.statuses.${m.status}`)}</span></td>
                  <td>{new Date(m.joined_at || m.created_at).toLocaleDateString(i18n.language)}</td>
                  <td>{!m.is_me && !readOnly ? <button className="btn-icon danger" title={t('org.staff.remove')} onClick={() => remove(m)}><i className="fas fa-user-xmark"></i></button> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

/* Organization profile: details and logo (organization admins edit, staff read). */
export function OrgProfile() {
  const { t } = useTranslation();
  const api = useApi();
  const showToast = useToast();
  const { refresh } = useAccount();
  const { orgId, isAdmin, readOnly } = useOrgMember();
  const org = useOrgData(api, orgId ? `/organizations/${orgId}` : null);
  const [form, setForm] = useState(emptyOrgForm());
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (org.data) {
      const o = org.data;
      setForm({ name: o.name || '', type: o.type || 'other', country: o.country || '', district: o.district || '', sector: o.sector || '', contact_email: o.contact_email || '', contact_phone: o.contact_phone || '', description: o.description || '', logo: o.logo || null });
    }
  }, [org.data]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const editable = isAdmin && !readOnly;

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    const { error } = await api.http('PATCH', `/organizations/${orgId}`, form);
    setBusy(false);
    if (error) { showToast(orgErrorText(t, error), 'error'); return; }
    showToast(t('org.profile.saved'), 'success');
    org.reload();
    refresh();
  }
  if (!org.data) return <div className="empty-state" style={{ padding: 60 }}><i className="fas fa-spinner fa-spin"></i></div>;
  const o = org.data;
  return (
    <>
      <div className="page-header"><div><h1>{t('org.profile.title')}</h1><p>{t('org.profile.subtitle')}</p></div></div>
      <div className="org-two">
        <form className="card" onSubmit={save}>
          <div className="card-header"><h3><i className="fas fa-building"></i> {t('org.profile.details')}</h3></div>
          <div className="card-body">
            <fieldset disabled={!editable} style={{ border: 0, padding: 0, margin: 0 }}>
              <OrgFields form={form} set={set} setForm={setForm} withLogo={editable} />
            </fieldset>
            {editable ? <button className="btn btn-primary" disabled={busy}><i className={`fas ${busy ? 'fa-spinner fa-spin' : 'fa-floppy-disk'}`}></i> {t('common.save')}</button> : null}
          </div>
        </form>
        <div className="card">
          <div className="card-header"><h3><i className="fas fa-gauge"></i> {t('org.profile.limits')}</h3></div>
          <div className="card-body">
            <div className="settings-readonly-row"><span className="label">{t('org.profile.status')}</span><span className="value">{t(`org.status.${o.status}`)}</span></div>
            <div className="settings-readonly-row"><span className="label">{t('org.profile.farmerLimit')}</span><span className="value">{o.max_farmers}</span></div>
            <div className="settings-readonly-row"><span className="label">{t('org.profile.farmersNow')}</span><span className="value">{o.active_farmers}</span></div>
            <div className="settings-readonly-row"><span className="label">{t('org.profile.linkValidity')}</span><span className="value">{t('org.profile.hours', { count: o.referral_link_hours })}</span></div>
            <p className="hp-note">{t('org.profile.limitHint')}</p>
          </div>
        </div>
      </div>
    </>
  );
}

/* The organization's own activity log (organization admins). */
export function OrgActivity() {
  const { t, i18n } = useTranslation();
  const api = useApi();
  const { orgId } = useOrgMember();
  const log = useOrgData(api, orgId ? `/organizations/${orgId}/audit` : null);
  return (
    <>
      <div className="page-header"><div><h1>{t('org.activity.title')}</h1><p>{t('org.activity.subtitle')}</p></div></div>
      <div className="card"><div className="card-body" style={{ padding: 0 }}>
        <AuditTable rows={log.data || []} lang={i18n.language} t={t} />
      </div></div>
    </>
  );
}

export function AuditTable({ rows, lang, t, showOrg = false }) {
  if (!rows.length) return <div className="empty-state"><i className="fas fa-clock-rotate-left"></i><h3>{t('org.activity.empty')}</h3></div>;
  return (
    <div className="table-wrapper">
      <table className="data-table">
        <thead><tr><th>{t('org.activity.when')}</th><th>{t('org.activity.action')}</th>{showOrg ? <th>{t('org.activity.organization')}</th> : null}<th>{t('org.activity.by')}</th><th>{t('org.activity.details')}</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{new Date(r.at).toLocaleString(lang)}</td>
              <td className="fw-600">{t(`org.audit.${r.action.replace('.', '_')}`, { defaultValue: r.action })}</td>
              {showOrg ? <td>{r.organization_name || '—'}</td> : null}
              <td>{r.actor_email || r.actor_id || '—'}</td>
              <td className="org-audit-details">{auditDetails(t, r)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function auditDetails(t, r) {
  const d = r.details || {};
  if (r.action === 'organization.limit') return t('org.audit.limitDetail', { from: d.from, to: d.to, reason: d.reason || '' });
  if (d.reason) return d.reason;
  if (d.email) return `${d.email}${d.role ? ` · ${t(`org.roles.${d.role}`, { defaultValue: d.role })}` : ''}`;
  if (d.name) return d.name;
  if (d.expires_at) return t('org.audit.expires', { time: new Date(d.expires_at).toLocaleString() });
  if (d.rows !== undefined) return t('org.audit.importDetail', { rows: d.rows, added: d.added });
  return '';
}
