import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useApi } from '../../lib/api.js';
import { useToast } from '../../lib/toast.jsx';
import { orgErrorText, useFarmerExport, useOrgData, useOrgMember } from '../../lib/org.jsx';
import Modal from '../../components/Modal.jsx';
import { StatusBadge, fmtDate } from '../../lib/badges.jsx';

/* The organization's farmers: searchable, filterable by location, with the
   dashboard's drill-downs (?ids=...&label=...), export to CSV or Excel, and
   (organization admins) removal. Detailed records open only for farmers who
   gave that extra permission. */
export default function OrgFarmers() {
  const { t, i18n } = useTranslation();
  const api = useApi();
  const showToast = useToast();
  const navigate = useNavigate();
  const { orgId, isAdmin, readOnly, name } = useOrgMember();
  const [params, setParams] = useSearchParams();
  const ids = params.get('ids');
  const label = params.get('label');
  const [q, setQ] = useState('');
  const [district, setDistrict] = useState('');
  const [removing, setRemoving] = useState(null);
  const [reason, setReason] = useState('');
  const list = useOrgData(api, orgId ? `/organizations/${orgId}/farmers${ids !== null ? `?ids=${encodeURIComponent(ids)}` : ''}` : null);
  const exporter = useFarmerExport();

  const rows = useMemo(() => {
    const all = list.data || [];
    const needle = q.trim().toLowerCase();
    return all.filter((f) => (!district || f.district === district) && (!needle || [f.name, f.farm_name, f.phone, f.district, f.sector, f.cell].some((v) => (v || '').toLowerCase().includes(needle))));
  }, [list.data, q, district]);
  const districts = [...new Set((list.data || []).map((f) => f.district).filter(Boolean))].sort();
  const sp = (s) => t(`enums.species.${s}`, { defaultValue: s });

  async function remove() {
    const { error } = await api.http('DELETE', `/organizations/${orgId}/farmers/${removing.farmer_id}`, { reason });
    if (error) { showToast(orgErrorText(t, error), 'error'); return; }
    showToast(t('org.farmers.removed', { name: removing.name }), 'success');
    setRemoving(null);
    setReason('');
    list.reload();
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>{t('org.farmers.title')}</h1>
          <p>{label ? t('org.farmers.filteredBy', { label }) : t('org.farmers.subtitle', { count: (list.data || []).length })}</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary" disabled={!rows.length} onClick={() => exporter.csv(rows, name)}><i className="fas fa-file-csv"></i> {t('org.farmers.exportCsv')}</button>
          <button className="btn btn-secondary" disabled={!rows.length} onClick={() => exporter.excel(rows, name)}><i className="fas fa-file-excel"></i> {t('org.farmers.exportExcel')}</button>
          {!readOnly ? <Link className="btn btn-primary" to="/organization/links"><i className="fas fa-link"></i> {t('org.links.generate')}</Link> : null}
        </div>
      </div>

      <div className="card org-filters">
        <div className="org-filter grow"><label>{t('common.search')}</label><input className="form-control" value={q} placeholder={t('org.farmers.searchPlaceholder')} onChange={(e) => setQ(e.target.value)} /></div>
        <div className="org-filter"><label>{t('org.fields.district')}</label>
          <select className="form-control" value={district} onChange={(e) => setDistrict(e.target.value)}><option value="">{t('org.filters.all')}</option>{districts.map((x) => <option key={x}>{x}</option>)}</select></div>
        {ids !== null ? <div className="org-filter-actions"><button className="btn btn-secondary btn-sm" onClick={() => setParams({})}><i className="fas fa-xmark"></i> {t('org.farmers.showAll')}</button></div> : null}
      </div>

      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          <div className="table-wrapper">
            <table className="data-table">
              <thead><tr>
                <th>{t('org.farmers.colName')}</th><th>{t('org.dash.location')}</th><th>{t('org.farmers.colHerd')}</th><th>{t('org.farmers.colSpecies')}</th>
                <th>{t('org.farmers.colOpenCases')}</th><th>{t('org.farmers.colJoined')}</th><th>{t('org.farmers.colLastActivity')}</th><th>{t('org.farmers.colStatus')}</th><th>{t('adminDashboard.colActions')}</th>
              </tr></thead>
              <tbody>
                {list.loading ? <tr><td colSpan={9}><div className="empty-state"><i className="fas fa-spinner fa-spin"></i></div></td></tr>
                  : rows.length === 0 ? <tr><td colSpan={9}><div className="empty-state"><i className="fas fa-users"></i><h3>{t('org.farmers.empty')}</h3><p>{t('org.farmers.emptyHint')}</p></div></td></tr>
                    : rows.map((f) => (
                      <tr key={f.farmer_id}>
                        <td className="fw-600">{f.name}{f.farm_name && f.farm_name !== f.name ? <div className="org-sub">{f.farm_name}</div> : null}{f.phone ? <div className="org-sub">{f.phone}</div> : null}</td>
                        <td>{[f.district, f.sector, f.cell].filter(Boolean).join(' · ') || '—'}</td>
                        <td>{f.herd_size}</td>
                        <td>{f.main_species.map((s) => `${sp(s.species)} ${s.count}`).join(', ') || '—'}</td>
                        <td>{f.open_cases ? <span className={`badge ${f.critical_now ? 'badge-red' : 'badge-orange'}`}>{f.open_cases}</span> : '0'}</td>
                        <td>{fmtDate(f.joined_at)}</td>
                        <td>{f.last_activity ? new Date(f.last_activity).toLocaleDateString(i18n.language) : '—'}</td>
                        <td>{f.status === 'active' ? <span className="badge badge-green">{t('org.farmers.status.active')}</span> : <span className="badge badge-orange">{t(`org.farmers.status.${f.status}`)}</span>}</td>
                        <td>
                          <div className="table-actions">
                            {f.detail_access && f.status === 'active' ? <button className="btn-icon" title={t('org.farmers.viewRecords')} onClick={() => navigate(`/organization/farmers/${f.farmer_id}`)}><i className="fas fa-folder-open"></i></button> : <span className="org-locked" title={t('org.farmers.noDetail')}><i className="fas fa-lock"></i></span>}
                            {isAdmin && !readOnly ? <button className="btn-icon danger" title={t('org.farmers.remove')} onClick={() => setRemoving(f)}><i className="fas fa-user-minus"></i></button> : null}
                          </div>
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <Modal open={Boolean(removing)} onClose={() => setRemoving(null)} title={t('org.farmers.removeTitle')}
        footer={<><button className="btn btn-secondary" onClick={() => setRemoving(null)}>{t('common.cancel')}</button><button className="btn btn-danger" onClick={remove}><i className="fas fa-user-minus"></i> {t('org.farmers.remove')}</button></>}>
        <p>{removing ? t('org.farmers.removeConfirm', { name: removing.name }) : ''}</p>
        <div className="form-group"><label>{t('org.farmers.reason')}</label><input className="form-control" value={reason} onChange={(e) => setReason(e.target.value)} /></div>
      </Modal>
    </>
  );
}

/* Read only herd records of one farmer, shown only with their permission. */
export function OrgFarmerRecords() {
  const { t } = useTranslation();
  const api = useApi();
  const { farmerId } = useParams();
  const { orgId } = useOrgMember();
  const rec = useOrgData(api, orgId ? `/organizations/${orgId}/farmers/${farmerId}/records` : null);
  const farmers = useOrgData(api, orgId ? `/organizations/${orgId}/farmers?ids=${farmerId}` : null);
  const f = (farmers.data || [])[0];
  const sp = (s) => t(`enums.species.${s}`, { defaultValue: s });
  if (rec.error) return <div className="ai-notice ai-notice-error"><i className="fas fa-lock"></i><span>{orgErrorText(t, rec.error)}</span></div>;
  if (!rec.data) return <div className="empty-state" style={{ padding: 60 }}><i className="fas fa-spinner fa-spin"></i></div>;
  const r = rec.data;
  return (
    <>
      <div className="page-header">
        <div>
          <h1>{f ? f.name : t('org.farmers.records')}</h1>
          <p>{t('org.farmers.readOnly')}</p>
        </div>
        <Link className="btn btn-secondary" to="/organization/farmers"><i className="fas fa-arrow-left"></i> {t('ai.back')}</Link>
      </div>
      <div className="card mb-24">
        <div className="card-header"><h3><i className="fas fa-cow"></i> {t('tables.animals.label')} ({r.animals.length})</h3></div>
        <div className="card-body" style={{ padding: 0 }}><div className="table-wrapper"><table className="data-table">
          <thead><tr><th>{t('tables.animals.fields.tag_id')}</th><th>{t('tables.animals.fields.species')}</th><th>{t('tables.animals.fields.breed')}</th><th>{t('tables.animals.fields.sex')}</th><th>{t('tables.animals.fields.health_status')}</th></tr></thead>
          <tbody>{r.animals.map((a) => <tr key={a.id}><td className="fw-600">{a.tag_id}</td><td>{sp(a.species)}</td><td>{a.breed || '—'}</td><td>{a.sex ? t(`enums.sex.${a.sex}`, a.sex) : '—'}</td><td><StatusBadge status={a.health_status} /></td></tr>)}</tbody>
        </table></div></div>
      </div>
      <div className="card mb-24">
        <div className="card-header"><h3><i className="fas fa-stethoscope"></i> {t('tables.health_records.label')} ({r.health.length})</h3></div>
        <div className="card-body" style={{ padding: 0 }}><div className="table-wrapper"><table className="data-table">
          <thead><tr><th>{t('tables.animals.fields.tag_id')}</th><th>{t('tables.health_records.fields.disease')}</th><th>{t('tables.health_records.fields.treatment')}</th><th>{t('tables.health_records.fields.check_date')}</th><th>{t('tables.health_records.fields.status')}</th></tr></thead>
          <tbody>{r.health.map((h) => <tr key={h.id}><td className="fw-600">{h.tag_id || '—'}</td><td>{h.disease || '—'}</td><td>{h.treatment || '—'}</td><td>{fmtDate(h.check_date)}</td><td><StatusBadge status={h.status} /></td></tr>)}</tbody>
        </table></div></div>
      </div>
      <div className="card mb-24">
        <div className="card-header"><h3><i className="fas fa-venus-mars"></i> {t('tables.breeding_records.label')} ({r.breeding.length})</h3></div>
        <div className="card-body" style={{ padding: 0 }}><div className="table-wrapper"><table className="data-table">
          <thead><tr><th>{t('tables.animals.fields.tag_id')}</th><th>{t('tables.breeding_records.fields.breeding_date')}</th><th>{t('tables.breeding_records.fields.pregnancy_status')}</th><th>{t('tables.breeding_records.fields.birth_date')}</th></tr></thead>
          <tbody>{r.breeding.map((b) => <tr key={b.id}><td className="fw-600">{b.tag_id || '—'}</td><td>{fmtDate(b.breeding_date)}</td><td>{b.pregnancy_status ? t(`enums.pregnancyStatus.${b.pregnancy_status}`, b.pregnancy_status) : '—'}</td><td>{fmtDate(b.birth_date)}</td></tr>)}</tbody>
        </table></div></div>
      </div>
    </>
  );
}
