import { useEffect, useMemo, useState } from 'react';
import { useApi } from '../lib/api.js';
import { useToast } from '../lib/toast.jsx';
import { useTopbarSearch } from '../lib/topbarSearch.jsx';
import { fmtDate, downloadCSV, csvCell } from '../lib/badges.jsx';
import { useGeoCapture, LocationCaptureBadge } from '../lib/geolocation.jsx';
import Modal from '../components/Modal.jsx';

const EMPTY_FORM = { type: 'Income', amount: '', category: '', date: '', description: '' };
const CATEGORIES = ['Milk Sales', 'Egg Sales', 'Meat Sales', 'Animal Sales', 'Other Income', 'Feed', 'Veterinary', 'Medicine', 'Labor', 'Equipment', 'Maintenance', 'Transport', 'Other Expense'];

export default function Finance() {
  const api = useApi();
  const showToast = useToast();
  const geo = useGeoCapture();

  const [records, setRecords] = useState([]);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  useTopbarSearch('Search finance...', setSearch);

  async function load() {
    const { data, error } = await api.list('finance_records', { order: 'date.desc' });
    if (error) { showToast('Failed to load finance records.', 'error'); return; }
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
    if (amount <= 0) { showToast('Amount must be greater than 0.', 'error'); return; }
    if (!form.type) { showToast('Type is required.', 'error'); return; }
    const payload = { ...form, amount };
    if (editingId) {
      const { error } = await api.update('finance_records', editingId, payload);
      if (error) { showToast('Update failed.', 'error'); return; }
      showToast('Finance record updated.', 'success');
    } else {
      if (geo.status === 'success') { payload.latitude = geo.coords.latitude; payload.longitude = geo.coords.longitude; }
      const { error } = await api.insert('finance_records', [payload]);
      if (error) { showToast('Insert failed.', 'error'); return; }
      showToast('Finance record added.', 'success');
    }
    setModalOpen(false);
    await load();
  }

  function confirmDelete(id) { setDeletingId(id); setDeleteOpen(true); }
  async function doDelete() {
    if (!deletingId) return;
    const { error } = await api.remove('finance_records', deletingId);
    if (error) { showToast('Delete failed.', 'error'); return; }
    showToast('Finance record deleted.', 'success');
    setDeleteOpen(false);
    await load();
  }

  function exportCSV() {
    if (records.length === 0) { showToast('No records to export.', 'warning'); return; }
    const headers = ['type', 'category', 'amount', 'date', 'description'];
    const csv = [headers.join(',')].concat(records.map((f) => headers.map((c) => csvCell(f[c])).join(','))).join('\n');
    downloadCSV(csv, 'finance_records_export.csv');
    showToast('Finance records exported.', 'success');
  }

  return (
    <>
      <div className="page-header">
        <div><h1>Finance</h1><p>Track income, expenses, and profitability</p></div>
        <div className="d-flex gap-16 flex-wrap">
          <button className="btn btn-secondary" onClick={exportCSV}><i className="fas fa-file-export"></i> Export CSV</button>
          <button className="btn btn-primary" onClick={openAdd}><i className="fas fa-plus"></i> Add Record</button>
        </div>
      </div>

      <div className="finance-summary">
        <div className="finance-card"><h4>Monthly Income</h4><div className="amount income">${summary.totalIncome.toLocaleString()}</div></div>
        <div className="finance-card"><h4>Monthly Expenses</h4><div className="amount expense">${summary.totalExpense.toLocaleString()}</div></div>
        <div className="finance-card"><h4>Profit / Loss</h4><div className={`amount ${summary.pl >= 0 ? 'profit' : 'loss'}`}>${summary.pl.toLocaleString()}</div></div>
      </div>

      <div className="tabs">
        <button className={`tab-btn${tab === 'all' ? ' active' : ''}`} onClick={() => setTab('all')}>All</button>
        <button className={`tab-btn${tab === 'income' ? ' active' : ''}`} onClick={() => setTab('income')}>Income</button>
        <button className={`tab-btn${tab === 'expense' ? ' active' : ''}`} onClick={() => setTab('expense')}>Expense</button>
      </div>

      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          <div className="table-wrapper">
            <table className="data-table">
              <thead><tr><th>Type</th><th>Category</th><th>Amount</th><th>Date</th><th>Description</th><th>Actions</th></tr></thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={6}><div className="empty-state"><i className="fas fa-receipt"></i><h3>No finance records</h3><p>Add an income or expense record.</p></div></td></tr>
                ) : filtered.map((f) => {
                  const desc = f.description || '';
                  return (
                    <tr key={f.id}>
                      <td><span className={`badge ${f.type === 'Income' ? 'badge-green' : 'badge-red'}`}><i className={`fas ${f.type === 'Income' ? 'fa-arrow-up' : 'fa-arrow-down'}`}></i> {f.type}</span></td>
                      <td>{f.category || '—'}</td>
                      <td className={`fw-600 ${f.type === 'Income' ? 'text-green' : 'text-red'}`}>{f.type === 'Income' ? '+' : '-'}${(f.amount || 0).toLocaleString()}</td>
                      <td>{fmtDate(f.date)}</td>
                      <td>{desc.substring(0, 40)}{desc.length > 40 ? '...' : ''}</td>
                      <td>
                        <div className="table-actions">
                          <button className="btn-icon" title="Edit" onClick={() => openEdit(f)}><i className="fas fa-pen-to-square"></i></button>
                          <button className="btn-icon danger" title="Delete" onClick={() => confirmDelete(f.id)}><i className="fas fa-trash"></i></button>
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
        open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? 'Edit Finance Record' : 'Add Finance Record'}
        footer={<><button className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button><button className="btn btn-primary" onClick={save}><i className="fas fa-check"></i> Save</button></>}
      >
        {!editingId && <LocationCaptureBadge geo={geo} />}
        <div className="form-row">
          <div className="form-group">
            <label>Type *</label>
            <select className="form-control" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option value="Income">Income</option><option value="Expense">Expense</option>
            </select>
          </div>
          <div className="form-group"><label>Amount ($) *</label><input type="number" className="form-control" placeholder="0.00" step="0.01" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
        </div>
        <div className="form-group">
          <label>Category</label>
          <select className="form-control" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            <option value="">Select category</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="form-group"><label>Date</label><input type="date" className="form-control" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
        <div className="form-group"><label>Description</label><textarea className="form-control" placeholder="Details about this transaction..." value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
      </Modal>

      <Modal
        open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Confirm Delete" maxWidth={420}
        footer={<><button className="btn btn-secondary" onClick={() => setDeleteOpen(false)}>Cancel</button><button className="btn btn-danger" onClick={doDelete}><i className="fas fa-trash"></i> Delete</button></>}
      >
        <p className="text-muted">Are you sure you want to delete this finance record?</p>
      </Modal>
    </>
  );
}
