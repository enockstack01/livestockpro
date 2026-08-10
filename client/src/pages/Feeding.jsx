import { useEffect, useMemo, useState } from 'react';
import { useApi } from '../lib/api.js';
import { useToast } from '../lib/toast.jsx';
import { useTopbarSearch } from '../lib/topbarSearch.jsx';
import { fmtDate } from '../lib/badges.jsx';
import Modal from '../components/Modal.jsx';

const EMPTY_FORM = { feed_type: '', quantity: '', unit: 'kg', cost: '', feeding_date: '', animal_group: '', notes: '' };

export default function Feeding() {
  const api = useApi();
  const showToast = useToast();

  const [records, setRecords] = useState([]);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  useTopbarSearch('Search feeding records...', setSearch);

  async function load() {
    const { data, error } = await api.list('feeding_records', { order: 'feeding_date.desc' });
    if (error) { showToast('Failed to load feeding records.', 'error'); return; }
    setRecords(data || []);
  }
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = records.filter((f) => {
    const q = search.toLowerCase();
    return !q || (f.feed_type || '').toLowerCase().includes(q) || (f.animal_group || '').toLowerCase().includes(q);
  });

  const lowStockAlerts = useMemo(() => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recent = records.filter((f) => new Date(f.feeding_date) >= thirtyDaysAgo);
    const groups = {};
    recent.forEach((f) => {
      if (!groups[f.feed_type]) groups[f.feed_type] = { totalQty: 0, count: 0 };
      groups[f.feed_type].totalQty += f.quantity || 0;
      groups[f.feed_type].count++;
    });
    return Object.entries(groups).filter(([, info]) => info.count <= 2).map(([type, info]) => ({ type, count: info.count }));
  }, [records]);

  function openAdd() { setEditingId(null); setForm(EMPTY_FORM); setModalOpen(true); }
  function openEdit(f) {
    setEditingId(f.id);
    setForm({ feed_type: f.feed_type || '', quantity: f.quantity ?? '', unit: f.unit || 'kg', cost: f.cost ?? '', feeding_date: f.feeding_date || '', animal_group: f.animal_group || '', notes: f.notes || '' });
    setModalOpen(true);
  }

  async function save() {
    if (!form.feed_type) { showToast('Feed type is required.', 'error'); return; }
    const payload = { ...form, quantity: parseFloat(form.quantity) || 0, cost: parseFloat(form.cost) || 0 };
    if (editingId) {
      const { error } = await api.update('feeding_records', editingId, payload);
      if (error) { showToast('Update failed.', 'error'); return; }
      showToast('Feeding record updated.', 'success');
    } else {
      const { error } = await api.insert('feeding_records', [payload]);
      if (error) { showToast('Insert failed.', 'error'); return; }
      showToast('Feeding record added.', 'success');
    }
    setModalOpen(false);
    await load();
  }

  function confirmDelete(id) { setDeletingId(id); setDeleteOpen(true); }
  async function doDelete() {
    if (!deletingId) return;
    const { error } = await api.remove('feeding_records', deletingId);
    if (error) { showToast('Delete failed.', 'error'); return; }
    showToast('Feeding record deleted.', 'success');
    setDeleteOpen(false);
    await load();
  }

  return (
    <>
      <div className="page-header">
        <div><h1>Feeding</h1><p>Track feed consumption and costs</p></div>
        <button className="btn btn-primary" onClick={openAdd}><i className="fas fa-plus"></i> Add Record</button>
      </div>

      <div className="card mb-24">
        <div className="card-header"><h3><i className="fas fa-triangle-exclamation text-orange"></i> Stock Alerts</h3></div>
        <div className="card-body">
          {lowStockAlerts.length === 0
            ? <span className="badge badge-green"><i className="fas fa-check"></i> All feed levels look normal</span>
            : lowStockAlerts.map(({ type, count }) => (
              <span key={type} className="badge badge-orange" style={{ marginRight: 8 }}><i className="fas fa-exclamation-triangle"></i> {type} — low usage detected ({count} records in 30 days)</span>
            ))}
        </div>
      </div>

      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          <div className="table-wrapper">
            <table className="data-table">
              <thead><tr><th>Feed Type</th><th>Quantity</th><th>Cost</th><th>Feeding Date</th><th>Animal/Group</th><th>Notes</th><th>Actions</th></tr></thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={7}><div className="empty-state"><i className="fas fa-wheat-awn"></i><h3>No feeding records</h3><p>Log your first feeding record.</p></div></td></tr>
                ) : filtered.map((f) => (
                  <tr key={f.id}>
                    <td className="fw-600">{f.feed_type}</td>
                    <td>{f.quantity || '—'} {f.unit || ''}</td>
                    <td>${(f.cost || 0).toFixed(2)}</td>
                    <td>{fmtDate(f.feeding_date)}</td>
                    <td>{f.animal_group || '—'}</td>
                    <td>{f.notes || '—'}</td>
                    <td>
                      <div className="table-actions">
                        <button className="btn-icon" title="Edit" onClick={() => openEdit(f)}><i className="fas fa-pen-to-square"></i></button>
                        <button className="btn-icon danger" title="Delete" onClick={() => confirmDelete(f.id)}><i className="fas fa-trash"></i></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <Modal
        open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? 'Edit Feeding Record' : 'Add Feeding Record'}
        footer={<><button className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button><button className="btn btn-primary" onClick={save}><i className="fas fa-check"></i> Save</button></>}
      >
        <div className="form-group"><label>Feed Type *</label><input type="text" className="form-control" placeholder="e.g. Hay, Grain, Silage" value={form.feed_type} onChange={(e) => setForm({ ...form, feed_type: e.target.value })} /></div>
        <div className="form-row">
          <div className="form-group"><label>Quantity</label><input type="number" className="form-control" placeholder="0" step="0.1" min="0" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></div>
          <div className="form-group">
            <label>Unit</label>
            <select className="form-control" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>
              <option value="kg">kg</option><option value="lbs">lbs</option><option value="tons">tons</option><option value="bags">bags</option>
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group"><label>Cost ($)</label><input type="number" className="form-control" placeholder="0.00" step="0.01" min="0" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} /></div>
          <div className="form-group"><label>Feeding Date</label><input type="date" className="form-control" value={form.feeding_date} onChange={(e) => setForm({ ...form, feeding_date: e.target.value })} /></div>
        </div>
        <div className="form-group"><label>Animal / Group</label><input type="text" className="form-control" placeholder="e.g. All Cattle, Pen B" value={form.animal_group} onChange={(e) => setForm({ ...form, animal_group: e.target.value })} /></div>
        <div className="form-group"><label>Notes</label><textarea className="form-control" placeholder="Additional notes..." value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
      </Modal>

      <Modal
        open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Confirm Delete" maxWidth={420}
        footer={<><button className="btn btn-secondary" onClick={() => setDeleteOpen(false)}>Cancel</button><button className="btn btn-danger" onClick={doDelete}><i className="fas fa-trash"></i> Delete</button></>}
      >
        <p className="text-muted">Are you sure you want to delete this feeding record?</p>
      </Modal>
    </>
  );
}
