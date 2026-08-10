import { useEffect, useMemo, useState } from 'react';
import { useApi } from '../lib/api.js';
import { useToast } from '../lib/toast.jsx';
import { useTopbarSearch } from '../lib/topbarSearch.jsx';
import { fmtDate, downloadCSV, csvCell } from '../lib/badges.jsx';
import Modal from '../components/Modal.jsx';

const EMPTY_FORM = { tag_id: '', production_type: 'Milk', quantity: '', unit: 'liters', production_date: '', notes: '' };
const TYPE_ICON = { Milk: 'fa-glass-water', Eggs: 'fa-egg', Meat: 'fa-drumstick-bite' };
const TYPE_BADGE = { Milk: 'badge-blue', Eggs: 'badge-orange', Meat: 'badge-green' };
const UNIT_MAP = { Milk: 'liters', Eggs: 'units', Meat: 'kg' };

export default function Production() {
  const api = useApi();
  const showToast = useToast();

  const [records, setRecords] = useState([]);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  useTopbarSearch('Search production...', setSearch);

  async function load() {
    const { data, error } = await api.list('production_records', { order: 'production_date.desc' });
    if (error) { showToast('Failed to load production records.', 'error'); return; }
    setRecords(data || []);
  }
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = records.filter((p) => {
    const q = search.toLowerCase();
    const matchSearch = !q || (p.tag_id || '').toLowerCase().includes(q) || (p.production_type || '').toLowerCase().includes(q);
    const matchType = !typeFilter || p.production_type === typeFilter;
    return matchSearch && matchType;
  });

  const summary = useMemo(() => {
    const now = new Date();
    const thisMonth = records.filter((p) => { const d = new Date(p.production_date); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); });
    const milk = thisMonth.filter((p) => p.production_type === 'Milk').reduce((s, p) => s + (p.quantity || 0), 0);
    const eggs = thisMonth.filter((p) => p.production_type === 'Eggs').reduce((s, p) => s + (p.quantity || 0), 0);
    const meat = thisMonth.filter((p) => p.production_type === 'Meat').reduce((s, p) => s + (p.quantity || 0), 0);
    return { milk, eggs, meat };
  }, [records]);

  function openAdd() { setEditingId(null); setForm(EMPTY_FORM); setModalOpen(true); }
  function openEdit(p) {
    setEditingId(p.id);
    setForm({ tag_id: p.tag_id || '', production_type: p.production_type || 'Milk', quantity: p.quantity ?? '', unit: p.unit || 'liters', production_date: p.production_date || '', notes: p.notes || '' });
    setModalOpen(true);
  }

  async function save() {
    if (!form.production_type) { showToast('Production type is required.', 'error'); return; }
    const payload = { ...form, quantity: parseFloat(form.quantity) || 0 };
    if (editingId) {
      const { error } = await api.update('production_records', editingId, payload);
      if (error) { showToast('Update failed.', 'error'); return; }
      showToast('Production record updated.', 'success');
    } else {
      const { error } = await api.insert('production_records', [payload]);
      if (error) { showToast('Insert failed.', 'error'); return; }
      showToast('Production record added.', 'success');
    }
    setModalOpen(false);
    await load();
  }

  function confirmDelete(id) { setDeletingId(id); setDeleteOpen(true); }
  async function doDelete() {
    if (!deletingId) return;
    const { error } = await api.remove('production_records', deletingId);
    if (error) { showToast('Delete failed.', 'error'); return; }
    showToast('Production record deleted.', 'success');
    setDeleteOpen(false);
    await load();
  }

  function exportCSV() {
    if (records.length === 0) { showToast('No records to export.', 'warning'); return; }
    const headers = ['tag_id', 'production_type', 'quantity', 'unit', 'production_date', 'notes'];
    const csv = [headers.join(',')].concat(records.map((p) => headers.map((c) => csvCell(p[c])).join(','))).join('\n');
    downloadCSV(csv, 'production_records_export.csv');
    showToast('Production records exported.', 'success');
  }

  return (
    <>
      <div className="page-header">
        <div><h1>Production</h1><p>Track milk, eggs, meat, and other output</p></div>
        <div className="d-flex gap-16 flex-wrap">
          <button className="btn btn-secondary" onClick={exportCSV}><i className="fas fa-file-export"></i> Export CSV</button>
          <button className="btn btn-primary" onClick={openAdd}><i className="fas fa-plus"></i> Add Record</button>
        </div>
      </div>

      <div className="finance-summary">
        <div className="finance-card"><h4>Milk (This Month)</h4><div className="amount income">{summary.milk.toFixed(1)} L</div></div>
        <div className="finance-card"><h4>Eggs (This Month)</h4><div className="amount" style={{ color: 'var(--orange)' }}>{summary.eggs} units</div></div>
        <div className="finance-card"><h4>Meat (This Month)</h4><div className="amount" style={{ color: 'var(--primary)' }}>{summary.meat.toFixed(1)} kg</div></div>
      </div>

      <div className="filter-bar">
        <select className="form-control" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="">All Types</option><option value="Milk">Milk</option><option value="Eggs">Eggs</option><option value="Meat">Meat</option>
        </select>
      </div>

      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          <div className="table-wrapper">
            <table className="data-table">
              <thead><tr><th>Type</th><th>Tag ID</th><th>Quantity</th><th>Date</th><th>Notes</th><th>Actions</th></tr></thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={6}><div className="empty-state"><i className="fas fa-gauge-high"></i><h3>No production records</h3><p>Start tracking your production output.</p></div></td></tr>
                ) : filtered.map((p) => {
                  const notes = p.notes || '';
                  return (
                    <tr key={p.id}>
                      <td><span className={`badge ${TYPE_BADGE[p.production_type] || 'badge-green'}`}><i className={`fas ${TYPE_ICON[p.production_type] || 'fa-box'}`}></i> {p.production_type}</span></td>
                      <td>{p.tag_id || '—'}</td>
                      <td className="fw-600">{p.quantity || 0} {p.unit || ''}</td>
                      <td>{fmtDate(p.production_date)}</td>
                      <td>{notes.substring(0, 35)}{notes.length > 35 ? '...' : ''}</td>
                      <td>
                        <div className="table-actions">
                          <button className="btn-icon" title="Edit" onClick={() => openEdit(p)}><i className="fas fa-pen-to-square"></i></button>
                          <button className="btn-icon danger" title="Delete" onClick={() => confirmDelete(p.id)}><i className="fas fa-trash"></i></button>
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
        open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? 'Edit Production Record' : 'Add Production Record'}
        footer={<><button className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button><button className="btn btn-primary" onClick={save}><i className="fas fa-check"></i> Save</button></>}
      >
        <div className="form-row">
          <div className="form-group">
            <label>Production Type *</label>
            <select className="form-control" value={form.production_type} onChange={(e) => setForm({ ...form, production_type: e.target.value, unit: UNIT_MAP[e.target.value] || 'units' })}>
              <option value="Milk">Milk</option><option value="Eggs">Eggs</option><option value="Meat">Meat</option>
            </select>
          </div>
          <div className="form-group"><label>Animal Tag ID</label><input type="text" className="form-control" placeholder="e.g. COW-001" value={form.tag_id} onChange={(e) => setForm({ ...form, tag_id: e.target.value })} /></div>
        </div>
        <div className="form-row">
          <div className="form-group"><label>Quantity</label><input type="number" className="form-control" placeholder="0" step="0.1" min="0" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></div>
          <div className="form-group">
            <label>Unit</label>
            <select className="form-control" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>
              <option value="liters">liters</option><option value="units">units</option><option value="kg">kg</option>
            </select>
          </div>
        </div>
        <div className="form-group"><label>Production Date</label><input type="date" className="form-control" value={form.production_date} onChange={(e) => setForm({ ...form, production_date: e.target.value })} /></div>
        <div className="form-group"><label>Notes</label><textarea className="form-control" placeholder="Additional notes..." value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
      </Modal>

      <Modal
        open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Confirm Delete" maxWidth={420}
        footer={<><button className="btn btn-secondary" onClick={() => setDeleteOpen(false)}>Cancel</button><button className="btn btn-danger" onClick={doDelete}><i className="fas fa-trash"></i> Delete</button></>}
      >
        <p className="text-muted">Are you sure you want to delete this production record?</p>
      </Modal>
    </>
  );
}
