import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useApi } from '../lib/api.js';
import { useToast } from '../lib/toast.jsx';
import { useTopbarSearch } from '../lib/topbarSearch.jsx';
import { fmtDate, downloadCSV, csvCell } from '../lib/badges.jsx';
import { useGeoCapture, LocationCaptureBadge } from '../lib/geolocation.jsx';
import Modal from '../components/Modal.jsx';

const EMPTY_FORM = { type: 'Income', amount: '', category: '', date: '', description: '' };
const CATEGORIES = ['Milk Sales', 'Egg Sales', 'Meat Sales', 'Animal Sales', 'Other Income', 'Feed', 'Veterinary', 'Medicine', 'Labor', 'Equipment', 'Maintenance', 'Transport', 'Other Expense'];

export default function Finance() {
  const { t } = useTranslation();
  const api = useApi();
  const showToast = useToast();
  const geo = useGeoCapture();
  const label = t('tables.finance_records.label');
  const singular = t('tables.finance_records.singular');

  const [records, setRecords] = useState([]);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  useTopbarSearch(t('records.searchPlaceholder', { label: label.toLowerCase() }), setSearch);

  async function load() {
    const { data, error } = await api.list('finance_records', { order: 'date.desc' });
    if (error) { showToast(t('records.loadFailedSimple', { label: label.toLowerCase() }), 'error'); return; }
    setRecords(data || []);
  }
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = records.filter((f) => {
    const q = search.toLowerCase();
    const matchSearch = !q || (f.category || '').toLowerCase().includes(q) || (f.description || '').toLowerCase().includes(q);
    const matchTab = tab === 'all' || (tab === 'income' && f.type === 'Income') || (tab === 'expense' && f.type === 'Expense');
    return matchSearch && matchTab;
  });

  const summary = useMemo(() => {
    const now = new Date();
    const thisMonth = records.filter((f) => { const d = new Date(f.date); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); });
    const totalIncome = thisMonth.filter((f) => f.type === 'Income').reduce((s, f) => s + (f.amount || 0), 0);
    const totalExpense = thisMonth.filter((f) => f.type === 'Expense').reduce((s, f) => s + (f.amount || 0), 0);
    return { totalIncome, totalExpense, pl: totalIncome - totalExpense };
  }, [records]);

  function openAdd() { setEditingId(null); setForm({ ...EMPTY_FORM, date: new Date().toISOString().split('T')[0] }); geo.capture(); setModalOpen(true); }
  function openEdit(f) {
    setEditingId(f.id);
    setForm({ type: f.type || 'Income', amount: f.amount ?? '', category: f.category || '', date: f.date || '', description: f.description || '' });
    geo.reset();
    setModalOpen(true);
  }

  async function save() {
    const amount = parseFloat(form.amount) || 0;
    if (amount <= 0) { showToast(t('financePage.amountMustBeGreaterThanZero'), 'error'); return; }
    if (!form.type) { showToast(t('records.fieldRequired', { field: t('tables.finance_records.fields.type') }), 'error'); return; }
    const payload = { ...form, amount };
    if (editingId) {
      const { error } = await api.update('finance_records', editingId, payload);
      if (error) { showToast(t('records.saveFailed', { message: error.message }), 'error'); return; }
      showToast(t('records.updated', { item: singular }), 'success');
    } else {
      if (geo.status === 'success') { payload.latitude = geo.coords.latitude; payload.longitude = geo.coords.longitude; }
      const { error } = await api.insert('finance_records', [payload]);
      if (error) { showToast(t('records.saveFailed', { message: error.message }), 'error'); return; }
      showToast(t('records.added', { item: singular }), 'success');
    }
    setModalOpen(false);
    await load();
  }

  function confirmDelete(id) { setDeletingId(id); setDeleteOpen(true); }
  async function doDelete() {
    if (!deletingId) return;
    const { error } = await api.remove('finance_records', deletingId);
    if (error) { showToast(t('records.deleteFailed', { item: singular }), 'error'); return; }
    showToast(t('records.deleted', { item: singular }), 'success');
    setDeleteOpen(false);
    await load();
  }

  function exportCSV() {
    if (records.length === 0) { showToast(t('records.noRecordsToExport', { label: label.toLowerCase() }), 'warning'); return; }
    const headers = ['type', 'category', 'amount', 'date', 'description'];
    const csv = [headers.join(',')].concat(records.map((f) => headers.map((c) => csvCell(f[c])).join(','))).join('\n');
    downloadCSV(csv, 'finance_records_export.csv');
    showToast(t('records.exported', { label }), 'success');
  }

  return (
    <>
      <div className="page-header">
        <div><h1>{t('financePage.title')}</h1><p>{t('financePage.subtitle')}</p></div>
        <div className="d-flex gap-16 flex-wrap">
          <button className="btn btn-secondary" onClick={exportCSV}><i className="fas fa-file-export"></i> {t('reports.exportCsv')}</button>
          <button className="btn btn-primary" onClick={openAdd}><i className="fas fa-plus"></i> {t('financePage.addRecord')}</button>
        </div>
      </div>

      <div className="finance-summary">
        <div className="finance-card"><h4>{t('financePage.monthlyIncome')}</h4><div className="amount income">${summary.totalIncome.toLocaleString()}</div></div>
        <div className="finance-card"><h4>{t('financePage.monthlyExpenses')}</h4><div className="amount expense">${summary.totalExpense.toLocaleString()}</div></div>
        <div className="finance-card"><h4>{t('financePage.profitLoss')}</h4><div className={`amount ${summary.pl >= 0 ? 'profit' : 'loss'}`}>${summary.pl.toLocaleString()}</div></div>
      </div>

      <div className="tabs">
        <button className={`tab-btn${tab === 'all' ? ' active' : ''}`} onClick={() => setTab('all')}>{t('common.all')}</button>
        <button className={`tab-btn${tab === 'income' ? ' active' : ''}`} onClick={() => setTab('income')}>{t('enums.financeType.Income')}</button>
        <button className={`tab-btn${tab === 'expense' ? ' active' : ''}`} onClick={() => setTab('expense')}>{t('enums.financeType.Expense')}</button>
      </div>

      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          <div className="table-wrapper">
            <table className="data-table">
              <thead><tr><th>{t('tables.finance_records.fields.type')}</th><th>{t('tables.finance_records.fields.category')}</th><th>{t('tables.finance_records.fields.amount')}</th><th>{t('tables.finance_records.fields.date')}</th><th>{t('tables.finance_records.fields.description')}</th><th>{t('adminDashboard.colActions')}</th></tr></thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={6}><div className="empty-state"><i className="fas fa-receipt"></i><h3>{t('common.noneFound', { label })}</h3><p>{t('records.emptyListWeb', { label: label.toLowerCase() })}</p></div></td></tr>
                ) : filtered.map((f) => {
                  const desc = f.description || '';
                  return (
                    <tr key={f.id}>
                      <td><span className={`badge ${f.type === 'Income' ? 'badge-green' : 'badge-red'}`}><i className={`fas ${f.type === 'Income' ? 'fa-arrow-up' : 'fa-arrow-down'}`}></i> {t(`enums.financeType.${f.type}`, f.type)}</span></td>
                      <td>{f.category ? t(`enums.financeCategory.${f.category}`, f.category) : '—'}</td>
                      <td className={`fw-600 ${f.type === 'Income' ? 'text-green' : 'text-red'}`}>{f.type === 'Income' ? '+' : '-'}${(f.amount || 0).toLocaleString()}</td>
                      <td>{fmtDate(f.date)}</td>
                      <td>{desc.substring(0, 40)}{desc.length > 40 ? '...' : ''}</td>
                      <td>
                        <div className="table-actions">
                          <button className="btn-icon" title={t('common.edit')} onClick={() => openEdit(f)}><i className="fas fa-pen-to-square"></i></button>
                          <button className="btn-icon danger" title={t('common.delete')} onClick={() => confirmDelete(f.id)}><i className="fas fa-trash"></i></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <Modal
        open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? t('records.editTitle', { item: singular }) : t('records.addTitle', { item: singular })}
        footer={<><button className="btn btn-secondary" onClick={() => setModalOpen(false)}>{t('common.cancel')}</button><button className="btn btn-primary" onClick={save}><i className="fas fa-check"></i> {t('common.save')}</button></>}
      >
        {!editingId && <LocationCaptureBadge geo={geo} />}
        <div className="form-row">
          <div className="form-group">
            <label>{t('tables.finance_records.fields.type')} *</label>
            <select className="form-control" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option value="Income">{t('enums.financeType.Income')}</option><option value="Expense">{t('enums.financeType.Expense')}</option>
            </select>
          </div>
          <div className="form-group"><label>{t('tables.finance_records.fields.amount')} ($) *</label><input type="number" className="form-control" placeholder="0.00" step="0.01" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
        </div>
        <div className="form-group">
          <label>{t('tables.finance_records.fields.category')}</label>
          <select className="form-control" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            <option value="">{t('financePage.selectCategory')}</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{t(`enums.financeCategory.${c}`, c)}</option>)}
          </select>
        </div>
        <div className="form-group"><label>{t('tables.finance_records.fields.date')}</label><input type="date" className="form-control" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
        <div className="form-group"><label>{t('tables.finance_records.fields.description')}</label><textarea className="form-control" placeholder={t('financePage.descriptionPlaceholder')} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
      </Modal>

      <Modal
        open={deleteOpen} onClose={() => setDeleteOpen(false)} title={t('common.confirmDelete')} maxWidth={420}
        footer={<><button className="btn btn-secondary" onClick={() => setDeleteOpen(false)}>{t('common.cancel')}</button><button className="btn btn-danger" onClick={doDelete}><i className="fas fa-trash"></i> {t('common.delete')}</button></>}
      >
        <p className="text-muted">{t('financePage.confirmDeleteMessage')}</p>
      </Modal>
    </>
  );
}
