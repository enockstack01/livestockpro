import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { useApi } from '../lib/api.js';
import { useToast } from '../lib/toast.jsx';
import ExportMenu, { useFarmIdentity } from '../components/ExportMenu.jsx';
import { printDoc } from '../lib/exporters.js';
import { buildFarmReport } from '../../../shared/farmReport.js';

const TABLES = ['animals', 'health_records', 'breeding_records', 'feeding_records', 'production_records', 'finance_records', 'tasks'];

/* Farm report: the whole farm, or one animal's own report (profile, then
   only its records and totals). Sections with no records are left out;
   tables show every value in full and export to PDF, Excel and CSV with the
   same content (shared/farmReport.js). */
export default function Reports() {
  const { t, i18n } = useTranslation();
  const api = useApi();
  const showToast = useToast();
  const [params, setParams] = useSearchParams();

  const [data, setData] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const animalId = params.get('animal') || '';
  const setAnimalId = (id) => setParams((p) => { const n = new URLSearchParams(p); if (id) n.set('animal', id); else n.delete('animal'); return n; }, { replace: true });

  async function loadAll() {
    const results = await Promise.all(TABLES.map((k) => api.list(k)));
    setData(Object.fromEntries(TABLES.map((k, i) => [k, results[i].data || []])));
  }
  useEffect(() => { loadAll(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleRefresh() {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
    showToast(t('reportsPage.reportRefreshed'), 'success');
  }

  const { farmName, livestockId } = useFarmIdentity();
  const doc = useMemo(
    () => (data ? buildFarmReport(data, { dateFrom, dateTo, animalId }, t, { farmName, livestockId }) : null),
    [data, dateFrom, dateTo, animalId, t, farmName, livestockId]
  );
  const animals = useMemo(() => (data ? [...data.animals].sort((a, b) => String(a.tag_id).localeCompare(String(b.tag_id))) : []), [data]);

  if (!data || !doc) return <div className="empty-state"><i className="fas fa-spinner fa-spin"></i><p>{t('common.loading')}</p></div>;

  const filtered = Boolean(dateFrom || dateTo || animalId);

  return (
    <>
      <div className="page-header">
        <div><h1>{t('reportsPage.title')}</h1><p>{t('reportsPage.subtitle')}</p></div>
        <div className="d-flex gap-16 flex-wrap no-print">
          <button className="btn btn-secondary" onClick={handleRefresh} disabled={refreshing}>
            {refreshing ? <><i className="fas fa-spinner fa-spin"></i> {t('common.loading')}</> : <><i className="fas fa-rotate"></i> {t('common.refresh')}</>}
          </button>
          <button className="btn btn-secondary" onClick={() => printDoc(doc, t, i18n.language)} disabled={doc.empty}><i className="fas fa-print"></i> {t('reportsPage.print')}</button>
          <ExportMenu primary build={() => doc} disabled={doc.empty} label={t('reportsPage.exportReport')} />
        </div>
      </div>

      <div className="card mb-24 no-print">
        <div className="card-body">
          <div className="filter-bar report-filters" style={{ marginBottom: 0 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label style={{ marginBottom: 4 }}>{t('reportsPage.fromDate')}</label>
              <input type="date" className="form-control" value={dateFrom} max={dateTo || undefined} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label style={{ marginBottom: 4 }}>{t('reportsPage.toDate')}</label>
              <input type="date" className="form-control" value={dateTo} min={dateFrom || undefined} onChange={(e) => setDateTo(e.target.value)} />
            </div>
            <div className="form-group" style={{ marginBottom: 0, minWidth: 220 }}>
              <label style={{ marginBottom: 4 }}>{t('reportsPage.animalTag')}</label>
              <select className="form-control" value={animalId} onChange={(e) => setAnimalId(e.target.value)}>
                <option value="">{t('reportsPage.allAnimals')}</option>
                {animals.map((a) => <option key={a.id} value={a.id}>{a.tag_id}{a.name ? ` · ${a.name}` : ''}{a.species ? ` · ${t(`enums.species.${a.species}`, a.species)}` : ''}</option>)}
              </select>
            </div>
            {filtered ? (
              <button className="btn btn-secondary" style={{ alignSelf: 'flex-end' }} onClick={() => { setDateFrom(''); setDateTo(''); setAnimalId(''); }}>
                <i className="fas fa-xmark"></i> {t('reportsPage.clearFilters')}
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <ReportView doc={doc} />
    </>
  );
}

/* The report on screen: the same document the exports are made from. */
export function ReportView({ doc }) {
  const { t } = useTranslation();
  return (
    <div id="reportOutput" className="report-view">
      <div className="report-head">
        <h2>{doc.title}</h2>
        {doc.subtitle ? <p className="report-subtitle">{doc.subtitle}</p> : null}
        <div className="report-meta">{doc.meta.map((m) => <span key={m.label}>{m.label}: <strong>{m.value}</strong></span>)}</div>
      </div>

      {doc.profile ? (
        <div className="card mb-24">
          <div className="card-header"><h3><i className="fas fa-id-card" style={{ marginRight: 8, color: 'var(--leaf)' }}></i>{t('reportsPage.animalProfile')}</h3></div>
          <div className="card-body report-profile">
            {doc.profile.map((p) => <div key={p.label} className={`report-kv${p.wide ? ' wide' : ''}`}><span>{p.label}</span><strong>{p.value}</strong></div>)}
          </div>
        </div>
      ) : null}

      {doc.summary.length ? (
        <div className="finance-summary mb-24 report-summary">
          {doc.summary.map((s) => <div className="finance-card" key={s.label}><h4>{s.label}</h4><div className="amount">{s.value}</div></div>)}
        </div>
      ) : null}

      {doc.empty ? (
        <div className="card"><div className="card-body">
          <div className="empty-state" style={{ padding: '30px 20px' }}>
            <i className="fas fa-inbox"></i>
            <h3>{t('reportsPage.nothingToReport')}</h3>
            <p>{t('reportsPage.noRecordsMatchFilters')}</p>
          </div>
        </div></div>
      ) : doc.sections.map((s) => (
        <div className="card mb-24 report-section" key={s.key}>
          <div className="card-header">
            <h3>{s.title}</h3>
            <span className="badge badge-green">{t('exports.recordsCount', { count: s.rows.length })}</span>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            <div className="table-wrapper">
              <table className="data-table report-table">
                <thead><tr>{s.columns.map((c) => <th key={c.key} className={c.type === 'number' || c.type === 'money' ? 'num' : undefined}>{c.label}</th>)}</tr></thead>
                <tbody>{s.rows.map((row, i) => (
                  <tr key={i}>{row.map((cell, j) => <td key={j} className={s.columns[j].type === 'number' || s.columns[j].type === 'money' ? 'num' : undefined}>{cell.text || '—'}</td>)}</tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
